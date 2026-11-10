import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";

function clientAnswering(answers: unknown[]) {
  const sent: Array<{ document: string; variables: Record<string, unknown> }> =
    [];
  const query = vi.fn(async (document: string, variables?: unknown) => {
    sent.push({
      document,
      variables: (variables ?? {}) as Record<string, unknown>,
    });
    return answers.shift();
  });
  return { client: { query } as never, sent };
}

const MODEL_ID = "64b1f0c2a3d4e5f60718293a";
const MODEL = {
  id: MODEL_ID,
  name: "Product",
  slug: "product",
  displayField: "title",
  fields: [],
};

describe("record search from an agent (CMS-2211)", () => {
  it("sends query, resolved model id, locale and limit, and returns each hit's id, snippet and matchKind with the mode", async () => {
    const { client, sent } = clientAnswering([
      { model: { list: [{ id: MODEL_ID, slug: "product" }] } },
      { model: { get: MODEL } },
      {
        record: {
          search: {
            mode: "HYBRID",
            indexing: false,
            items: [
              {
                matchKind: "EXACT",
                record: { id: "r1" },
                snippet: { fieldKey: "sku", locale: null, text: "SKU-1" },
              },
              { matchKind: "SEMANTIC", record: { id: "r2" }, snippet: null },
            ],
          },
        },
      },
    ]);

    const result = await createMcpWorkspaceOps(client).models.searchRecords(
      "product",
      { query: "red shoes", locale: "pl", limit: 5 },
    );

    const request = sent[sent.length - 1]!;
    expect(request.document).toContain(
      "search(modelId: $modelId, query: $query, locale: $locale, limit: $limit)",
    );
    expect(request.variables).toEqual({
      modelId: MODEL_ID,
      query: "red shoes",
      locale: "pl",
      limit: 5,
    });
    expect(result).toEqual({
      modelId: MODEL_ID,
      mode: "HYBRID",
      indexing: false,
      items: [
        {
          id: "r1",
          matchKind: "EXACT",
          snippet: { fieldKey: "sku", locale: null, text: "SKU-1" },
        },
        { id: "r2", matchKind: "SEMANTIC", snippet: null },
      ],
    });
  });

  it("returns null without searching when the model does not exist", async () => {
    const { client, sent } = clientAnswering([{ model: { list: [] } }]);

    const result = await createMcpWorkspaceOps(client).models.searchRecords(
      "ghost",
      { query: "boots" },
    );

    expect(result).toBeNull();
    expect(sent.some((s) => s.document.includes("SearchRecords"))).toBe(false);
  });
});
