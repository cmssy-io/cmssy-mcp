import { parse, visit, type FieldNode } from "graphql";
import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";
import {
  PRODUCT_CATALOG_QUERY,
  SET_PRODUCT_TIERS_MUTATION,
  SET_PRODUCT_VARIANTS_MUTATION,
} from "../queries.js";

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

describe("products ops (CMS-2089)", () => {
  it("sends the whole variant set to product.setVariants and returns what it wrote", async () => {
    const written = { id: "r1", variants: [{ id: "v", sku: "TEE-M" }] };
    const query = vi.fn().mockResolvedValue({
      product: { setVariants: written },
    });
    const ops = createMcpWorkspaceOps({ query } as unknown as CmssyClient);
    const variants = [
      { selections: { size: "M" }, sku: "TEE-M", price: 4900, inventory: 3 },
      { selections: { size: "L" }, sku: null, price: 5200, inventory: null },
      {
        selections: { size: "XL" },
        sku: null,
        price: 5600,
        inventory: 1,
        tiers: [{ minQty: 10, price: 5400 }],
      },
      {
        selections: { size: "S" },
        sku: null,
        price: 4500,
        inventory: 2,
        tiers: [],
      },
    ];

    const result = await ops.products.setVariants("r1", variants);

    expect(query).toHaveBeenCalledWith(SET_PRODUCT_VARIANTS_MUTATION, {
      input: { recordId: "r1", variants },
    });
    expect(result).toBe(written);
  });

  it("sends the order step to product.setTiers only when one is given (CMS-2116)", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ product: { setTiers: { id: "r1" } } });
    const ops = createMcpWorkspaceOps({ query } as unknown as CmssyClient);
    const tiers = [{ minQty: 12, price: 400 }];

    await ops.products.setTiers("r1", tiers, 12);
    await ops.products.setTiers("r1", tiers);

    expect(query.mock.calls).toEqual([
      [
        SET_PRODUCT_TIERS_MUTATION,
        { input: { recordId: "r1", tiers, increment: 12 } },
      ],
      [SET_PRODUCT_TIERS_MUTATION, { input: { recordId: "r1", tiers } }],
    ]);
    expect(Object.keys(query.mock.calls[1]![1].input)).not.toContain(
      "increment",
    );
  });

  it("reads the order step wherever a product comes back (CMS-2116)", () => {
    expect(
      selectedUnder(SET_PRODUCT_TIERS_MUTATION, "setTiers").has(
        "quantityIncrement",
      ),
    ).toBe(true);
    expect(
      selectedUnder(PRODUCT_CATALOG_QUERY, "items").has("quantityIncrement"),
    ).toBe(true);
  });
});
