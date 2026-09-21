import { parse, visit, type FieldNode } from "graphql";
import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";
import {
  CUSTOMER_BY_ID_QUERY,
  CUSTOMERS_QUERY,
  SUSPEND_CUSTOMER_MUTATION,
  UNSUSPEND_CUSTOMER_MUTATION,
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

const MODEL_ID = "6ab0e6e4f6d2b4fc96c40349";

const raw = {
  id: "c-1",
  modelId: "m-1",
  modelSlug: "buyers",
  modelName: "Buyers",
  identity: "ann@acme.test",
  displayName: "Ann",
  status: "active" as const,
  verified: true,
  lockedUntil: null,
  lastLoginAt: "2026-09-20T10:00:00.000Z",
  company: { id: "co-1", name: "Acme" },
  companyRole: "admin",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-20T10:00:00.000Z",
};

const summary = {
  id: "c-1",
  modelId: "m-1",
  modelSlug: "buyers",
  modelName: "Buyers",
  identity: "ann@acme.test",
  displayName: "Ann",
  status: "active",
  verified: true,
  lockedUntil: null,
  lastLoginAt: "2026-09-20T10:00:00.000Z",
  company: { id: "co-1", name: "Acme" },
  companyRole: "admin",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-20T10:00:00.000Z",
};

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

describe("customers ops (CMS-1911)", () => {
  it("every operation selects every field of the customer summary", () => {
    const keys = Object.keys(summary).sort();
    for (const [name, document, parent] of [
      ["list", CUSTOMERS_QUERY, "items"],
      ["get", CUSTOMER_BY_ID_QUERY, "get"],
      ["suspend", SUSPEND_CUSTOMER_MUTATION, "suspend"],
      ["unsuspend", UNSUSPEND_CUSTOMER_MUTATION, "unsuspend"],
    ] as const) {
      const selected = selectedUnder(document, parent);
      expect(keys.filter((k) => !selected.has(k)), name).toEqual([]);
      expect([...selectedUnder(document, "company")].sort(), name).toEqual(["id", "name"]);
    }
    expect(selectedUnder(CUSTOMER_BY_ID_QUERY, "record").has("data")).toBe(true);
  });

  it("list forwards every filter to the customer root and maps the page", async () => {
    const { client, sent } = clientAnswering([
      { model: { get: { id: MODEL_ID, name: "Buyers", displayField: null } } },
      { customer: { list: { items: [raw], total: 3, hasMore: true } } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    const result = await ops.customers.list({
      modelId: MODEL_ID,
      status: "active",
      search: "ann",
      companyId: "co-1",
      skip: 20,
      limit: 10,
    });

    expect(sent[1]!.document).toBe(CUSTOMERS_QUERY);
    expect(sent[1]!.variables).toEqual({
      modelId: MODEL_ID,
      status: "active",
      search: "ann",
      companyId: "co-1",
      skip: 20,
      limit: 10,
    });
    expect(result).toEqual({ items: [summary], total: 3, hasMore: true });
  });

  it("list resolves a model slug to its id before asking the backend", async () => {
    const { client, sent } = clientAnswering([
      { model: { list: [{ id: MODEL_ID, slug: "buyers" }] } },
      { model: { get: { id: MODEL_ID, name: "Buyers", displayField: null } } },
      { customer: { list: { items: [], total: 0, hasMore: false } } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    await ops.customers.list({ modelId: "buyers" });

    expect(sent[2]!.document).toBe(CUSTOMERS_QUERY);
    expect(sent[2]!.variables).toMatchObject({ modelId: MODEL_ID });
  });

  it("list refuses an unknown model instead of answering an empty page", async () => {
    const { client, sent } = clientAnswering([{ model: { list: [] } }]);
    const ops = createMcpWorkspaceOps(client);

    await expect(ops.customers.list({ modelId: "ghost" })).rejects.toThrow(
      "Model not found: ghost",
    );
    expect(sent.some((s) => s.document === CUSTOMERS_QUERY)).toBe(false);
  });

  it("list skips model resolution when no model is given", async () => {
    const { client, sent } = clientAnswering([
      { customer: { list: { items: [], total: 0, hasMore: false } } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    await ops.customers.list({ search: "ann" });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.variables).toMatchObject({ modelId: undefined, search: "ann" });
  });

  it("list nulls the optional fields the backend left out and keeps a nameless company", async () => {
    const { client } = clientAnswering([
      {
        customer: {
          list: {
            items: [
              {
                ...raw,
                lockedUntil: undefined,
                lastLoginAt: null,
                company: { id: "co-2", name: null },
                companyRole: undefined,
                createdAt: undefined,
              },
            ],
            total: 1,
            hasMore: false,
          },
        },
      },
    ]);
    const ops = createMcpWorkspaceOps(client);

    const { items } = await ops.customers.list();

    expect(items[0]).toMatchObject({
      lockedUntil: null,
      lastLoginAt: null,
      company: { id: "co-2", name: null },
      companyRole: null,
      createdAt: null,
    });
  });

  it("get returns the summary plus the record data, and null for an unknown id", async () => {
    const { client, sent } = clientAnswering([
      {
        customer: {
          get: { ...raw, record: { data: { email: "ann@acme.test", vip: true } } },
        },
      },
      { customer: { get: null } },
      { customer: { get: { ...raw, record: null } } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    const found = await ops.customers.get("c-1");
    expect(sent[0]!.document).toBe(CUSTOMER_BY_ID_QUERY);
    expect(sent[0]!.variables).toEqual({ id: "c-1" });
    expect(found).toEqual({
      ...summary,
      data: { email: "ann@acme.test", vip: true },
    });

    expect(await ops.customers.get("nope")).toBeNull();
    expect((await ops.customers.get("c-1"))?.data).toEqual({});
  });

  it("suspend and unsuspend send the id to their own mutation and map the answer", async () => {
    const { client, sent } = clientAnswering([
      { customer: { suspend: { ...raw, status: "suspended" } } },
      { customer: { unsuspend: raw } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    const suspended = await ops.customers.suspend("c-1");
    expect(sent[0]!.document).toBe(SUSPEND_CUSTOMER_MUTATION);
    expect(sent[0]!.variables).toEqual({ id: "c-1" });
    expect(suspended).toEqual({ ...summary, status: "suspended" });

    const active = await ops.customers.unsuspend("c-1");
    expect(sent[1]!.document).toBe(UNSUSPEND_CUSTOMER_MUTATION);
    expect(sent[1]!.variables).toEqual({ id: "c-1" });
    expect(active).toEqual(summary);
  });

  it("lets a refusal from the backend surface unchanged", async () => {
    const query = vi.fn(async () => {
      throw new Error("Customer is already suspended");
    });
    const ops = createMcpWorkspaceOps({ query } as unknown as CmssyClient);

    await expect(ops.customers.suspend("c-1")).rejects.toThrow(
      "Customer is already suspended",
    );
  });
});
