import { parse, visit, type FieldNode } from "graphql";
import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";
import {
  CLOSE_ORDER_MUTATION,
  APPROVE_RETURN_MUTATION,
  CANCEL_RETURN_MUTATION,
  COMPLETE_RETURN_MUTATION,
  CREATE_RETURN_MUTATION,
  CREATE_SHIPMENT_MUTATION,
  RECEIVE_RETURN_MUTATION,
  REFUND_RETURN_MUTATION,
  REJECT_RETURN_MUTATION,
  UPDATE_RETURN_TRACKING_MUTATION,
  ORDER_BY_ID_QUERY,
  ORDERS_QUERY,
  REOPEN_ORDER_MUTATION,
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
  paymentStatus: "paid",
  fulfillmentStatus: "partially_fulfilled",
  deliveryStatus: "in_transit",
  state: "open",
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
      expect(
        ATTRIBUTION.filter((k) => !selected.has(k)),
        name,
      ).toEqual([]);
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
            items: [
              {
                ...rawSummary,
                customerId: null,
                companyId: null,
                companyName: null,
              },
            ],
            total: 1,
            hasMore: false,
          },
        },
      },
    ]);
    const ops = createMcpWorkspaceOps(client);

    const [item] = (await ops.orders.list()).items;

    expect(item).toMatchObject({
      customerId: null,
      companyId: null,
      companyName: null,
    });
    expect(Object.keys(item!)).toEqual(
      expect.arrayContaining([...ATTRIBUTION]),
    );
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

