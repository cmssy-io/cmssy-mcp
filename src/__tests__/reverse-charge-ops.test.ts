import { parse, visit, type FieldNode } from "graphql";
import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";
import {
  CREATE_MANUAL_ORDER_MUTATION,
  MODEL_RECORD_BY_ID_QUERY,
  ORDER_BY_ID_QUERY,
  SET_RECORD_TAX_EXEMPTION_MUTATION,
  SET_RECORD_VAT_ID_MUTATION,
  SET_RECORD_VAT_VERIFIED_MUTATION,
  UPDATE_CART_CONFIG_MUTATION,
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

const VAT_FIELDS = [
  "taxExemptReason",
  "vatCountry",
  "vatId",
  "vatVerifiedAt",
  "vatVerifiedBy",
];

const verified = {
  id: "co-1",
  vatId: "DE123456789",
  vatCountry: "DE",
  vatVerifiedAt: "2026-10-22T10:00:00.000Z",
  vatVerifiedBy: "u-1",
  taxExemptReason: null,
};

const treatment = {
  kind: "reverse_charge",
  legalNote: "Reverse charge - Article 196",
  buyerVatId: "DE123456789",
  buyerVatCountry: "DE",
  buyerVatVerifiedAt: "2026-10-22T10:00:00.000Z",
  sellerCountry: "PL",
  shipToCountry: "DE",
};

describe("company VAT profile (CMS-2121)", () => {
  it("each port selects the record id and every VAT field", () => {
    for (const [document, parent] of [
      [SET_RECORD_VAT_ID_MUTATION, "setVatId"],
      [SET_RECORD_VAT_VERIFIED_MUTATION, "setVatVerified"],
      [SET_RECORD_TAX_EXEMPTION_MUTATION, "setTaxExemption"],
    ] as const) {
      expect([...selectedUnder(document, parent)].sort(), parent).toEqual(
        ["id", ...VAT_FIELDS].sort(),
      );
    }
  });

  it("each port sends its arguments to its own mutation and maps the profile", async () => {
    const exempt = {
      ...verified,
      vatId: null,
      vatCountry: null,
      vatVerifiedAt: null,
      vatVerifiedBy: null,
      taxExemptReason: "Art. 113 ust. 1",
    };
    const { client, sent } = clientAnswering([
      {
        record: {
          setVatId: { id: "co-1", vatId: "DE123456789", vatCountry: "DE" },
        },
      },
      { record: { setVatVerified: verified } },
      {
        record: {
          setTaxExemption: { id: "co-1", taxExemptReason: "Art. 113 ust. 1" },
        },
      },
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect(
      await ops.priceLists.setRecordVatId("co-1", "DE 123.456.789"),
    ).toEqual({
      id: "co-1",
      vatId: "DE123456789",
      vatCountry: "DE",
      vatVerifiedAt: null,
      vatVerifiedBy: null,
      taxExemptReason: null,
    });
    expect(
      await ops.priceLists.setRecordVatVerified("co-1", true, "DE123456789"),
    ).toEqual(verified);
    expect(
      await ops.priceLists.setRecordTaxExemption("co-1", "Art. 113 ust. 1"),
    ).toEqual(exempt);

    expect(sent.map((s) => s.document)).toEqual([
      SET_RECORD_VAT_ID_MUTATION,
      SET_RECORD_VAT_VERIFIED_MUTATION,
      SET_RECORD_TAX_EXEMPTION_MUTATION,
    ]);
    expect(sent[0]!.variables).toEqual({ id: "co-1", vatId: "DE 123.456.789" });
    expect(sent[1]!.variables).toEqual({
      id: "co-1",
      verified: true,
      expectedVatId: "DE123456789",
    });
    expect(sent[2]!.variables).toEqual({
      id: "co-1",
      reason: "Art. 113 ust. 1",
    });
  });

  it("clearing sends null for the VAT id, the attestation's expected id and the exemption", async () => {
    const cleared = { id: "co-1" };
    const { client, sent } = clientAnswering([
      { record: { setVatId: cleared } },
      { record: { setVatVerified: cleared } },
      { record: { setTaxExemption: cleared } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    await ops.priceLists.setRecordVatId("co-1", null);
    await ops.priceLists.setRecordVatVerified("co-1", false, null);
    await ops.priceLists.setRecordTaxExemption("co-1", null);

    expect(sent.map((s) => s.variables)).toEqual([
      { id: "co-1", vatId: null },
      { id: "co-1", verified: false, expectedVatId: null },
      { id: "co-1", reason: null },
    ]);
  });

  it("get_record selects the VAT fields and returns them, null when unset", async () => {
    expect(
      VAT_FIELDS.filter(
        (f) => !selectedUnder(MODEL_RECORD_BY_ID_QUERY, "get").has(f),
      ),
    ).toEqual([]);
    const row = { id: "co-1", modelId: "m-1", status: "published", data: {} };
    const { client } = clientAnswering([
      { record: { get: { ...row, ...verified } } },
      { record: { get: row } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect(await ops.models.getRecord("co-1")).toMatchObject(verified);
    expect(await ops.models.getRecord("co-1")).toMatchObject({
      vatId: null,
      vatCountry: null,
      vatVerifiedAt: null,
      vatVerifiedBy: null,
      taxExemptReason: null,
    });
  });
});

describe("order tax treatment (CMS-2121)", () => {
  it("get selects taxTreatment with every fact and removedTax", () => {
    expect(selectedUnder(ORDER_BY_ID_QUERY, "get").has("removedTax")).toBe(
      true,
    );
    expect(
      [...selectedUnder(ORDER_BY_ID_QUERY, "taxTreatment")].sort(),
    ).toEqual(Object.keys(treatment).sort());
  });

  it("get returns the frozen treatment and the removed tax", async () => {
    const { client } = clientAnswering([
      {
        order: {
          get: { id: "o-1", taxTreatment: treatment, removedTax: 2300 },
        },
      },
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect(await ops.orders.get("o-1")).toMatchObject({
      taxTreatment: treatment,
      removedTax: 2300,
    });
  });

  it("createManual sends the shipping address in the input", async () => {
    const address = {
      name: "Acme GmbH",
      line1: "Hauptstr. 1",
      postalCode: "10115",
      city: "Berlin",
      country: "DE",
      vatId: "DE123456789",
    };
    const items = [{ recordId: "p-1", quantity: 2 }];
    const { client, sent } = clientAnswering([
      { order: { create: { id: "o-2", orderNumber: 12 } } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect(
      await ops.orders.createManual("ann@acme.test", items, "c-1", address),
    ).toEqual({ id: "o-2", orderNumber: 12 });
    expect(sent[0]!.document).toBe(CREATE_MANUAL_ORDER_MUTATION);
    expect(sent[0]!.variables).toEqual({
      input: {
        customerEmail: "ann@acme.test",
        customerId: "c-1",
        items,
        shippingAddress: address,
      },
    });
  });

  it("update_cart_config sends sellerCountry and reverseChargeNote and reads them back", async () => {
    const { client, sent } = clientAnswering([
      { siteConfig: { updateCart: { id: "s-1" } } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    await ops.workspace.updateCartConfig({
      sellerCountry: "PL",
      reverseChargeNote: null,
    });

    expect(sent[0]!.document).toBe(UPDATE_CART_CONFIG_MUTATION);
    expect(sent[0]!.variables).toEqual({
      input: { sellerCountry: "PL", reverseChargeNote: null },
    });
    const cart = selectedUnder(UPDATE_CART_CONFIG_MUTATION, "cart");
    expect(cart.has("sellerCountry")).toBe(true);
    expect(cart.has("reverseChargeNote")).toBe(true);
  });
});
