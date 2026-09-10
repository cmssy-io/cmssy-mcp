import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import * as queries from "../queries.js";
import type { CmssyClient } from "../graphql-client.js";

type Sent = { document: string; variables: Record<string, unknown> };

const ROW = { label: "Docs", url: "/docs", icon: "Code" };

const HEADER = {
  id: "b1",
  type: "header",
  region: "header",
  order: 0,
  isActive: true,
  content: {
    en: { navigation: [ROW] },
    pl: { navigation: [{ ...ROW, label: "Dokumenty" }] },
  },
  settings: {},
  style: null,
  advanced: null,
  translations: { en: { status: "completed" }, pl: { status: "completed" } },
  defaultLanguage: "en",
  metadata: null,
  blockVersion: null,
};

function pageClient() {
  const sent: Sent[] = [];
  const query = vi.fn(async (document: string, variables?: unknown) => {
    sent.push({
      document,
      variables: (variables ?? {}) as Record<string, unknown>,
    });
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

function blockDocuments(): Array<[string, string]> {
  return Object.entries(queries).filter(
    ([, document]) =>
      typeof document === "string" && document.includes("advanced"),
  ) as Array<[string, string]>;
}

describe("MCP reads whole rows, not the storage split (CMS-1793)", () => {
  it("reads content folded on every block selection", () => {
    const documents = blockDocuments();
    expect(documents.length).toBeGreaterThan(0);

    for (const [name, document] of documents) {
      expect(
        (document.match(/contentWithShared/g) ?? []).length,
        `${name} selects a block without asking for the folded content, so an agent reading it sees labels with no url to address`,
      ).toBe((document.match(/advanced/g) ?? []).length);
    }
  });

  it("never asks for the raw shared bucket", () => {
    for (const [name, document] of blockDocuments()) {
      expect(
        document.match(/shared/g),
        `${name} still reads the bucket split; where a field is stored is the server's business`,
      ).toBeNull();
    }
  });

  it("sends whole rows back and names no bucket the server owns", async () => {
    const { client, sent } = pageClient();
    const ops = createMcpWorkspaceOps(client);

    await ops.pages.updateBlock(
      "p1",
      "b1",
      { pl: { navigation: [{ ...ROW, label: "Dokumentacja" }] } },
      undefined,
      "merge",
      undefined,
    );

    const write = sent.find((s) => s.document.includes("updateLayout"));
    const written = (
      write?.variables.input as { layoutBlocks: Array<Record<string, unknown>> }
    ).layoutBlocks[0]!;

    expect(
      Object.hasOwn(written, "shared"),
      "an omitted bucket keeps its stored value (CMS-1792); naming it here would write back a copy the client never had a say in",
    ).toBe(false);
    expect(
      written.content,
      "translating one language must not cost the others the url they were read with",
    ).toStrictEqual({
      en: { navigation: [ROW] },
      pl: { navigation: [{ ...ROW, label: "Dokumentacja" }] },
    });
  });
});
