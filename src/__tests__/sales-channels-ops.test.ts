import { parse, visit, type FieldNode } from "graphql";
import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";
import {
  SALES_CHANNELS_QUERY,
  SALES_CHANNEL_BY_ID_QUERY,
  CREATE_SALES_CHANNEL_MUTATION,
  UPDATE_SALES_CHANNEL_MUTATION,
  DELETE_SALES_CHANNEL_MUTATION,
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

const spring = {
  id: "pl-2",
  name: "Spring",
  startsAt: "2026-03-01T00:00:00.000Z",
  endsAt: "2026-06-01T00:00:00.000Z",
  active: true,
};

const base = {
  id: "pl-1",
  name: "Retail",
  startsAt: null,
  endsAt: null,
  active: true,
};

const horeca = {
  id: "ch-1",
  key: "horeca",
  name: "HoReCa",
  displayMode: "net",
  priceAccess: "COMPANY_MEMBERS",
  activeCartCount: 4,
  activePriceList: spring,
  priceLists: [base, spring],
  nextChangeAt: "2026-06-01T00:00:00.000Z",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
};

describe("sales channels ops (CMS-2123)", () => {
  it("every read and write selects every field of the summary and of its lists", () => {
    for (const [name, document, parent] of [
      ["list", SALES_CHANNELS_QUERY, "list"],
      ["get", SALES_CHANNEL_BY_ID_QUERY, "get"],
      ["create", CREATE_SALES_CHANNEL_MUTATION, "create"],
      ["update", UPDATE_SALES_CHANNEL_MUTATION, "update"],
    ] as const) {
      const selected = selectedUnder(document, parent);
      expect(
        Object.keys(horeca).filter((k) => !selected.has(k)),
        name,
      ).toEqual([]);
      for (const lists of ["activePriceList", "priceLists"]) {
        expect([...selectedUnder(document, lists)].sort(), name).toEqual(
          Object.keys(spring).sort(),
        );
      }
    }
  });

  it("list and get map the channels with activeCartCount, get answers null for an unknown id", async () => {
    const { client, sent } = clientAnswering([
      { salesChannel: { list: [horeca] } },
      { salesChannel: { get: horeca } },
      { salesChannel: { get: null } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect(await ops.salesChannels.list()).toEqual([horeca]);
    expect(await ops.salesChannels.get("ch-1")).toEqual(horeca);
    expect(await ops.salesChannels.get("nope")).toBeNull();
    expect(sent[0]!.document).toBe(SALES_CHANNELS_QUERY);
    expect(sent[1]!.document).toBe(SALES_CHANNEL_BY_ID_QUERY);
    expect(sent[1]!.variables).toEqual({ id: "ch-1" });
  });

  it("maps a channel without lists: activePriceList null, priceLists [], absent bounds null", async () => {
    const bare = {
      ...horeca,
      activeCartCount: 0,
      activePriceList: null,
      priceLists: null,
      nextChangeAt: null,
    };
    const { client } = clientAnswering([
      { salesChannel: { get: bare } },
      {
        salesChannel: {
          get: { ...horeca, priceLists: [{ id: "pl-1", name: "Retail", active: false }] },
        },
      },
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect(await ops.salesChannels.get("ch-1")).toEqual({
      ...bare,
      priceLists: [],
    });
    expect((await ops.salesChannels.get("ch-1"))?.priceLists).toEqual([
      { id: "pl-1", name: "Retail", startsAt: null, endsAt: null, active: false },
    ]);
  });

  it("create, update and delete send their input to their own mutation", async () => {
    const { client, sent } = clientAnswering([
      { salesChannel: { create: horeca } },
      { salesChannel: { update: { ...horeca, priceAccess: "PUBLIC" } } },
      { salesChannel: { delete: true } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect(
      await ops.salesChannels.create({
        key: "horeca",
        name: "HoReCa",
        displayMode: "net",
        priceAccess: "COMPANY_MEMBERS",
      }),
    ).toEqual(horeca);
    expect(
      (await ops.salesChannels.update("ch-1", { priceAccess: "PUBLIC" }))
        .priceAccess,
    ).toBe("PUBLIC");
    expect(await ops.salesChannels.delete("ch-1")).toBe(true);

    expect(sent.map((s) => s.document)).toEqual([
      CREATE_SALES_CHANNEL_MUTATION,
      UPDATE_SALES_CHANNEL_MUTATION,
      DELETE_SALES_CHANNEL_MUTATION,
    ]);
    expect(sent[0]!.variables).toEqual({
      input: {
        key: "horeca",
        name: "HoReCa",
        displayMode: "net",
        priceAccess: "COMPANY_MEMBERS",
      },
    });
    expect(sent[1]!.variables).toEqual({
      id: "ch-1",
      input: { priceAccess: "PUBLIC" },
    });
    expect(sent[2]!.variables).toEqual({ id: "ch-1" });
  });
});
