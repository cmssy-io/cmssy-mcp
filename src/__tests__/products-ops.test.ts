import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";
import { SET_PRODUCT_VARIANTS_MUTATION } from "../queries.js";

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
});
