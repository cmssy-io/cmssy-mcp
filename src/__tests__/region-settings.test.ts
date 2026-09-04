import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import { createServer } from "../server.js";
import type { CmssyClient } from "../graphql-client.js";
import type { RegionSettingsEntry } from "../types.js";
import { PAGE_RESOLVED_LAYOUTS_QUERY } from "../queries.js";
import {
  mergeRegionSettings,
  parseLayoutRegions,
  pruneRegionSettings,
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

const manifestRegions = [
  { id: "header", settings: { variant: { type: "select" } } },
  { id: "sidebar", settings: { width: { type: "select" } } },
  { id: "footer" },
];

const existing: RegionSettingsEntry[] = [
  { region: "header", values: { variant: "dark" } },
  { region: "sidebar", values: { width: "narrow" } },
];

const serverEcho = (vars: Record<string, unknown>) => ({
  page: {
    updateLayout: {
      id: "p1",
      version: 8,
      blockWarnings: null,
      hasUnpublishedLayoutChanges: true,
      updatedAt: "2026-08-30T10:00:00.000Z",
      layoutRegionSettings: (vars.input as { layoutRegionSettings: unknown })
        .layoutRegionSettings,
    },
  },
});

function pageReadThenWrite(
  write: (vars: Record<string, unknown>) => unknown = serverEcho,
  stored: RegionSettingsEntry[] = existing,
  regions: unknown = manifestRegions,
) {
  return clientRecording((document, vars) => {
    if (document.includes("mutation UpdateLayoutRegionSettings"))
      return write(vars);
    if (document.includes("query PageRegionSettings"))
      return {
        page: { get: { id: "p1", version: 7, layoutRegionSettings: stored } },
      };
    if (document.includes("query LayoutRegions"))
      return { blockManifest: { get: { regions } } };
    throw new Error(`unexpected document: ${document.slice(0, 40)}`);
  });
}

function writeInput(sent: Sent[]) {
  const write = sent.find((s) => s.document.includes("mutation"));
  return write?.variables.input as {
    layoutRegionSettings: Array<{ region: string; values: unknown }>;
    expectedVersion?: number;
  };
}

describe("mergeRegionSettings", () => {
  it("replaces only the named region and keeps the others", () => {
    expect(mergeRegionSettings(existing, "sidebar", { width: "wide" })).toEqual(
      [
        { region: "header", values: { variant: "dark" } },
        { region: "sidebar", values: { width: "wide" } },
      ],
    );
  });

  it("appends a region the page had no settings for", () => {
    expect(mergeRegionSettings(existing, "footer", { columns: 3 })).toEqual([
      ...existing,
      { region: "footer", values: { columns: 3 } },
    ]);
  });
});

describe("pruneRegionSettings", () => {
  it("drops regions the manifest no longer declares", () => {
    expect(
      pruneRegionSettings(manifestRegions, [
        ...existing,
        { region: "promo", values: { text: "old" } },
      ]),
    ).toEqual(existing);
  });

  it("drops keys a region's schema no longer has", () => {
    expect(
      pruneRegionSettings(manifestRegions, [
        { region: "sidebar", values: { width: "wide", colour: "red" } },
      ]),
    ).toEqual([{ region: "sidebar", values: { width: "wide" } }]);
  });

  it("resets a region without a schema to empty values", () => {
    expect(
      pruneRegionSettings(manifestRegions, [
        { region: "footer", values: { columns: 3 } },
      ]),
    ).toEqual([{ region: "footer", values: {} }]);
  });
});

describe("parseLayoutRegions", () => {
  it("keeps only entries with a string id and an object schema", () => {
    expect(
      parseLayoutRegions([
        { id: "sidebar", settings: { width: {} } },
        { id: "header", settings: "nope" },
        { id: 3 },
        "header",
      ]),
    ).toEqual([{ id: "sidebar", settings: { width: {} } }, { id: "header" }]);
  });

  it("falls back to header/footer when the manifest declares none", () => {
    expect(parseLayoutRegions(null)).toEqual([
      { id: "header" },
      { id: "footer" },
    ]);
    expect(parseLayoutRegions([])).toEqual([
      { id: "header" },
      { id: "footer" },
    ]);
  });
});

describe("update_region_settings (CMS-1710)", () => {
  it("reads the page, then the manifest, then writes the full merged list with the version it read", async () => {
    const { client, sent } = pageReadThenWrite();

    const result = await updateRegionSettings(client, {
      pageId: "p1",
      region: "sidebar",
      values: { width: "wide" },
    });

    expect(
      sent.map((s) => /(query|mutation) (\w+)/.exec(s.document)?.[2]),
    ).toEqual([
      "PageRegionSettings",
      "LayoutRegions",
      "UpdateLayoutRegionSettings",
    ]);
    expect(sent[0].variables).toEqual({ pageId: "p1" });
    expect(
      sent[2].variables,
      "One page.updateLayout write carrying layoutRegionSettings (CMS-1672): the separate updateLayoutRegionSettings mutation is gone from the backend.",
    ).toStrictEqual({
      input: {
        pageId: "p1",
        expectedVersion: 7,
        layoutRegionSettings: [
          { region: "header", values: { variant: "dark" } },
          { region: "sidebar", values: { width: "wide" } },
        ],
      },
    });
    expect(sent[2].document).toContain("updateLayout(input: $input)");
    expect(result).toStrictEqual({
      id: "p1",
      version: 8,
      region: "sidebar",
      regionSettings: [
        { region: "header", values: { variant: "dark" } },
        { region: "sidebar", values: { width: "wide" } },
      ],
      hasUnpublishedLayoutChanges: true,
      updatedAt: "2026-08-30T10:00:00.000Z",
    });
  });

  it("returns the server's stored list, not the payload it sent", async () => {
    const stored = [
      { region: "header", values: { variant: "dark" } },
      { region: "sidebar", values: { width: "wide", normalised: true } },
    ];
    const { client } = pageReadThenWrite(() => ({
      page: {
        updateLayout: {
          id: "p1",
          version: 9,
          blockWarnings: null,
          hasUnpublishedLayoutChanges: true,
          updatedAt: null,
          layoutRegionSettings: stored,
        },
      },
    }));

    const result = await updateRegionSettings(client, {
      pageId: "p1",
      region: "sidebar",
      values: { width: "wide" },
    });

    expect(result.regionSettings).toBe(stored);
    expect(result.version).toBe(9);
  });

  it("drops a stored entry for a region the manifest no longer declares", async () => {
    const { client, sent } = pageReadThenWrite(serverEcho, [
      ...existing,
      { region: "promo", values: { text: "old" } },
    ]);

    await updateRegionSettings(client, {
      pageId: "p1",
      region: "sidebar",
      values: { width: "wide" },
    });

    expect(writeInput(sent).layoutRegionSettings.map((s) => s.region)).toEqual(
      ["header", "sidebar"],
    );
  });

  it("drops a stored key the region's schema no longer has, but sends the caller's values untouched", async () => {
    const { client, sent } = pageReadThenWrite(serverEcho, [
      { region: "header", values: { variant: "dark", gone: 1 } },
    ]);

    await updateRegionSettings(client, {
      pageId: "p1",
      region: "sidebar",
      values: { colour: "red" },
    });

    expect(writeInput(sent).layoutRegionSettings).toEqual([
      { region: "header", values: { variant: "dark" } },
      { region: "sidebar", values: { colour: "red" } },
    ]);
  });

  it("prunes against header/footer when the manifest declares no regions", async () => {
    const { client, sent } = pageReadThenWrite(
      serverEcho,
      [
        { region: "header", values: {} },
        { region: "sidebar", values: { width: "narrow" } },
      ],
      null,
    );

    await updateRegionSettings(client, {
      pageId: "p1",
      region: "footer",
      values: {},
    });

    expect(writeInput(sent).layoutRegionSettings).toEqual([
      { region: "header", values: {} },
      { region: "footer", values: {} },
    ]);
  });

  it("prefers the caller's expectedVersion over the one it read", async () => {
    const { client, sent } = pageReadThenWrite();

    await updateRegionSettings(client, {
      pageId: "p1",
      region: "sidebar",
      values: {},
      expectedVersion: 3,
    });

    expect(writeInput(sent).expectedVersion).toBe(3);
  });

  it("surfaces blockWarnings from the write", async () => {
    const { client } = pageReadThenWrite((vars) => ({
      page: {
        updateLayout: {
          ...serverEcho(vars).page.updateLayout,
          blockWarnings: ["sidebar.width: expected one of narrow|wide"],
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
      'Layout region "sidebar": unknown setting(s) colour - declared: width';
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

  it("is bound through the shared binder, so values given as a JSON string are accepted", async () => {
    const { client, sent } = pageReadThenWrite();
    const server = createServer(client);
    const tool = (
      server as unknown as {
        _registeredTools: Record<
          string,
          {
            inputSchema: { parse(input: unknown): unknown };
            handler: (
              args: unknown,
              extra: unknown,
            ) => Promise<{
              content: Array<{ text: string }>;
              isError?: boolean;
            }>;
          }
        >;
      }
    )._registeredTools.update_region_settings;

    const parsed = tool.inputSchema.parse({
      pageId: "p1",
      region: "sidebar",
      values: '{"width":"wide"}',
    });
    const out = await tool.handler(parsed, {});

    expect(out.isError).toBeUndefined();
    expect(writeInput(sent).layoutRegionSettings).toContainEqual({
      region: "sidebar",
      values: { width: "wide" },
    });
    expect(JSON.parse(out.content[0].text)).toMatchObject({
      region: "sidebar",
    });
  });
});

describe("get_page region settings (CMS-1710)", () => {
  const resolved = [
    {
      region: "sidebar",
      isInherited: true,
      sourcePageId: "docs",
      settings: { width: "narrow" },
      settingsAreInherited: true,
      settingsSourcePageId: "docs",
    },
  ];

  function pageClient() {
    return clientRecording((document, vars) => {
      if (document.includes("query PageResolvedLayouts")) {
        if (vars.pageId !== "p1") throw new Error("NOT_FOUND");
        return { page: { resolvedLayouts: resolved } };
      }
      if (vars.pageId === "missing") return { page: { get: null } };
      return {
        page: {
          get: {
            id: "p1",
            name: "Page",
            slug: "/page",
            layoutRegionSettings: [
              { region: "header", values: { variant: "dark" } },
            ],
          },
        },
      };
    });
  }

  it("returns the page's own region settings and the resolved (inherited) ones", async () => {
    const { client, sent } = pageClient();
    const ops = createMcpWorkspaceOps(client);

    const page = (await ops.pages.get("p1")) as unknown as Record<
      string,
      unknown
    >;

    expect(sent[0].document).toContain(
      "layoutRegionSettings { region values }",
    );
    expect(page.regionSettings).toEqual([
      { region: "header", values: { variant: "dark" } },
    ]);
    expect(page.resolvedRegions).toEqual(resolved);
  });

  it("resolves a slug to the page id before asking for resolved layouts", async () => {
    const { client, sent } = pageClient();
    const ops = createMcpWorkspaceOps(client);

    const page = (await ops.pages.get("page")) as unknown as Record<
      string,
      unknown
    >;

    expect(sent[1].document).toContain("query PageResolvedLayouts");
    expect(sent[1].variables).toEqual({ pageId: "p1" });
    expect(page.resolvedRegions).toEqual(resolved);
  });

  it("returns null for a missing page without asking for resolved layouts", async () => {
    const { client, sent } = pageClient();
    const ops = createMcpWorkspaceOps(client);

    expect(await ops.pages.get("missing")).toBeNull();
    expect(sent).toHaveLength(1);
  });

  it("selects the settings inheritance fields on resolved layouts", () => {
    expect(PAGE_RESOLVED_LAYOUTS_QUERY).toContain("settingsAreInherited");
    expect(PAGE_RESOLVED_LAYOUTS_QUERY).toContain("settingsSourcePageId");
    expect(PAGE_RESOLVED_LAYOUTS_QUERY).toContain("isInherited");
    expect(PAGE_RESOLVED_LAYOUTS_QUERY).toContain("sourcePageId");
  });
});
