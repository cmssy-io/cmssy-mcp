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

const RECORD_ID = "64b1f0c2a3d4e5f60718293b";
const MODEL_ID = "64b1f0c2a3d4e5f60718293a";

const storedRecord = {
  record: {
    get: {
      id: RECORD_ID,
      modelId: MODEL_ID,
      data: { title: { en: "Ball bearing" }, sku: "BRG-1", weight: 5 },
    },
  },
};
const model = {
  model: { get: { id: MODEL_ID, name: "Part", displayField: "sku" } },
};

describe("models.updateRecord (CMS-1840)", () => {
  it("sends only the caller's fields to the server-side patch", async () => {
    const { client, sent } = clientAnswering([
      storedRecord,
      model,
      {
        record: {
          patch: {
            id: RECORD_ID,
            data: {
              title: { en: "Ball bearing", pl: "Łożysko" },
              sku: "BRG-2",
            },
          },
        },
      },
    ]);
    const ops = createMcpWorkspaceOps(client);

    const result = await ops.models.updateRecord(RECORD_ID, {
      data: { title: { pl: "Łożysko" }, sku: "BRG-2" },
    });

    expect(sent).toHaveLength(3);
    expect(sent[2]!.document).toContain("patch(input: $input)");
    expect(sent[2]!.variables).toEqual({
      input: {
        id: RECORD_ID,
        data: { title: { pl: "Łożysko" }, sku: "BRG-2" },
      },
    });
    expect(result).toEqual({
      id: RECORD_ID,
      label: "BRG-2",
      modelName: "Part",
      modelId: MODEL_ID,
    });
  });

  it("answers null when the patch matched no record", async () => {
    const { client } = clientAnswering([
      storedRecord,
      model,
      { record: { patch: null } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect(
      await ops.models.updateRecord(RECORD_ID, { data: { sku: "BRG-2" } }),
    ).toBeNull();
  });

  it("does not patch when only a status is sent", async () => {
    const { client, sent } = clientAnswering([
      storedRecord,
      model,
      {
        record: {
          setStatus: { id: RECORD_ID, data: { sku: "BRG-1" } },
        },
      },
    ]);
    const ops = createMcpWorkspaceOps(client);

    await ops.models.updateRecord(RECORD_ID, { status: "active" });

    expect(sent).toHaveLength(3);
    expect(sent.some((s) => s.document.includes("patch("))).toBe(false);
  });
});
