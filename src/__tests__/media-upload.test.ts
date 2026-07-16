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
  return vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: new Headers(
      init.contentType === null ? {} : { "content-type": init.contentType! },
    ),
    arrayBuffer: () => Promise.resolve(body.buffer.slice(0)),
  });
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
