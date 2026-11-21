import { parse, visit, type FieldNode } from "graphql";
import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";
import {
  ACTIVE_RECORD_IMPORT_QUERY,
  APPEND_RECORD_IMPORT_ROWS_MUTATION,
  CANCEL_RECORD_IMPORT_MUTATION,
  CONFIRM_RECORD_IMPORT_MUTATION,
  CREATE_RECORD_IMPORT_MUTATION,
  LATEST_RECORD_IMPORT_QUERY,
  RECORD_IMPORT_JOB_QUERY,
  RECORD_IMPORT_ROWS_QUERY,
  RESUME_RECORD_IMPORT_MUTATION,
  START_RECORD_IMPORT_MUTATION,
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

const job = { id: "j1", modelId: "m1", status: "uploading", total: 0 };

function opsReturning(...responses: unknown[]) {
  const query = vi.fn();
  for (const response of responses) query.mockResolvedValueOnce(response);
  const ops = createMcpWorkspaceOps({ query } as unknown as CmssyClient);
  return { ops, query };
}

describe("record import ops (CMS-2282)", () => {
  it("opens an import with the upsert key and onInvalid the caller gave", async () => {
    const { ops, query } = opsReturning({ recordImport: { create: job } });

    const result = await ops.recordImports.create("m1", {
      upsertKey: "sku",
      onInvalid: "CONTINUE",
    });

    expect(query).toHaveBeenCalledExactlyOnceWith(
      CREATE_RECORD_IMPORT_MUTATION,
      { modelId: "m1", upsertKey: "sku", onInvalid: "CONTINUE" },
    );
    expect(result).toBe(job);
  });

  it("sends neither upsertKey nor onInvalid when the caller gave none, so the server default applies", async () => {
    const { ops, query } = opsReturning(
      { recordImport: { create: job } },
      { recordImport: { create: job } },
    );

    await ops.recordImports.create("m1");
    await ops.recordImports.create("m1", {});

    expect(query.mock.calls).toEqual([
      [CREATE_RECORD_IMPORT_MUTATION, { modelId: "m1" }],
      [CREATE_RECORD_IMPORT_MUTATION, { modelId: "m1" }],
    ]);
  });

  it("stages rows at their offset and starts with the expected row count", async () => {
    const rows = [{ data: { sku: "A" } }, { refusal: "too large" }];
    const queued = { ...job, status: "queued", total: 502 };
    const { ops, query } = opsReturning(
      { recordImport: { appendRows: job } },
      { recordImport: { start: queued } },
    );

    expect(await ops.recordImports.appendRows("j1", 500, rows)).toBe(job);
    expect(await ops.recordImports.start("j1", 502)).toBe(queued);

    expect(query.mock.calls).toEqual([
      [APPEND_RECORD_IMPORT_ROWS_MUTATION, { jobId: "j1", offset: 500, rows }],
      [START_RECORD_IMPORT_MUTATION, { jobId: "j1", expectedRows: 502 }],
    ]);
  });

  it("confirms, cancels and resumes a job by id, each through its own mutation", async () => {
    const confirmed = { ...job, status: "queued" };
    const cancelled = { ...job, status: "cancelled" };
    const resumed = { ...job, status: "running" };
    const { ops, query } = opsReturning(
      { recordImport: { confirm: confirmed } },
      { recordImport: { cancel: cancelled } },
      { recordImport: { resume: resumed } },
    );

    expect(await ops.recordImports.confirm("j1")).toBe(confirmed);
    expect(await ops.recordImports.cancel("j2")).toBe(cancelled);
    expect(await ops.recordImports.resume("j3")).toBe(resumed);

    expect(query.mock.calls).toEqual([
      [CONFIRM_RECORD_IMPORT_MUTATION, { jobId: "j1" }],
      [CANCEL_RECORD_IMPORT_MUTATION, { jobId: "j2" }],
      [RESUME_RECORD_IMPORT_MUTATION, { jobId: "j3" }],
    ]);
  });

  it("reads a job by id and a model's active and latest import", async () => {
    const latest = { ...job, id: "j9", status: "completed" };
    const { ops, query } = opsReturning(
      { recordImport: { job } },
      { recordImport: { active: null } },
      { recordImport: { latest } },
    );

    expect(await ops.recordImports.job("j1")).toBe(job);
    expect(await ops.recordImports.active("m1")).toBeNull();
    expect(await ops.recordImports.latest("m1")).toBe(latest);

    expect(query.mock.calls).toEqual([
      [RECORD_IMPORT_JOB_QUERY, { id: "j1" }],
      [ACTIVE_RECORD_IMPORT_QUERY, { modelId: "m1" }],
      [LATEST_RECORD_IMPORT_QUERY, { modelId: "m1" }],
    ]);
  });

  it("pages rows of one status, leaving out the paging arguments the caller did not give", async () => {
    const page = { rows: [{ row: 7, status: "invalid" }], nextAfter: 7 };
    const { ops, query } = opsReturning(
      { recordImport: { rows: page } },
      { recordImport: { rows: page } },
    );

    expect(
      await ops.recordImports.rows("j1", "invalid", { after: 0, limit: 50 }),
    ).toBe(page);
    await ops.recordImports.rows("j1", "failed");

    expect(query.mock.calls).toEqual([
      [
        RECORD_IMPORT_ROWS_QUERY,
        { jobId: "j1", status: "invalid", after: 0, limit: 50 },
      ],
      [RECORD_IMPORT_ROWS_QUERY, { jobId: "j1", status: "failed" }],
    ]);
  });

  it("selects every field of the job the tools describe, on every document that returns one", () => {
    for (const [doc, parent] of [
      [CREATE_RECORD_IMPORT_MUTATION, "create"],
      [APPEND_RECORD_IMPORT_ROWS_MUTATION, "appendRows"],
      [START_RECORD_IMPORT_MUTATION, "start"],
      [CONFIRM_RECORD_IMPORT_MUTATION, "confirm"],
      [CANCEL_RECORD_IMPORT_MUTATION, "cancel"],
      [RESUME_RECORD_IMPORT_MUTATION, "resume"],
      [RECORD_IMPORT_JOB_QUERY, "job"],
      [ACTIVE_RECORD_IMPORT_QUERY, "active"],
      [LATEST_RECORD_IMPORT_QUERY, "latest"],
    ] as const) {
      expect([...selectedUnder(doc, parent)].sort(), parent).toEqual(
        [
          "id",
          "modelId",
          "status",
          "phase",
          "total",
          "validated",
          "processed",
          "created",
          "updated",
          "unchanged",
          "invalidCount",
          "failedCount",
          "failureReason",
          "error",
          "resumable",
          "sample",
          "createdAt",
          "startedAt",
          "finishedAt",
        ].sort(),
      );
      expect([...selectedUnder(doc, "sample")].sort(), parent).toEqual(
        ["data", "fileRow", "message", "recordId", "row", "status"],
      );
    }
  });

  it("selects the row page with its cursor", () => {
    expect([...selectedUnder(RECORD_IMPORT_ROWS_QUERY, "rows")].sort()).toEqual(
      [
        "data",
        "fileRow",
        "message",
        "nextAfter",
        "recordId",
        "row",
        "rows",
        "status",
      ],
    );
  });
});
