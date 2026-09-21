import { describe, expect, it, vi } from "vitest";

import { parse, visit, type FieldNode } from "graphql";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";
import { MODEL_DEFINITION_BY_ID_QUERY } from "../queries.js";

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

const fields = [
  { key: "email", label: "Email", type: "email" as const, required: true },
];
const MODEL_ID = "64b1f0c2a3d4e5f60718293a";

const auth = {
  enabled: true,
  strategy: "local" as const,
  identityField: "email",
  companyField: "company",
  companyRoleField: "role",
  verification: { required: false },
  lockout: { enabled: false, maxAttempts: 5, lockMinutes: 15 },
};

const product = {
  enabled: true,
  variantAxes: [],
  skuField: "sku",
  priceField: "price",
  inventoryField: "inventory",
  nameField: "title",
  currencyField: null,
  imageField: null,
  taxRateField: null,
  roles: {
    name: "title",
    price: "price",
    currency: "currency",
    image: "image",
    sku: "sku",
    taxRate: "taxRate",
  },
};

describe("models auth config (CMS-1912) and product roles (CMS-1913)", () => {
  it("create forwards the auth config and leaves it out when unset", async () => {
    const created = {
      model: { create: { id: "m1", name: "Buyer", slug: "buyer", fields: [{}] } },
    };
    const { client, sent } = clientAnswering([created, structuredClone(created)]);
    const ops = createMcpWorkspaceOps(client);

    await ops.models.create({
      name: "Buyer",
      fields,
      auth: { enabled: true, companyField: "company" },
    });
    await ops.models.create({ name: "Buyer", fields });

    const withAuth = sent[0]!.variables.input as Record<string, unknown>;
    expect(withAuth.auth).toEqual({ enabled: true, companyField: "company" });
    const without = sent[1]!.variables.input as Record<string, unknown>;
    expect(without).not.toHaveProperty("auth");
  });

  it("update forwards the auth patch, null company keys included", async () => {
    const { client, sent } = clientAnswering([
      { model: { get: { id: MODEL_ID, name: "Buyer", slug: "buyer", fields: [] } } },
      { model: { update: { id: MODEL_ID, name: "Buyer", slug: "buyer", fields: [] } } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    await ops.models.update(MODEL_ID, {
      auth: { companyField: null, companyRoleField: null },
    });

    const input = sent[1]!.variables.input as Record<string, unknown>;
    expect(input.auth).toEqual({ companyField: null, companyRoleField: null });
  });

  it("the model fragment asks for the accounts config and the resolved product roles", () => {
    expect([...selectedUnder(MODEL_DEFINITION_BY_ID_QUERY, "auth")].sort()).toEqual(
      [
        "companyField",
        "companyRoleField",
        "enabled",
        "identityField",
        "lockout",
        "strategy",
        "verification",
      ],
    );
    const productFields = selectedUnder(MODEL_DEFINITION_BY_ID_QUERY, "product");
    for (const f of ["nameField", "currencyField", "imageField", "taxRateField", "roles"]) {
      expect(productFields.has(f), f).toBe(true);
    }
    expect([...selectedUnder(MODEL_DEFINITION_BY_ID_QUERY, "roles")].sort()).toEqual(
      ["currency", "image", "name", "price", "sku", "taxRate"],
    );
  });

  it("get returns the stored auth config and the resolved product roles", async () => {
    const buyer = {
      model: {
        get: { id: MODEL_ID, name: "Buyer", slug: "buyer", fields: [], product, auth },
      },
    };
    const post = {
      model: { get: { id: MODEL_ID, name: "Post", slug: "post", fields: [] } },
    };
    const { client } = clientAnswering([
      structuredClone(buyer),
      buyer,
      structuredClone(post),
      post,
    ]);
    const ops = createMcpWorkspaceOps(client);

    const buyerDetail = await ops.models.get(MODEL_ID);
    expect(buyerDetail?.auth).toEqual(auth);
    expect(buyerDetail?.product).toEqual(product);

    const postDetail = await ops.models.get(MODEL_ID);
    expect(postDetail?.auth).toBeNull();
    expect(postDetail?.product).toBeNull();
  });
});
