import { parse, visit, type FieldNode } from "graphql";
import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";
import {
  CREATE_SHIPMENT_MUTATION,
  ORDER_BY_ID_QUERY,
  ORDERS_QUERY,
  TRANSITION_ORDER_FULFILLMENT_MUTATION,
  UPDATE_SHIPMENT_MUTATION,
} from "../queries.js";

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

describe("order custom fields ops", () => {
  it("get selects and hands back the custom fields, and {} when the API sends none", async () => {
    const { client } = clientAnswering([
      {
        order: { get: { ...rawSummary, customFields: { giftMessage: "Hi" } } },
      },
      { order: { get: { ...rawSummary, customFields: null } } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect(selectedUnder(ORDER_BY_ID_QUERY, "get").has("customFields")).toBe(
      true,
    );
    expect((await ops.orders.get("o-1"))!.customFields).toEqual({
      giftMessage: "Hi",
    });
    expect((await ops.orders.get("o-1"))!.customFields).toEqual({});
  });

  it("updateDetails sends the custom field patch with nulls intact", async () => {
    const { client, sent } = clientAnswering([
      { order: { updateDetails: { id: "o-1", orderNumber: 11 } } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    await ops.orders.updateDetails("o-1", {
      customFields: { internalRef: "X-9", giftMessage: null },
    });

    expect(sent[0]!.variables).toEqual({
      input: {
        orderId: "o-1",
        customFields: { internalRef: "X-9", giftMessage: null },
      },
    });
  });
});

describe("order shipments ops", () => {
  const ack = { id: "o-1", orderNumber: 11 };
  const parcel = {
    id: "s-1",
    carrier: "InPost",
    trackingNumber: "620",
    trackingUrl: null,
    status: "in_transit",
    events: [{ status: "in_transit", at: "2026-10-01T10:00:00.000Z", note: null }],
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
  };

  it("get selects every parcel field and no longer reads tracking off the order", () => {
    const parcelFields = selectedUnder(ORDER_BY_ID_QUERY, "shipments");
    const orderFields = selectedUnder(ORDER_BY_ID_QUERY, "get");

    expect([...parcelFields].sort()).toEqual(
      [
        "carrier",
        "createdAt",
        "events",
        "id",
        "status",
        "trackingNumber",
        "trackingUrl",
        "updatedAt",
      ].sort(),
    );
    expect(orderFields.has("trackingNumber")).toBe(false);
    expect(orderFields.has("trackingCarrier")).toBe(false);
  });

  it("get hands back the parcels, and an empty list for an order the API sends none for", async () => {
    const { client } = clientAnswering([
      { order: { get: { ...rawSummary, shipments: [parcel] } } },
      { order: { get: { ...rawSummary, shipments: null } } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect((await ops.orders.get("o-1"))!.shipments).toEqual([parcel]);
    expect((await ops.orders.get("o-1"))!.shipments).toEqual([]);
  });

  it("createShipment sends the parcel with its order", async () => {
    const { client, sent } = clientAnswering([
      { order: { createShipment: ack } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    const result = await ops.orders.createShipment("o-1", {
      carrier: "InPost",
      status: "in_transit",
      partial: true,
    });

    expect(sent[0]).toEqual({
      document: CREATE_SHIPMENT_MUTATION,
      variables: {
        input: {
          orderId: "o-1",
          carrier: "InPost",
          status: "in_transit",
          partial: true,
        },
      },
    });
    expect(result).toEqual(ack);
  });

  it("updateShipment sends a cleared field as null and leaves out what it keeps", async () => {
    const { client, sent } = clientAnswering([
      { order: { updateShipment: ack } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    await ops.orders.updateShipment("o-1", "s-1", {
      trackingUrl: null,
      status: "delivered",
    });

    expect(sent[0]).toEqual({
      document: UPDATE_SHIPMENT_MUTATION,
      variables: {
        input: {
          orderId: "o-1",
          shipmentId: "s-1",
          trackingUrl: null,
          status: "delivered",
        },
      },
    });
  });

  it("transitionFulfillment sends only the status", async () => {
    const { client, sent } = clientAnswering([
      { order: { transitionFulfillment: ack } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    await ops.orders.transitionFulfillment("o-1", "fulfilled");

    expect(sent[0]).toEqual({
      document: TRANSITION_ORDER_FULFILLMENT_MUTATION,
      variables: { input: { orderId: "o-1", status: "fulfilled" } },
    });
  });
});
