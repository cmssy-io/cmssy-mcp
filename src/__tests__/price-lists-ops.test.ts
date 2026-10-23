import { parse, visit, type FieldNode } from "graphql";
import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";
import {
  PRICE_LISTS_QUERY,
  PRICE_LIST_BY_ID_QUERY,
  PRICE_LIST_ENTRIES_QUERY,
  CREATE_PRICE_LIST_MUTATION,
  UPDATE_PRICE_LIST_MUTATION,
  DELETE_PRICE_LIST_MUTATION,
  SET_PRICE_LIST_ENTRY_MUTATION,
  SET_PRICE_LIST_ENTRIES_MUTATION,
  REMOVE_PRICE_LIST_ENTRIES_MUTATION,
  SET_RECORD_PRICE_LIST_MUTATION,
  SET_RECORD_PRICE_DISPLAY_MODE_MUTATION,
  SET_RECORD_TAX_ROUNDING_METHOD_MUTATION,
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

const gold = {
  id: "pl-1",
  name: "Gold",
  percentOff: 12.5,
  startsAt: "2026-11-01T00:00:00.000Z",
  endsAt: null,
  active: false,
  overrideCount: 2,
  overrideCountByCurrency: [{ currency: "EUR", count: 1 }],
  assignedCount: 3,
  channels: [
    { id: "ch-1", key: "horeca", name: "HoReCa", priceAccess: "MEMBERS" },
  ],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
};

const entry = {
  id: "e-1",
  priceListId: "pl-1",
  recordId: "r-1",
  variantKey: "v-red",
  price: 900,
  tiers: [{ minQty: 10, price: 800 }],
  minQuantity: 6,
  maxQuantity: null,
  currency: "USD",
  recordMissing: false,
};

describe("price lists ops (CMS-2111)", () => {
  it("every read and write selects every field of the summary and the entry", () => {
    for (const [name, document, parent] of [
      ["list", PRICE_LISTS_QUERY, "list"],
      ["get", PRICE_LIST_BY_ID_QUERY, "get"],
      ["create", CREATE_PRICE_LIST_MUTATION, "create"],
      ["update", UPDATE_PRICE_LIST_MUTATION, "update"],
    ] as const) {
      const selected = selectedUnder(document, parent);
      expect(
        Object.keys(gold).filter((k) => !selected.has(k)),
        name,
      ).toEqual([]);
    }
    for (const [name, document, parent] of [
      ["entries", PRICE_LIST_ENTRIES_QUERY, "items"],
      ["setEntry", SET_PRICE_LIST_ENTRY_MUTATION, "setEntry"],
    ] as const) {
      const selected = selectedUnder(document, parent);
      expect(
        Object.keys(entry).filter((k) => !selected.has(k)),
        name,
      ).toEqual([]);
      expect([...selectedUnder(document, "tiers")].sort(), name).toEqual([
        "minQty",
        "price",
      ]);
    }
    expect(
      selectedUnder(PRICE_LIST_ENTRIES_QUERY, "entries").has("nextCursor"),
    ).toBe(true);
    expect(
      [...selectedUnder(SET_RECORD_PRICE_LIST_MUTATION, "setPriceList")].sort(),
    ).toEqual(["id", "priceListId"]);
  });

  it("list and get map the summaries, get answers null for an unknown id", async () => {
    const { client, sent } = clientAnswering([
      { priceList: { list: [gold] } },
      { priceList: { get: gold } },
      { priceList: { get: null } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect(await ops.priceLists.list()).toEqual([gold]);
    expect(await ops.priceLists.get("pl-1")).toEqual(gold);
    expect(await ops.priceLists.get("nope")).toBeNull();
    expect(sent[0]!.document).toBe(PRICE_LISTS_QUERY);
    expect(sent[1]!.document).toBe(PRICE_LIST_BY_ID_QUERY);
    expect(sent[1]!.variables).toEqual({ id: "pl-1" });
  });

  it("entries forwards the filter and the cursor and maps the page", async () => {
    const { client, sent } = clientAnswering([
      {
        priceList: {
          entries: {
            items: [
              entry,
              {
                ...entry,
                id: "e-2",
                variantKey: null,
                tiers: null,
                currency: null,
              },
            ],
            nextCursor: "cur-2",
          },
        },
      },
    ]);
    const ops = createMcpWorkspaceOps(client);

    const page = await ops.priceLists.entries("pl-1", {
      recordId: "r-1",
      first: 50,
      after: "cur-1",
    });

    expect(sent[0]!.document).toBe(PRICE_LIST_ENTRIES_QUERY);
    expect(sent[0]!.variables).toEqual({
      priceListId: "pl-1",
      recordId: "r-1",
      first: 50,
      after: "cur-1",
    });
    expect(page).toEqual({
      items: [
        entry,
        { ...entry, id: "e-2", variantKey: null, tiers: [], currency: null },
      ],
      nextCursor: "cur-2",
    });
  });

  it("create, update and delete send their input to their own mutation", async () => {
    const { client, sent } = clientAnswering([
      { priceList: { create: gold } },
      { priceList: { update: { ...gold, name: "Platinum" } } },
      { priceList: { delete: true } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect(
      await ops.priceLists.create({ name: "Gold", percentOff: 12.5 }),
    ).toEqual(gold);
    expect(
      (await ops.priceLists.update("pl-1", { name: "Platinum" })).name,
    ).toBe("Platinum");
    expect(await ops.priceLists.delete("pl-1")).toBe(true);

    expect(sent.map((s) => s.document)).toEqual([
      CREATE_PRICE_LIST_MUTATION,
      UPDATE_PRICE_LIST_MUTATION,
      DELETE_PRICE_LIST_MUTATION,
    ]);
    expect(sent[0]!.variables).toEqual({
      input: { name: "Gold", percentOff: 12.5 },
    });
    expect(sent[1]!.variables).toEqual({
      id: "pl-1",
      input: { name: "Platinum" },
    });
    expect(sent[2]!.variables).toEqual({ id: "pl-1" });
  });

  it("setEntry, setEntries and removeEntries send the list id with the rows and return what the backend reported", async () => {
    const row = {
      recordId: "r-1",
      variantKey: "v-red",
      price: 900,
      tiers: [{ minQty: 10, price: 800 }],
      minQuantity: 6,
      maxQuantity: null,
    };
    const { client, sent } = clientAnswering([
      { priceList: { setEntry: entry } },
      { priceList: { setEntries: 2 } },
      { priceList: { removeEntries: 1 } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect(await ops.priceLists.setEntry("pl-1", row)).toEqual(entry);
    expect(
      await ops.priceLists.setEntries("pl-1", [
        row,
        { recordId: "r-2", price: 500 },
      ]),
    ).toBe(2);
    expect(
      await ops.priceLists.removeEntries("pl-1", [
        { recordId: "r-1", variantKey: "v-red" },
      ]),
    ).toBe(1);

    expect(sent.map((s) => s.document)).toEqual([
      SET_PRICE_LIST_ENTRY_MUTATION,
      SET_PRICE_LIST_ENTRIES_MUTATION,
      REMOVE_PRICE_LIST_ENTRIES_MUTATION,
    ]);
    expect(sent[0]!.variables).toEqual({ priceListId: "pl-1", entry: row });
    expect(sent[1]!.variables).toEqual({
      priceListId: "pl-1",
      entries: [row, { recordId: "r-2", price: 500 }],
    });
    expect(sent[2]!.variables).toEqual({
      priceListId: "pl-1",
      keys: [{ recordId: "r-1", variantKey: "v-red" }],
    });
  });

  it("setRecordPriceList sends the record id to record.setPriceList, null to unassign", async () => {
    const { client, sent } = clientAnswering([
      { record: { setPriceList: { id: "co-1", priceListId: "pl-1" } } },
      { record: { setPriceList: { id: "co-1", priceListId: null } } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect(await ops.priceLists.setRecordPriceList("co-1", "pl-1")).toEqual({
      id: "co-1",
      priceListId: "pl-1",
    });
    expect(await ops.priceLists.setRecordPriceList("co-1", null)).toEqual({
      id: "co-1",
      priceListId: null,
    });
    expect(sent[0]!.document).toBe(SET_RECORD_PRICE_LIST_MUTATION);
    expect(sent[0]!.variables).toEqual({ id: "co-1", priceListId: "pl-1" });
    expect(sent[1]!.variables).toEqual({ id: "co-1", priceListId: null });
  });

  it("setRecordPriceDisplayMode sends the mode to record.setPriceDisplayMode, null to fall back", async () => {
    const { client, sent } = clientAnswering([
      {
        record: {
          setPriceDisplayMode: {
            id: "co-1",
            priceDisplayMode: "gross",
            taxRoundingMethod: "per_rate",
          },
        },
      },
      { record: { setPriceDisplayMode: { id: "co-1" } } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect(await ops.priceLists.setRecordPriceDisplayMode("co-1", "gross")).toEqual({
      id: "co-1",
      priceDisplayMode: "gross",
      taxRoundingMethod: "per_rate",
    });
    expect(await ops.priceLists.setRecordPriceDisplayMode("co-1", null)).toEqual({
      id: "co-1",
      priceDisplayMode: null,
      taxRoundingMethod: null,
    });
    expect(sent[0]!.document).toBe(SET_RECORD_PRICE_DISPLAY_MODE_MUTATION);
    expect(sent[0]!.variables).toEqual({ id: "co-1", displayMode: "gross" });
    expect(sent[1]!.variables).toEqual({ id: "co-1", displayMode: null });
  });

  it("setRecordTaxRoundingMethod sends the method to record.setTaxRoundingMethod, null to fall back", async () => {
    const { client, sent } = clientAnswering([
      {
        record: {
          setTaxRoundingMethod: {
            id: "co-1",
            priceDisplayMode: null,
            taxRoundingMethod: "per_rate",
          },
        },
      },
      {
        record: {
          setTaxRoundingMethod: {
            id: "co-1",
            priceDisplayMode: "net",
            taxRoundingMethod: null,
          },
        },
      },
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect(await ops.priceLists.setRecordTaxRoundingMethod("co-1", "per_rate")).toEqual({
      id: "co-1",
      priceDisplayMode: null,
      taxRoundingMethod: "per_rate",
    });
    expect(await ops.priceLists.setRecordTaxRoundingMethod("co-1", null)).toEqual({
      id: "co-1",
      priceDisplayMode: "net",
      taxRoundingMethod: null,
    });
    expect(sent[0]!.document).toBe(SET_RECORD_TAX_ROUNDING_METHOD_MUTATION);
    expect(sent[0]!.variables).toEqual({ id: "co-1", method: "per_rate" });
    expect(sent[1]!.variables).toEqual({ id: "co-1", method: null });
  });

  it("every summary read selects the channels a list is published to", () => {
    for (const document of [
      PRICE_LISTS_QUERY,
      PRICE_LIST_BY_ID_QUERY,
      CREATE_PRICE_LIST_MUTATION,
      UPDATE_PRICE_LIST_MUTATION,
    ]) {
      expect([...selectedUnder(document, "channels")].sort()).toEqual([
        "id",
        "key",
        "name",
        "priceAccess",
      ]);
    }
  });

  it("create and update send channels in the input, [] to unpublish, and map a list without channels to []", async () => {
    const { client, sent } = clientAnswering([
      { priceList: { create: gold } },
      { priceList: { update: { ...gold, channels: null } } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect(
      (await ops.priceLists.create({ name: "Gold", channels: ["horeca"] }))
        .channels,
    ).toEqual(gold.channels);
    expect(
      (await ops.priceLists.update("pl-1", { channels: [] })).channels,
    ).toEqual([]);
    expect(sent[0]!.variables).toEqual({
      input: { name: "Gold", channels: ["horeca"] },
    });
    expect(sent[1]!.variables).toEqual({ id: "pl-1", input: { channels: [] } });
  });
});
