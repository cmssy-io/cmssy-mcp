import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";

const BACKEND_STATUSES = [
  "not_translated",
  "in_progress",
  "completed",
  "needs_review",
];

type Sent = { document: string; variables: Record<string, unknown> };

function multilingualClient() {
  const sent: Sent[] = [];
  const query = vi.fn(async (document: string, variables?: unknown) => {
    sent.push({
      document,
      variables: (variables ?? {}) as Record<string, unknown>,
    });
    if (document.includes("query SiteConfig")) {
      return {
        siteConfig: {
          get: { defaultLanguage: "en", enabledLanguages: ["en", "pl", "de"] },
        },
      };
    }
    if (document.includes("updateLayout")) {
      return { page: { updateLayout: { id: "p1", blockWarnings: null } } };
    }
    if (document.includes("mutation SavePage")) {
      return { page: { save: { id: "p1", blockWarnings: null } } };
    }
    return {
      page: {
        get: {
          id: "p1",
          name: "Page",
          slug: "/page",
          version: 3,
          blocks: [],
          layoutBlocks: [],
        },
      },
    };
  });
  return { client: { query } as unknown as CmssyClient, sent };
}

function writtenBlock(sent: Sent[], mutation: string, key: string) {
  const write = sent.find((s) => s.document.includes(mutation));
  const input = write?.variables.input as Record<
    string,
    Array<Record<string, unknown>>
  >;
  return input[key]!.at(-1)!;
}

describe("addBlock translation statuses (CMS-1869)", () => {
  it("marks the languages without content as not translated in the page body", async () => {
    const { client, sent } = multilingualClient();
    const ops = createMcpWorkspaceOps(client);

    await ops.pages.addBlock("p1", {
      type: "docs-article",
      content: { en: { title: "Writing data" } },
    });

    const translations = writtenBlock(sent, "mutation SavePage", "blocks")
      .translations as Record<string, { status: string }>;
    expect(translations).toEqual({
      en: { status: "completed" },
      pl: { status: "not_translated" },
      de: { status: "not_translated" },
    });
    for (const { status } of Object.values(translations)) {
      expect(BACKEND_STATUSES).toContain(status);
    }
  });

  it("marks the languages without content as not translated in a layout region", async () => {
    const { client, sent } = multilingualClient();
    const ops = createMcpWorkspaceOps(client);

    await ops.pages.addBlock(
      "p1",
      { type: "nav", content: { pl: { label: "Menu" } } },
      "header",
    );

    expect(
      writtenBlock(sent, "updateLayout", "layoutBlocks").translations,
    ).toEqual({
      en: { status: "not_translated" },
      pl: { status: "completed" },
      de: { status: "not_translated" },
    });
  });
});
