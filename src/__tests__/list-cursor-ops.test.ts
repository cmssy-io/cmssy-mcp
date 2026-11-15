import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";

const MODEL_ID = "64b000000000000000000001";

function clientAnswering(answers: unknown[]) {
  const sent: Array<{ document: string; variables: Record<string, unknown> }> =
    [];
  const query = vi.fn(async (document: string, variables?: unknown) => {
    sent.push({
      document,
      variables: (variables ?? {}) as Record<string, unknown>,
    });
    return answers[sent.length - 1];
  });
  return { client: { query } as never, sent };
}

const page = { items: [], total: 0, hasMore: true, nextCursor: "c2" };
const model = { model: { get: { id: MODEL_ID, name: "Post", slug: "post" } } };

const cases: Array<{
  name: string;
  answers: unknown[];
  call: (ops: ReturnType<typeof createMcpWorkspaceOps>) => Promise<unknown>;
}> = [
  {
    name: "records",
    answers: [model, { record: { list: page } }],
    call: (ops) => ops.models.listRecords(MODEL_ID, { after: "c1" }),
  },
  {
    name: "products",
    answers: [{ product: { list: page } }],
    call: (ops) =>
      ops.products.list(MODEL_ID, undefined, 10, 0, undefined, "c1"),
  },
  {
    name: "orders",
    answers: [{ order: { list: page } }],
    call: (ops) => ops.orders.list({ after: "c1" }),
  },
  {
    name: "customers",
    answers: [{ customer: { list: page } }],
    call: (ops) => ops.customers.list({ after: "c1" }),
  },
  {
    name: "media",
    answers: [{ media: { list: page } }],
    call: (ops) => ops.media.list(10, 0, "c1"),
  },
  {
    name: "media trash",
    answers: [{ media: { trash: page } }],
    call: (ops) => ops.media.listTrash(10, 0, "c1"),
  },
];

describe("large lists page by cursor (CMS-2249)", () => {
  it.each(cases)("$name sends after and returns nextCursor", async (c) => {
    const { client, sent } = clientAnswering(c.answers);

    const result = await c.call(createMcpWorkspaceOps(client));

    const last = sent[sent.length - 1]!;
    expect(last.document).toContain("after: $after");
    expect(last.document).toContain("nextCursor");
    expect(last.variables.after).toBe("c1");
    expect(result).toMatchObject({ nextCursor: "c2" });
  });
});
