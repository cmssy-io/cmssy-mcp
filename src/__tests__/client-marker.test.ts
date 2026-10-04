import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CmssyClient } from "../graphql-client.js";
import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import {
  CALL_START_HEADER,
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

  it("names the tool on every request of a tool call and marks only the first as its start (CMS-2004)", async () => {
    const inside = await runAsTool("update_page_settings", async () => [
      clientHeaders("1.2.3"),
      clientHeaders("1.2.3"),
    ]);

    expect(
      inside.map((headers) => headers[TOOL_HEADER]),
      "the backend writes the audit entry on the request that mutates, which for a read-modify-write tool is never the first one",
    ).toEqual(["update_page_settings", "update_page_settings"]);
    expect(
      inside.map((headers) => headers[CALL_START_HEADER]),
      "the tool-call analytics event is one per call, so exactly one request has to say it opened the call",
    ).toEqual(["1", "0"]);
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

  it("names the tool on the write a read-modify-write tool audits (CMS-2004)", async () => {
    const seen: Array<{
      query: string;
      headers: Record<string, string>;
    }> = [];
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const { query } = JSON.parse(init.body as string) as { query: string };
      seen.push({ query, headers: init.headers as Record<string, string> });
      return {
        ok: true,
        json: async () => ({
          data: /^\s*mutation/.test(query)
            ? { page: { updateSettings: { id: "p-1" } } }
            : { page: { get: { id: "p-1", version: 7 } } },
        }),
      } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetch);
    const ops = createMcpWorkspaceOps(
      new CmssyClient("https://api.example", "cs_x", "ws-1"),
    );

    await runAsTool("update_page_settings", () =>
      ops.pages.updateSettings("p-1", { name: "Plans" }),
    );

    expect(seen.map(({ query }) => /^\s*mutation/.test(query))).toEqual([
      false,
      true,
    ]);
    expect(
      seen[1]!.headers[TOOL_HEADER],
      "measured blank on production 2026-10-02: the version read took the announcement and the write that the backend audits went out unnamed",
    ).toBe("update_page_settings");
    expect([
      seen[0]!.headers[CALL_START_HEADER],
      seen[1]!.headers[CALL_START_HEADER],
    ]).toEqual(["1", "0"]);
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
