import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";

type Sent = { document: string; variables: Record<string, unknown> };

function addBlockClient(layoutBlocks: unknown[]) {
  const sent: Sent[] = [];
  const query = vi.fn(async (document: string, variables?: unknown) => {
    const vars = (variables ?? {}) as Record<string, unknown>;
    sent.push({ document, variables: vars });
    if (document.includes("query SiteConfig")) {
      return {
        siteConfig: {
          get: { defaultLanguage: "en", enabledLanguages: ["en"] },
        },
      };
    }
    if (document.includes("updateLayout")) {
      return { page: { updateLayout: { id: "p1", blockWarnings: null } } };
    }
    return {
      page: {
        get: {
          id: "p1",
          name: "Page",
          slug: "/page",
          version: 3,
          layoutBlocks,
        },
      },
    };
  });
  return { client: { query } as unknown as CmssyClient, sent };
}

function sentLayoutBlocks(sent: Sent[]) {
  const write = sent.find((s) => s.document.includes("updateLayout"));
  return (write?.variables.input as { layoutBlocks: Array<Record<string, unknown>> })
    .layoutBlocks;
}

describe("addBlock layout ordering (CMS-1709)", () => {
  it("appends after the region's highest order, not at order 0", async () => {
    const { client, sent } = addBlockClient([
      { id: "l1", type: "nav", region: "header", order: 4 },
      { id: "l2", type: "aside", region: "sidebar", order: 9 },
    ]);
    const ops = createMcpWorkspaceOps(client);

    const result = (await ops.pages.addBlock(
      "p1",
      { type: "nav", content: {} },
      "header",
    )) as { blockId: string };

    const blocks = sentLayoutBlocks(sent);
    expect(blocks).toHaveLength(3);
    expect(blocks[2]).toMatchObject({
      id: result.blockId,
      region: "header",
      order: 5,
    });
  });

  it("gives the first block of an empty region order 0", async () => {
    const { client, sent } = addBlockClient([
      { id: "l2", type: "aside", region: "sidebar", order: 9 },
    ]);
    const ops = createMcpWorkspaceOps(client);

    await ops.pages.addBlock("p1", { type: "nav", content: {} }, "header");

    const blocks = sentLayoutBlocks(sent);
    expect(blocks[1]).toMatchObject({ region: "header", order: 0 });
  });
});
