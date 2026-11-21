import { parse, visit, type FieldNode } from "graphql";
import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";
import {
  PRODUCT_CATALOG_QUERY,
  SET_PRODUCT_TIERS_MUTATION,
  SET_PRODUCT_VARIANTS_MUTATION,
  START_PRODUCT_BULK_DELETE_MUTATION,
  START_PRODUCT_BULK_UPDATE_MUTATION,
  PRODUCT_BULK_JOB_QUERY,
  ACTIVE_PRODUCT_BULK_JOB_QUERY,
  LATEST_PRODUCT_BULK_JOB_QUERY,
  CANCEL_PRODUCT_BULK_JOB_MUTATION,
  RESUME_PRODUCT_BULK_JOB_MUTATION,
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

describe("product bulk job ops (CMS-2263)", () => {
  const job = { id: "j1", kind: "delete", status: "queued", total: 4200 };

  it("starts a bulk delete with the filter and returns the job", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ product: { startBulkDelete: job } });
    const ops = createMcpWorkspaceOps({ query } as unknown as CmssyClient);

    const result = await ops.products.startBulkDelete("m1", {
      status: "draft",
    });

    expect(query).toHaveBeenCalledWith(START_PRODUCT_BULK_DELETE_MUTATION, {
      modelId: "m1",
      filter: { status: "draft" },
    });
    expect(result).toBe(job);
  });

  it("starts a bulk update with filter and patch and returns the job", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ product: { startBulkUpdate: job } });
    const ops = createMcpWorkspaceOps({ query } as unknown as CmssyClient);

    const result = await ops.products.startBulkUpdate(
      "m1",
      { stockState: "out" },
      { setStock: 5 },
    );

    expect(query).toHaveBeenCalledWith(START_PRODUCT_BULK_UPDATE_MUTATION, {
      modelId: "m1",
      filter: { stockState: "out" },
      patch: { setStock: 5 },
    });
    expect(result).toBe(job);
  });

  it("reads a job by id and the model's active job", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ product: { bulkJob: job } })
      .mockResolvedValueOnce({ product: { activeBulkJob: null } });
    const ops = createMcpWorkspaceOps({ query } as unknown as CmssyClient);

    expect(await ops.products.bulkJob("j1")).toBe(job);
    expect(await ops.products.activeBulkJob("m1")).toBeNull();
    expect(query.mock.calls).toEqual([
      [PRODUCT_BULK_JOB_QUERY, { id: "j1" }],
      [ACTIVE_PRODUCT_BULK_JOB_QUERY, { modelId: "m1" }],
    ]);
  });

  it("reads the model's latest job and cancels and resumes a job by id (CMS-2282)", async () => {
    const failed = { ...job, status: "failed", failureReason: "cancelled" };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ product: { latestBulkJob: null } })
      .mockResolvedValueOnce({ product: { cancelBulkJob: failed } })
      .mockResolvedValueOnce({ product: { resumeBulkJob: job } });
    const ops = createMcpWorkspaceOps({ query } as unknown as CmssyClient);

    expect(await ops.products.latestBulkJob("m1")).toBeNull();
    expect(await ops.products.cancelBulkJob("j1")).toBe(failed);
    expect(await ops.products.resumeBulkJob("j2")).toBe(job);
    expect(query.mock.calls).toEqual([
      [LATEST_PRODUCT_BULK_JOB_QUERY, { modelId: "m1" }],
      [CANCEL_PRODUCT_BULK_JOB_MUTATION, { id: "j1" }],
      [RESUME_PRODUCT_BULK_JOB_MUTATION, { id: "j2" }],
    ]);
  });

  it("selects progress, skips and failure reason on every job document", () => {
    for (const [doc, parent] of [
      [START_PRODUCT_BULK_DELETE_MUTATION, "startBulkDelete"],
      [START_PRODUCT_BULK_UPDATE_MUTATION, "startBulkUpdate"],
      [PRODUCT_BULK_JOB_QUERY, "bulkJob"],
      [ACTIVE_PRODUCT_BULK_JOB_QUERY, "activeBulkJob"],
      [LATEST_PRODUCT_BULK_JOB_QUERY, "latestBulkJob"],
      [CANCEL_PRODUCT_BULK_JOB_MUTATION, "cancelBulkJob"],
      [RESUME_PRODUCT_BULK_JOB_MUTATION, "resumeBulkJob"],
    ] as const) {
      const fields = selectedUnder(doc, parent);
      for (const f of [
        "id",
        "status",
        "total",
        "processed",
        "deleted",
        "updated",
        "skippedCount",
        "skipped",
        "failureReason",
        "resumable",
      ]) {
        expect(fields, `${parent}.${f}`).toContain(f);
      }
    }
  });
});
