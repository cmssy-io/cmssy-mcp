import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";

async function svgFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cms-1166-"));
  const path = join(dir, "logo.svg");
  await writeFile(path, "<svg/>");
  return path;
}

function clientWith(defaultLanguage: string | null) {
  const updates: Array<Record<string, unknown>> = [];
  const query = vi.fn(async (document: string, variables?: unknown) => {
    if (document.includes("authorizeUpload")) {
      return {
        media: {
          authorizeUpload: {
            pathname: "ws/logo.svg",
            uploadUrl: "https://upload.test/put",
          },
        },
      };
    }
    if (document.includes("upload(")) {
      return {
        media: {
          upload: {
            id: "68b0a1c2d3e4f5061728394a",
            url: "https://assets.test/ws/logo.svg",
            filename: "logo.svg",
            type: "image",
            mimeType: "image/svg+xml",
            size: 6,
          },
        },
      };
    }
    if (document.includes("siteConfig")) {
      return {
        siteConfig: {
          get: defaultLanguage === null ? null : { defaultLanguage },
        },
      };
    }
    if (document.includes("update(")) {
      updates.push(variables as Record<string, unknown>);
      return { media: { update: { id: "68b0a1c2d3e4f5061728394a" } } };
    }
    throw new Error(`unexpected document: ${document.slice(0, 40)}`);
  });
  return { client: { query } as never, updates };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("upload_media writes alt under the workspace's own language", () => {
  it("uses the site config's default language, not English", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
    const { client, updates } = clientWith("pl");
    const ops = createMcpWorkspaceOps(client);

    await ops.media.upload({ filePath: await svgFile(), alt: "Logo firmy" });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      input: { alt: { pl: "Logo firmy" } },
    });
  });

  it("falls back to English only when the workspace names no language", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
    const { client, updates } = clientWith(null);
    const ops = createMcpWorkspaceOps(client);

    await ops.media.upload({ filePath: await svgFile(), alt: "Company logo" });

    expect(updates[0]).toMatchObject({
      input: { alt: { en: "Company logo" } },
    });
  });

  it("asks for no update at all when no alt was given", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
    const { client, updates } = clientWith("pl");
    const ops = createMcpWorkspaceOps(client);

    await ops.media.upload({ filePath: await svgFile() });

    expect(updates).toEqual([]);
  });
});
