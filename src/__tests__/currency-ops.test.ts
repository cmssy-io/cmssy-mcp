import { parse, visit, type FieldNode } from "graphql";
import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";
import {
  CREATE_MANUAL_ORDER_MUTATION,
  CREATE_SALES_CHANNEL_MUTATION,
  DISCOUNT_BY_ID_QUERY,
  DISCOUNTS_QUERY,
  MODEL_RECORD_BY_ID_QUERY,
  PRICE_LIST_ENTRIES_QUERY,
  SALES_CHANNELS_QUERY,
  SET_PRODUCT_CURRENCY_PRICES_MUTATION,
  SET_PRODUCT_TIERS_MUTATION,
  SET_PRODUCT_VARIANTS_MUTATION,
  UPDATE_DISCOUNT_MUTATION,
  UPDATE_SALES_CHANNEL_MUTATION,
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

const DISCOUNT_ID = "64b0c0ffee0000000000d001";

const eurPrice = {
  currency: "EUR",
  price: 4500,
  tiers: [{ minQty: 10, price: 4000 }],
  enabled: true,
};

const channel = {
  id: "ch-2",
  key: "eu-export",
  name: "EU export",
  currency: "EUR",
  displayMode: "gross",
  priceAccess: "PUBLIC",
  activeCartCount: 0,
  activePriceList: null,
  priceLists: [],
  nextChangeAt: null,
  createdAt: "2026-10-23T00:00:00.000Z",
  updatedAt: "2026-10-23T00:00:00.000Z",
};

describe("prices per currency (CMS-2143)", () => {
  it("every product price write and get_record read the prices per currency", () => {
    for (const [document, parent] of [
      [SET_PRODUCT_CURRENCY_PRICES_MUTATION, "setCurrencyPrices"],
      [SET_PRODUCT_VARIANTS_MUTATION, "setVariants"],
      [SET_PRODUCT_TIERS_MUTATION, "setTiers"],
      [MODEL_RECORD_BY_ID_QUERY, "get"],
    ] as const) {
      const selected = selectedUnder(document, parent);
      expect(selected.has("currencyPrices"), parent).toBe(true);
      expect(selected.has("variantCurrencyPrices"), parent).toBe(true);
    }
    expect(
      [...selectedUnder(MODEL_RECORD_BY_ID_QUERY, "currencyPrices")].sort(),
    ).toEqual(["currency", "enabled", "price", "tiers"]);
  });

  it("sets a product's prices per currency through setCurrencyPrices", async () => {
    const answer = { id: "r-1", priceTiers: [], currencyPrices: [eurPrice] };
    const { client, sent } = clientAnswering([
      { product: { setCurrencyPrices: answer } },
    ]);
    const prices = [{ currency: "EUR", price: 4500, tiers: eurPrice.tiers }];

    const out = await createMcpWorkspaceOps(client).products.setCurrencyPrices(
      "r-1",
      prices,
    );

    expect(sent).toEqual([
      {
        document: SET_PRODUCT_CURRENCY_PRICES_MUTATION,
        variables: { input: { recordId: "r-1", prices } },
      },
    ]);
    expect(out).toEqual(answer);
  });

  it("get_record maps the prices per currency, [] when the record has none", async () => {
    const record = {
      id: "r-1",
      modelId: "m-1",
      status: "published",
      data: { price: 499 },
      currencyPrices: [eurPrice],
      variantCurrencyPrices: [
        { variantKey: "v-red", currencyPrices: [eurPrice] },
      ],
      createdAt: null,
      updatedAt: null,
    };
    const { client } = clientAnswering([
      { record: { get: record } },
      {
        record: {
          get: {
            ...record,
            currencyPrices: undefined,
            variantCurrencyPrices: undefined,
          },
        },
      },
    ]);
    const ops = createMcpWorkspaceOps(client);

    const first = await ops.models.getRecord("r-1");
    const second = await ops.models.getRecord("r-1");

    expect(first?.currencyPrices).toEqual([eurPrice]);
    expect(first?.variantCurrencyPrices).toEqual(record.variantCurrencyPrices);
    expect(second?.currencyPrices).toEqual([]);
    expect(second?.variantCurrencyPrices).toEqual([]);
  });

  it("pages one currency's price list rows", async () => {
    const { client, sent } = clientAnswering([
      { priceList: { entries: { items: [], nextCursor: null } } },
    ]);

    await createMcpWorkspaceOps(client).priceLists.entries("pl-1", {
      currency: "EUR",
    });

    expect(sent[0]!.document).toBe(PRICE_LIST_ENTRIES_QUERY);
    expect(sent[0]!.variables).toMatchObject({
      priceListId: "pl-1",
      currency: "EUR",
    });
    expect(sent[0]!.document).toContain("currency: $currency");
  });
});

describe("channel currency (CMS-2143)", () => {
  it("every channel read selects the currency and maps it", async () => {
    expect(selectedUnder(SALES_CHANNELS_QUERY, "list").has("currency")).toBe(
      true,
    );
    const { client } = clientAnswering([{ salesChannel: { list: [channel] } }]);

    const [out] = await createMcpWorkspaceOps(client).salesChannels.list();

    expect(out!.currency).toBe("EUR");
  });

  it("creates in a currency and resets one to the default with null", async () => {
    const { client, sent } = clientAnswering([
      { salesChannel: { create: channel } },
      { salesChannel: { update: { ...channel, currency: "NOK" } } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    await ops.salesChannels.create({
      key: "eu-export",
      name: "EU export",
      currency: "EUR",
    });
    const updated = await ops.salesChannels.update("ch-2", { currency: null });

    expect(sent.map((s) => s.document)).toEqual([
      CREATE_SALES_CHANNEL_MUTATION,
      UPDATE_SALES_CHANNEL_MUTATION,
    ]);
    expect(sent[0]!.variables).toEqual({
      input: { key: "eu-export", name: "EU export", currency: "EUR" },
    });
    expect(sent[1]!.variables).toEqual({
      id: "ch-2",
      input: { currency: null },
    });
    expect(updated.currency).toBe("NOK");
  });
});

describe("discount minimums per currency (CMS-2143)", () => {
  it("get_discount reads the minimums per currency and the list does not", () => {
    expect(
      selectedUnder(DISCOUNT_BY_ID_QUERY, "get").has("minSubtotalByCurrency"),
    ).toBe(true);
    expect(
      selectedUnder(DISCOUNTS_QUERY, "items").has("minSubtotalByCurrency"),
    ).toBe(false);
  });

  it("maps the minimums per currency, [] when the code has none", async () => {
    const base = {
      id: DISCOUNT_ID,
      code: "EU10",
      type: "percentage",
      value: 10,
      enabled: true,
      currency: null,
      minSubtotal: 0,
    };
    const { client } = clientAnswering([
      {
        discount: {
          get: {
            ...base,
            minSubtotalByCurrency: [{ currency: "EUR", amount: 5000 }],
          },
        },
      },
      { discount: { get: base } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect(
      (await ops.discounts.get(DISCOUNT_ID))?.minSubtotalByCurrency,
    ).toEqual([{ currency: "EUR", amount: 5000 }]);
    expect(
      (await ops.discounts.get(DISCOUNT_ID))?.minSubtotalByCurrency,
    ).toEqual([]);
  });

  it("update sends the minimums per currency, [] included", async () => {
    const { client, sent } = clientAnswering([
      {
        discount: { update: { id: DISCOUNT_ID, code: "EU10", enabled: true } },
      },
    ]);

    await createMcpWorkspaceOps(client).discounts.update(DISCOUNT_ID, {
      minSubtotalByCurrency: [],
    });

    const call = sent.find((s) => s.document === UPDATE_DISCOUNT_MUTATION);
    expect(call?.variables).toEqual({
      id: DISCOUNT_ID,
      input: { minSubtotalByCurrency: [] },
    });
  });
});

describe("manual order currency (CMS-2143)", () => {
  it("sends the order currency with the order input", async () => {
    const { client, sent } = clientAnswering([
      { order: { create: { id: "o-1", orderNumber: 7 } } },
    ]);
    const items = [{ recordId: "p-1", quantity: 1 }];

    await createMcpWorkspaceOps(client).orders.createManual(
      "a@example.com",
      items,
      undefined,
      undefined,
      "EUR",
    );

    expect(sent).toEqual([
      {
        document: CREATE_MANUAL_ORDER_MUTATION,
        variables: {
          input: {
            customerEmail: "a@example.com",
            customerId: undefined,
            items,
            shippingAddress: undefined,
            currency: "EUR",
          },
        },
      },
    ]);
  });
});
