import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import { PAGE_BY_ID_QUERY, DEV_DRAFT_QUERY } from "../queries.js";
import type { CmssyClient } from "../graphql-client.js";

type Sent = { document: string; variables: Record<string, unknown> };

const HEADER = {
  id: "b1",
  type: "header",
  region: "header",
  order: 0,
  isActive: true,
  content: { en: { navigation: [{ label: "Docs" }] } },
  settings: {},
  style: null,
  advanced: null,
  shared: {
    logo: "logo-1",
    navigation: [{ columns: "3", children: [{ url: "/docs", icon: "Code" }] }],
  },
  translations: { en: { status: "completed" } },
  defaultLanguage: "en",
  metadata: null,
  blockVersion: null,
};

function pageClient() {
  const sent: Sent[] = [];
  const query = vi.fn(async (document: string, variables?: unknown) => {
    sent.push({ document, variables: (variables ?? {}) as Record<string, unknown> });
    if (document.includes("updateLayout")) {
      return { page: { updateLayout: { id: "p1", blockWarnings: null } } };
    }
    if (document.includes("resolvedLayouts")) {
      return { page: { resolvedLayouts: [] } };
    }
    return {
      page: {
        get: {
          id: "p1",
          name: "Page",
          slug: "/page",
          version: 3,
          blocks: [],
          layoutBlocks: [HEADER],
        },
      },
    };
  });
  return { client: { query } as unknown as CmssyClient, sent };
}

describe("the shared bucket survives a round trip through MCP (CMS-1792)", () => {
  it("asks for shared on every block selection", () => {
    for (const document of [PAGE_BY_ID_QUERY, DEV_DRAFT_QUERY]) {
      const selections = document.match(/advanced/g) ?? [];
      expect(selections.length).toBeGreaterThan(0);
      expect((document.match(/shared/g) ?? []).length).toBe(selections.length);
    }
  });

  it("writes the stored shared bucket back untouched", async () => {
    const { client, sent } = pageClient();
    const ops = createMcpWorkspaceOps(client);

    await ops.pages.updateBlock(
      "p1",
      "b1",
      { en: { navigation: [{ label: "Dokumentacja" }] } },
      undefined,
      "merge",
      undefined,
    );

    const write = sent.find((s) => s.document.includes("updateLayout"));
    const written = (
      write?.variables.input as { layoutBlocks: Array<Record<string, unknown>> }
    ).layoutBlocks[0]!;
    expect(written.shared).toEqual(HEADER.shared);
  });
});
