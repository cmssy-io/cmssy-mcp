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
const bySlug = { model: { list: [{ id: MODEL_ID, slug: "part" }] } };
const resolved = { model: { get: { id: MODEL_ID, name: "Part", fields: [] } } };
const outcome = {
  updated: 2,
  unchanged: 1,
  failedCount: 0,
  failed: [],
  nextCursor: null,
};

describe("models.bulkUpdateRecords", () => {
  it("sends the chosen ids and the patch under the resolved model id", async () => {
    const { client, sent } = clientAnswering([
      bySlug,
      resolved,
      { record: { bulkUpdate: outcome } },
    ]);

    const result = await createMcpWorkspaceOps(client).models.bulkUpdateRecords(
      "part",
      { ids: ["r1", "r2", "r3"] },
      { data: { stock: 0 }, status: "archived" },
    );

    expect(result).toEqual(outcome);
    expect(sent[2]!.document).toContain("bulkUpdate(input: $input)");
    expect(sent[2]!.variables).toEqual({
      input: {
        modelId: MODEL_ID,
        ids: ["r1", "r2", "r3"],
        data: { stock: 0 },
        status: "archived",
      },
    });
  });

  it("selects every match of a filter and continues from a cursor", async () => {
    const { client, sent } = clientAnswering([
      resolved,
      { record: { bulkUpdate: { ...outcome, nextCursor: "c2" } } },
    ]);

    const result = await createMcpWorkspaceOps(client).models.bulkUpdateRecords(
      MODEL_ID,
      { allMatching: true, filter: { color: "red" } },
      { status: "published" },
      "c1",
    );

    expect(result?.nextCursor).toBe("c2");
    expect(sent[1]!.variables).toEqual({
      input: {
        modelId: MODEL_ID,
        allMatching: true,
        filter: { color: "red" },
        status: "published",
        cursor: "c1",
      },
    });
  });

  it("answers null for a model the workspace does not have, writing nothing", async () => {
    const { client, sent } = clientAnswering([{ model: { list: [] } }]);

    const result = await createMcpWorkspaceOps(client).models.bulkUpdateRecords(
      "missing",
      { ids: ["r1"] },
      { status: "published" },
    );

    expect(result).toBeNull();
    expect(sent).toHaveLength(1);
  });
});