describe("order price list (CMS-2111)", () => {
  it("get selects priceListName and maps it, null when no list priced the order", async () => {
    expect(selectedUnder(ORDER_BY_ID_QUERY, "get").has("priceListName")).toBe(true);
    const { client } = clientAnswering([
      { order: { get: { ...rawSummary, priceListName: "Gold" } } },
      { order: { get: { ...rawSummary } } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect((await ops.orders.get("o-1"))?.priceListName).toBe("Gold");
    expect((await ops.orders.get("o-1"))?.priceListName).toBeNull();
  });
});

describe("order status axes (CMS-2102)", () => {
  const AXES = [
    "paymentStatus",
    "fulfillmentStatus",
    "deliveryStatus",
    "state",
  ];

  it("list and get select the four axes and never the collapsed status", () => {
    for (const [name, document, parent] of [
      ["list", ORDERS_QUERY, "items"],
      ["get", ORDER_BY_ID_QUERY, "get"],
    ] as const) {
      const selected = selectedUnder(document, parent);
      expect(
        AXES.filter((k) => !selected.has(k)),
        name,
      ).toEqual([]);
      expect(selected.has("status"), name).toBe(false);
      expect(selected.has("displayStatus"), name).toBe(false);
    }
    expect(
      [...selectedUnder(ORDER_BY_ID_QUERY, "get")]
        .filter((k) => ["fulfilledAt", "deliveredAt", "closedAt"].includes(k))
        .sort(),
    ).toEqual(["closedAt", "deliveredAt", "fulfilledAt"]);
  });

  it("list forwards the delivery and state filters and maps each axis", async () => {
    const { client, sent } = clientAnswering([
      { order: { list: { items: [rawSummary], total: 1, hasMore: false } } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    const result = await ops.orders.list({
      deliveryStatus: "exception",
      state: "closed",
    });

    expect(sent[0]!.variables).toMatchObject({
      deliveryStatus: "exception",
      state: "closed",
    });
    expect(result.items[0]).toMatchObject({
      paymentStatus: "paid",
      fulfillmentStatus: "partially_fulfilled",
      deliveryStatus: "in_transit",
      state: "open",
    });
  });

  it("get maps the axes and their timestamps, null when the API sends none", async () => {
    const { client } = clientAnswering([
      {
        order: {
          get: {
            ...rawSummary,
            fulfilledAt: "2026-10-02T10:00:00.000Z",
            deliveredAt: "2026-10-03T10:00:00.000Z",
            closedAt: "2026-10-04T10:00:00.000Z",
          },
        },
      },
      { order: { get: { id: "o-2" } } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect(await ops.orders.get("o-1")).toMatchObject({
      deliveryStatus: "in_transit",
      state: "open",
      fulfilledAt: "2026-10-02T10:00:00.000Z",
      deliveredAt: "2026-10-03T10:00:00.000Z",
      closedAt: "2026-10-04T10:00:00.000Z",
    });
    expect(await ops.orders.get("o-2")).toMatchObject({
      deliveryStatus: null,
      state: null,
      fulfilledAt: null,
      deliveredAt: null,
      closedAt: null,
    });
  });

  it("close and reopen send only the order", async () => {
    const ack = { id: "o-1", orderNumber: 11 };
    const { client, sent } = clientAnswering([
      { order: { close: ack } },
      { order: { reopen: ack } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect(await ops.orders.close("o-1")).toEqual(ack);
    expect(await ops.orders.reopen("o-1")).toEqual(ack);
    expect(sent).toEqual([
      {
        document: CLOSE_ORDER_MUTATION,
        variables: { input: { orderId: "o-1" } },
      },
      {
        document: REOPEN_ORDER_MUTATION,
        variables: { input: { orderId: "o-1" } },
      },
    ]);
  });
});

describe("order warehouse queue", () => {
  it("list declares and forwards the queue as the API's OrderQueue enum", async () => {
    const { client, sent } = clientAnswering([
      { order: { list: { items: [], total: 0, hasMore: false } } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    await ops.orders.list({ queue: "shipping_problem" });

    expect(ORDERS_QUERY).toMatch(/\$queue: OrderQueue\b/);
    expect(ORDERS_QUERY).toMatch(/queue: \$queue/);
    expect(sent[0]!.variables).toMatchObject({ queue: "shipping_problem" });
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
    labelUrl: "https://labels.example/620.pdf",
    status: "in_transit",
    items: [{ itemId: "line-1", quantity: 2 }],
    shippedAt: "2026-10-01T10:00:00.000Z",
    deliveredAt: null,
    events: [
      { status: "in_transit", at: "2026-10-01T10:00:00.000Z", note: null },
    ],
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
        "deliveredAt",
        "events",
        "id",
        "items",
        "labelUrl",
        "shippedAt",
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

  it("createShipment sends the parcel with its order and the lines it carries", async () => {
    const { client, sent } = clientAnswering([
      { order: { createShipment: ack } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    const result = await ops.orders.createShipment("o-1", {
      carrier: "InPost",
      status: "in_transit",
      items: [{ itemId: "line-1", quantity: 2 }],
    });

    expect(sent[0]).toEqual({
      document: CREATE_SHIPMENT_MUTATION,
      variables: {
        input: {
          orderId: "o-1",
          carrier: "InPost",
          status: "in_transit",
          items: [{ itemId: "line-1", quantity: 2 }],
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

  it("get hands back the returns, and an empty list for an order the API sends none for", async () => {
    const ret = { id: "r-1", number: 1, status: "approved", lines: [] };
    const { client } = clientAnswering([
      { order: { get: { ...rawSummary, returns: [ret] } } },
      { order: { get: { ...rawSummary, returns: null } } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect((await ops.orders.get("o-1"))!.returns).toEqual([ret]);
    expect((await ops.orders.get("o-1"))!.returns).toEqual([]);
  });

  it("return writes send the order, the return and their input", async () => {
    const { client, sent } = clientAnswering([
      { order: { createReturn: ack } },
      { order: { approveReturn: ack } },
      { order: { receiveReturn: ack } },
      { order: { refundReturn: ack } },
      { order: { updateReturnTracking: ack } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    await ops.orders.createReturn("o-1", {
      lines: [{ itemId: "line-1", quantity: 1, reason: "damaged" }],
    });
    await ops.orders.approveReturn("o-1", "r-1", "ok");
    await ops.orders.receiveReturn("o-1", "r-1", {
      lines: [{ itemId: "line-1", receivedQuantity: 1, restockQuantity: 0 }],
    });
    const result = await ops.orders.refundReturn("o-1", "r-1", {
      reference: "re_1",
      amount: 500,
    });
    await ops.orders.updateReturnTracking("o-1", "r-1", { carrier: null });

    expect(sent).toEqual([
      {
        document: CREATE_RETURN_MUTATION,
        variables: {
          input: {
            orderId: "o-1",
            lines: [{ itemId: "line-1", quantity: 1, reason: "damaged" }],
          },
        },
      },
      {
        document: APPROVE_RETURN_MUTATION,
        variables: { input: { orderId: "o-1", returnId: "r-1", note: "ok" } },
      },
      {
        document: RECEIVE_RETURN_MUTATION,
        variables: {
          input: {
            orderId: "o-1",
            returnId: "r-1",
            lines: [
              { itemId: "line-1", receivedQuantity: 1, restockQuantity: 0 },
            ],
          },
        },
      },
      {
        document: REFUND_RETURN_MUTATION,
        variables: {
          input: {
            orderId: "o-1",
            returnId: "r-1",
            reference: "re_1",
            amount: 500,
          },
        },
      },
      {
        document: UPDATE_RETURN_TRACKING_MUTATION,
        variables: {
          input: { orderId: "o-1", returnId: "r-1", carrier: null },
        },
      },
    ]);
    expect(result).toEqual(ack);
  });

  it("reject, cancel and complete send the return and its note to their own mutation", async () => {
    const { client, sent } = clientAnswering([
      { order: { rejectReturn: ack } },
      { order: { cancelReturn: ack } },
      { order: { completeReturn: ack } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    await ops.orders.rejectReturn("o-1", "r-1", "worn");
    await ops.orders.cancelReturn("o-1", "r-2");
    const result = await ops.orders.completeReturn("o-1", "r-3", "credit");

    expect(sent).toEqual([
      {
        document: REJECT_RETURN_MUTATION,
        variables: { input: { orderId: "o-1", returnId: "r-1", note: "worn" } },
      },
      {
        document: CANCEL_RETURN_MUTATION,
        variables: {
          input: { orderId: "o-1", returnId: "r-2", note: undefined },
        },
      },
      {
        document: COMPLETE_RETURN_MUTATION,
        variables: {
          input: { orderId: "o-1", returnId: "r-3", note: "credit" },
        },
      },
    ]);
    expect(result).toEqual(ack);
  });
});
