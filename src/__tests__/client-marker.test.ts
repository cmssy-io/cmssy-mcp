import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CmssyClient } from "../graphql-client.js";
import {
  CLIENT_HEADER,
  TOOL_HEADER,
  clientHeaders,
  runAsTool,
} from "../client-marker.js";
import { PACKAGE_VERSION } from "../package-version.js";

function fetchRecordingHeaders() {
  const seen: Array<Record<string, string>> = [];
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    seen.push(init.headers as Record<string, string>);
    return {
      ok: true,
      json: async () => ({ data: { ok: true } }),
    } as unknown as Response;
  });
  return { fetch, seen };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the client marker the backend reads (CMS-1865)", () => {
  it("names the server and its version on every request", () => {
    expect(clientHeaders("1.2.3")).toEqual({
      [CLIENT_HEADER]: "mcp-server/1.2.3",
    });
  });

  it("names the tool on the first request of a tool call and stays quiet on the rest", async () => {
    const inside = await runAsTool("list_pages", async () => [
      clientHeaders("1.2.3"),
      clientHeaders("1.2.3"),
    ]);

    expect(inside[0][TOOL_HEADER]).toBe("list_pages");
    expect(inside[1]).not.toHaveProperty(TOOL_HEADER);
  });

  it("keeps two overlapping tool calls apart", async () => {
    const [a, b] = await Promise.all([
      runAsTool("list_pages", async () => {
        await new Promise((r) => setTimeout(r, 5));
        return clientHeaders("1.2.3");
      }),
      runAsTool("get_page", async () => clientHeaders("1.2.3")),
    ]);

    expect(a[TOOL_HEADER]).toBe("list_pages");
    expect(b[TOOL_HEADER]).toBe("get_page");
  });

  it("sends the marker with the GraphQL request, next to the token and workspace", async () => {
    const { fetch, seen } = fetchRecordingHeaders();
    vi.stubGlobal("fetch", fetch);
    const client = new CmssyClient("https://api.example", "cs_x", "ws-1");

    await runAsTool("get_page", () => client.query("{ ok }"));
    await client.query("{ ok }");

    expect(seen[0]).toMatchObject({
      Authorization: "Bearer cs_x",
      "x-workspace-id": "ws-1",
      [CLIENT_HEADER]: `mcp-server/${PACKAGE_VERSION}`,
      [TOOL_HEADER]: "get_page",
    });
    expect(seen[1]).toMatchObject({
      [CLIENT_HEADER]: `mcp-server/${PACKAGE_VERSION}`,
    });
    expect(seen[1]).not.toHaveProperty(TOOL_HEADER);
  });

  it("reads the version the package actually ships, not the fallback", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const shipped = JSON.parse(
      readFileSync(resolve(here, "../../package.json"), "utf8"),
    ).version as string;

    expect(PACKAGE_VERSION).toBe(shipped);
    expect(PACKAGE_VERSION).not.toBe("0.0.0");
  });
});
