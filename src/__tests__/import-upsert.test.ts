import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";

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

const MODEL_ID = "64b1f0c2a3d4e5f60718293a";
const resolved = { model: { get: { id: MODEL_ID, name: "Part", fields: [] } } };
const fields = [
  { key: "code", label: "Code", type: "text" as const, required: false },
];
const imported = {
  importedCount: 1,
  updatedCount: 1,
  errors: [],
  records: [
    { row: 1, id: "r1", action: "UPDATED" },
    { row: 2, id: "r2", action: "CREATED" },
  ],
};

describe("models.importRecords upsertKey (CMS-1837)", () => {
  it("sends upsertKey and returns the per-row outcome", async () => {
    const { client, sent } = clientAnswering([
      resolved,
      { record: { import: imported } },
    ]);
    const ops = createMcpWorkspaceOps(client);
    const rows = [{ code: "A" }, { code: "B" }];

    const result = await ops.models.importRecords(MODEL_ID, rows, {
      upsertKey: "code",
    });

    const last = sent[sent.length - 1]!;
    expect(last.variables.input).toStrictEqual({
      modelId: MODEL_ID,
      rows,
      upsertKey: "code",
    });
    expect(last.document).toContain("updatedCount");
    expect(last.document).toContain("records { row id action }");
    expect(result).toStrictEqual(imported);
  });

  it("passes an empty upsertKey through so the backend refuses it", async () => {
    const { client, sent } = clientAnswering([
      resolved,
      { record: { import: imported } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    await ops.models.importRecords(MODEL_ID, [{ code: "A" }], {
      upsertKey: "",
    });

    const input = sent[sent.length - 1]!.variables.input as object;
    expect(input).toHaveProperty("upsertKey", "");
  });

  it("leaves upsertKey out of an insert-only import", async () => {
    const { client, sent } = clientAnswering([
      resolved,
      { record: { import: imported } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    await ops.models.importRecords(MODEL_ID, [{ code: "A" }]);

    const input = sent[sent.length - 1]!.variables.input as object;
    expect(input).not.toHaveProperty("upsertKey");
  });
});

describe("models uniqueFields (CMS-1837)", () => {
  it("forwards uniqueFields on create, and omits it when not set", async () => {
    const created = {
      model: { create: { id: "m1", name: "Part", slug: "part", fields: [{}] } },
    };
    const { client, sent } = clientAnswering([created, created]);
    const ops = createMcpWorkspaceOps(client);

    await ops.models.create({ name: "Part", fields, uniqueFields: ["code"] });
    await ops.models.create({ name: "Part", fields });

    expect(sent[0]!.variables.input).toHaveProperty("uniqueFields", ["code"]);
    expect(sent[1]!.variables.input).not.toHaveProperty("uniqueFields");
  });

  it("forwards an empty uniqueFields on update so the list can be cleared", async () => {
    const { client, sent } = clientAnswering([
      resolved,
      {
        model: {
          update: { id: MODEL_ID, name: "Part", slug: "part", fields: [{}] },
        },
      },
    ]);
    const ops = createMcpWorkspaceOps(client);

    await ops.models.update(MODEL_ID, { uniqueFields: [] });

    const input = sent[sent.length - 1]!.variables.input as object;
    expect(input).toHaveProperty("uniqueFields", []);
  });

  it("reads uniqueFields back on get_model, defaulting to an empty list", async () => {
    const detail = (uniqueFields: unknown) => ({
      model: {
        get: {
          id: MODEL_ID,
          name: "Part",
          slug: "part",
          fields: [],
          uniqueFields,
        },
      },
    });
    const { client, sent } = clientAnswering([
      resolved,
      detail(["code"]),
      resolved,
      detail(null),
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect((await ops.models.get(MODEL_ID))?.uniqueFields).toStrictEqual([
      "code",
    ]);
    expect((await ops.models.get(MODEL_ID))?.uniqueFields).toStrictEqual([]);
    expect(sent[1]!.document).toContain("uniqueFields");
  });
});
