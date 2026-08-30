import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import { createServer } from "../server.js";
import type { CmssyClient } from "../graphql-client.js";
import {
  mergeRegionSettings,
  updateRegionSettings,
} from "../region-settings.js";

type Sent = { document: string; variables: Record<string, unknown> };

function clientRecording(
  respond: (document: string, variables: Record<string, unknown>) => unknown,
) {
  const sent: Sent[] = [];
  const query = vi.fn(async (document: string, variables?: unknown) => {
    const vars = (variables ?? {}) as Record<string, unknown>;
    sent.push({ document, variables: vars });
    return respond(document, vars);
  });
  return { client: { query } as unknown as CmssyClient, sent };
}

const existing = [
  { position: "header", values: { variant: "dark" } },
  { position: "sidebar", values: { width: "narrow" } },
];

function pageReadThenWrite(
  write: (vars: Record<string, unknown>) => unknown = (vars) => {
    const input = vars.input as { settings: unknown };
    return {
      page: {
        updateLayoutPositionSettings: {
          id: "p1",
          version: 8,
          blockWarnings: null,
          hasUnpublishedLayoutChanges: true,
          updatedAt: "2026-08-30T10:00:00.000Z",
          layoutPositionSettings: input.settings,
        },
      },
    };
  },
) {
  return clientRecording((document, vars) => {
    if (document.includes("mutation UpdateLayoutPositionSettings"))
      return write(vars);
    if (document.includes("query PageRegionSettings"))
      return {
        page: {
          get: { id: "p1", version: 7, layoutPositionSettings: existing },
        },
      };
    throw new Error(`unexpected document: ${document.slice(0, 40)}`);
  });
}

describe("mergeRegionSettings", () => {
  it("replaces only the named region and keeps the others", () => {
    expect(mergeRegionSettings(existing, "sidebar", { width: "wide" })).toEqual(
      [
        { position: "header", values: { variant: "dark" } },
        { position: "sidebar", values: { width: "wide" } },
      ],
    );
  });

  it("appends a region the page had no settings for", () => {
    expect(mergeRegionSettings(existing, "footer", { columns: 3 })).toEqual([
      ...existing,
      { position: "footer", values: { columns: 3 } },
    ]);
  });
});

describe("update_region_settings (CMS-1710)", () => {
  it("reads first, then sends the full merged list with the version it read", async () => {
    const { client, sent } = pageReadThenWrite();

    const result = await updateRegionSettings(client, {
      pageId: "p1",
      region: "sidebar",
      values: { width: "wide" },
    });

    expect(sent.map((s) => s.document.includes("mutation"))).toEqual([
      false,
      true,
    ]);
    expect(sent[0].variables).toEqual({ pageId: "p1" });
    expect(sent[1].variables).toStrictEqual({
      input: {
        pageId: "p1",
        expectedVersion: 7,
        settings: [
          { position: "header", values: { variant: "dark" } },
          { position: "sidebar", values: { width: "wide" } },
        ],
      },
    });
    expect(result).toStrictEqual({
      id: "p1",
      version: 8,
      region: "sidebar",
      regionSettings: [
        { position: "header", values: { variant: "dark" } },
        { position: "sidebar", values: { width: "wide" } },
      ],
      hasUnpublishedLayoutChanges: true,
      updatedAt: "2026-08-30T10:00:00.000Z",
    });
  });

  it("prefers the caller's expectedVersion over the one it read", async () => {
    const { client, sent } = pageReadThenWrite();

    await updateRegionSettings(client, {
      pageId: "p1",
      region: "sidebar",
      values: {},
      expectedVersion: 3,
    });

    expect(
      (sent[1].variables.input as { expectedVersion: number }).expectedVersion,
    ).toBe(3);
  });

  it("surfaces blockWarnings from the write", async () => {
    const { client } = pageReadThenWrite((vars) => ({
      page: {
        updateLayoutPositionSettings: {
          id: "p1",
          version: 8,
          blockWarnings: ["sidebar.width: expected one of narrow|wide"],
          hasUnpublishedLayoutChanges: true,
          updatedAt: null,
          layoutPositionSettings: (vars.input as { settings: unknown })
            .settings,
        },
      },
    }));

    const result = await updateRegionSettings(client, {
      pageId: "p1",
      region: "sidebar",
      values: { width: "huge" },
    });

    expect(result.blockWarnings).toEqual([
      "sidebar.width: expected one of narrow|wide",
    ]);
  });

  it("passes the backend's BAD_USER_INPUT message through verbatim", async () => {
    const message =
      'Unknown setting "colour" for region "sidebar" (allowed: width)';
    const { client } = pageReadThenWrite(() => {
      throw new Error(message);
    });

    await expect(
      updateRegionSettings(client, {
        pageId: "p1",
        region: "sidebar",
        values: { colour: "red" },
      }),
    ).rejects.toThrow(message);
  });

  it("refuses to write when the page does not exist", async () => {
    const { client, sent } = clientRecording(() => ({ page: { get: null } }));

    await expect(
      updateRegionSettings(client, {
        pageId: "missing",
        region: "sidebar",
        values: {},
      }),
    ).rejects.toThrow("Page not found");
    expect(sent).toHaveLength(1);
  });

  it("is registered on the server", () => {
    const server = createServer({ query: vi.fn() } as unknown as CmssyClient);
    const registered = (
      server as unknown as { _registeredTools: Record<string, unknown> }
    )._registeredTools;

    expect(Object.keys(registered)).toContain("update_region_settings");
  });
});

describe("get_page region settings (CMS-1710)", () => {
  it("returns the page's own region settings and the resolved (inherited) ones", async () => {
    const resolved = [
      {
        position: "sidebar",
        isInherited: true,
        sourcePageId: "docs",
        settings: { width: "narrow" },
        settingsAreInherited: true,
        settingsSourcePageId: "docs",
      },
    ];
    const { client, sent } = clientRecording((document) => {
      if (document.includes("query PageResolvedLayouts"))
        return { page: { resolvedLayouts: resolved } };
      return {
        page: {
          get: {
            id: "p1",
            name: "Page",
            slug: "/page",
            layoutPositionSettings: [
              { position: "header", values: { variant: "dark" } },
            ],
          },
        },
      };
    });
    const ops = createMcpWorkspaceOps(client);

    const page = (await ops.pages.get("p1")) as unknown as Record<
      string,
      unknown
    >;

    expect(sent[0].document).toContain(
      "layoutPositionSettings { position values }",
    );
    expect(page.regionSettings).toEqual([
      { position: "header", values: { variant: "dark" } },
    ]);
    expect(page.resolvedRegions).toEqual(resolved);
  });
});
