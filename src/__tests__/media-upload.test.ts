import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mediaTypeFromMime,
  mimeFromFilename,
  resolveUploadSource,
} from "../media-upload.js";

function fetchResponding(init: {
  ok?: boolean;
  status?: number;
  contentType?: string | null;
  body?: Uint8Array;
}) {
  const body = init.body ?? new TextEncoder().encode("<svg/>");
  const status = init.status ?? (init.ok === false ? 404 : 200);
  return vi.fn().mockResolvedValue(
    new Response(body, {
      status,
      headers:
        init.contentType === null ? {} : { "content-type": init.contentType! },
    }),
  );
}

describe("mimeFromFilename", () => {
  it("maps known extensions case-insensitively", () => {
    expect(mimeFromFilename("logo.SVG")).toBe("image/svg+xml");
    expect(mimeFromFilename("doc.pdf")).toBe("application/pdf");
  });

  it("returns undefined for unknown extensions", () => {
    expect(mimeFromFilename("archive.tar.zst")).toBeUndefined();
  });
});

describe("mediaTypeFromMime", () => {
  it("buckets mime types like the backend", () => {
    expect(mediaTypeFromMime("image/png")).toBe("image");
    expect(mediaTypeFromMime("video/mp4")).toBe("video");
    expect(mediaTypeFromMime("audio/ogg")).toBe("audio");
    expect(mediaTypeFromMime("application/pdf")).toBe("document");
  });
});

describe("resolveUploadSource - filePath", () => {
  it("reads the file and infers mime from the name", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cmssy-upload-"));
    const filePath = join(dir, "mark.svg");
    await writeFile(filePath, "<svg/>");

    const result = await resolveUploadSource({ filePath });

    expect(result.filename).toBe("mark.svg");
    expect(result.mimeType).toBe("image/svg+xml");
    expect(result.bytes.toString()).toBe("<svg/>");
  });

  it("honors the filename override for mime inference", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cmssy-upload-"));
    const filePath = join(dir, "download.bin");
    await writeFile(filePath, "data");

    const result = await resolveUploadSource({
      filePath,
      filename: "photo.png",
    });

    expect(result.filename).toBe("photo.png");
    expect(result.mimeType).toBe("image/png");
  });

  it("fails loudly on a missing file", async () => {
    await expect(
      resolveUploadSource({ filePath: "/nope/missing.png" }),
    ).rejects.toThrow('Cannot read file "/nope/missing.png"');
  });

  it("rejects an empty file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cmssy-upload-"));
    const filePath = join(dir, "empty.png");
    await writeFile(filePath, "");

    await expect(resolveUploadSource({ filePath })).rejects.toThrow("is empty");
  });

  it("rejects an unknown extension", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cmssy-upload-"));
    const filePath = join(dir, "blob.weird");
    await writeFile(filePath, "data");

    await expect(resolveUploadSource({ filePath })).rejects.toThrow(
      "Cannot infer a mime type",
    );
  });
});

describe("resolveUploadSource - url", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the url and uses the content-type header", async () => {
    vi.stubGlobal("fetch", fetchResponding({ contentType: "image/svg+xml" }));

    const result = await resolveUploadSource({
      url: "https://example.com/brand/logo.svg?v=2",
    });

    expect(result.filename).toBe("logo.svg");
    expect(result.mimeType).toBe("image/svg+xml");
  });

  it("falls back to extension inference on octet-stream", async () => {
    vi.stubGlobal(
      "fetch",
      fetchResponding({ contentType: "application/octet-stream" }),
    );

    const result = await resolveUploadSource({
      url: "https://example.com/logo.svg",
    });

    expect(result.mimeType).toBe("image/svg+xml");
  });

  it("fails loudly on a non-2xx response", async () => {
    vi.stubGlobal("fetch", fetchResponding({ ok: false, status: 404 }));

    await expect(
      resolveUploadSource({ url: "https://example.com/missing.png" }),
    ).rejects.toThrow("HTTP 404");
  });
});

describe("resolveUploadSource - hosted policy (CMS-2095)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refuses a filePath when the policy forbids local files, even for a file that exists", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cmssy-upload-"));
    const filePath = join(dir, "logo.png");
    await writeFile(filePath, "png-bytes");
    const fetchUrl = vi.fn();

    await expect(
      resolveUploadSource({ filePath }, { allowFilePath: false, fetchUrl }),
    ).rejects.toThrow("cannot read local files");
    await expect(
      resolveUploadSource({ filePath }, { allowFilePath: true, fetchUrl }),
    ).resolves.toMatchObject({ filename: "logo.png" });
    expect(fetchUrl).not.toHaveBeenCalled();
  });

  it("fetches a url through the policy's fetch, not the global one", async () => {
    const globalFetch = vi.fn();
    vi.stubGlobal("fetch", globalFetch);
    const fetchUrl = vi.fn(() => Promise.reject(new Error("blocked by host")));

    await expect(
      resolveUploadSource(
        { url: "http://10.0.0.1/a.png" },
        { allowFilePath: false, fetchUrl },
      ),
    ).rejects.toThrow("blocked by host");
    expect(fetchUrl).toHaveBeenCalledWith("http://10.0.0.1/a.png");
    expect(globalFetch).not.toHaveBeenCalled();
  });
});

describe("resolveUploadSource - size cap while reading (CMS-2095)", () => {
  const limit = 50 * 1024 * 1024;

  it("refuses a declared content-length over the limit without reading the body", async () => {
    const pull = vi.fn();
    const response = new Response(new ReadableStream({ pull }, { highWaterMark: 0 }), {
      headers: { "content-length": String(limit + 1) },
    });

    await expect(
      resolveUploadSource(
        { url: "https://example.com/huge.bin" },
        { allowFilePath: false, fetchUrl: () => Promise.resolve(response) },
      ),
    ).rejects.toThrow("exceeds the upload limit");
    expect(pull).not.toHaveBeenCalled();
  });

  it("stops reading an undeclared stream as soon as it passes the limit", async () => {
    const chunk = new Uint8Array(8 * 1024 * 1024);
    let served = 0;
    const response = new Response(
      new ReadableStream({
        pull(controller) {
          served += chunk.byteLength;
          controller.enqueue(chunk);
        },
      }),
    );

    await expect(
      resolveUploadSource(
        { url: "https://example.com/endless.bin" },
        { allowFilePath: false, fetchUrl: () => Promise.resolve(response) },
      ),
    ).rejects.toThrow("exceeds the upload limit");
    expect(served).toBeLessThanOrEqual(limit + 2 * chunk.byteLength);
  });
});
