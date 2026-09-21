import { parse, visit, type FieldNode } from "graphql";
import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";
import { ORDER_BY_ID_QUERY, ORDERS_QUERY } from "../queries.js";

interface Sent {
  document: string;
  variables: Record<string, unknown>;
}

function clientAnswering(answers: unknown[]) {
  const sent: Sent[] = [];
  const query = vi.fn(async (document: string, variables?: unknown) => {
    sent.push({
      document,
      variables: (variables ?? {}) as Record<string, unknown>,
    });
    return answers.shift();
  });
  return { client: { query } as unknown as CmssyClient, sent };
}

function selectedUnder(document: string, parent: string): Set<string> {
  const names = new Set<string>();
  visit(parse(document), {
    Field(node: FieldNode) {
      if (node.name.value !== parent || !node.selectionSet) return;
      for (const sel of node.selectionSet.selections) {
        if (sel.kind === "Field") names.add(sel.name.value);
      }
    },
  });
  return names;
}

const ATTRIBUTION = ["customerId", "companyId", "companyName"] as const;

const rawSummary = {
  id: "o-1",
  orderNumber: 11,
  customerId: "c-1",
  customerEmail: "ann@acme.test",
  companyId: "co-1",
  companyName: "Acme",
  poNumber: "PO-7",
  status: "pending",
  paymentStatus: "unpaid",
  fulfillmentStatus: "unfulfilled",
  total: 602700,
  currency: "USD",
  createdAt: "2026-09-21T08:00:00.000Z",
};

describe("orders ops (CMS-1915)", () => {
  it("list and get select the customer and company attribution", () => {
    for (const [name, document, parent] of [
      ["list", ORDERS_QUERY, "items"],
      ["get", ORDER_BY_ID_QUERY, "get"],
    ] as const) {
      const selected = selectedUnder(document, parent);
      expect(ATTRIBUTION.filter((k) => !selected.has(k)), name).toEqual([]);
    }
  });

  it("list forwards the companyId filter and maps the attribution", async () => {
    const { client, sent } = clientAnswering([
      { order: { list: { items: [rawSummary], total: 1, hasMore: false } } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    const result = await ops.orders.list({ companyId: "co-1", limit: 5 });

    expect(sent[0]!.document).toBe(ORDERS_QUERY);
    expect(sent[0]!.variables).toMatchObject({ companyId: "co-1", limit: 5 });
    expect(result.items[0]).toMatchObject({
      id: "o-1",
      customerId: "c-1",
      companyId: "co-1",
      companyName: "Acme",
    });
  });

  it("list maps a guest order's attribution to null, not undefined", async () => {
    const { client } = clientAnswering([
      {
        order: {
          list: {
            items: [{ ...rawSummary, customerId: null, companyId: null, companyName: null }],
            total: 1,
            hasMore: false,
          },
        },
      },
    ]);
    const ops = createMcpWorkspaceOps(client);

    const [item] = (await ops.orders.list()).items;

    expect(item).toMatchObject({ customerId: null, companyId: null, companyName: null });
    expect(Object.keys(item!)).toEqual(expect.arrayContaining([...ATTRIBUTION]));
  });

  it("get maps the customer and company attribution", async () => {
    const { client, sent } = clientAnswering([
      { order: { get: { ...rawSummary, items: [], payments: [] } } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    const order = await ops.orders.get("o-1");

    expect(sent[0]!.document).toBe(ORDER_BY_ID_QUERY);
    expect(order).toMatchObject({
      id: "o-1",
      customerEmail: "ann@acme.test",
      customerId: "c-1",
      companyId: "co-1",
      companyName: "Acme",
    });
  });
});
