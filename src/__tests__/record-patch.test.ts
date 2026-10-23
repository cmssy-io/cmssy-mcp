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

describe("record visibility (CMS-2145)", () => {
  it("sends a visibility-only update to setPublished and nothing else", async () => {
    const { client, sent } = clientAnswering([
      storedRecord,
      model,
      { record: { setPublished: { id: RECORD_ID } } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    const result = await ops.models.updateRecord(RECORD_ID, {
      published: false,
    });

    expect(sent).toHaveLength(3);
    expect(sent[2]!.document).toContain(
      "setPublished(id: $id, published: $published)",
    );
    expect(
      sent[2]!.variables,
      "update_record { published: false } must reach the backend, or the agent reports a hidden product that is still live.",
    ).toEqual({ id: RECORD_ID, published: false });
    expect(result?.id).toBe(RECORD_ID);
  });

  it("answers null when setPublished matched no record", async () => {
    const { client } = clientAnswering([
      storedRecord,
      model,
      { record: { setPublished: null } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect(
      await ops.models.updateRecord(RECORD_ID, { published: true }),
    ).toBeNull();
  });

  it("creates a record hidden only when asked", async () => {
    const { client, sent } = clientAnswering([
      model,
      { record: { create: { id: RECORD_ID } } },
      model,
      { record: { create: { id: RECORD_ID } } },
    ]);
    const ops = createMcpWorkspaceOps(client);

    await ops.models.createRecord(MODEL_ID, { sku: "X" }, false);
    await ops.models.createRecord(MODEL_ID, { sku: "Y" });

    const creates = sent.filter((s) => s.document.includes("create(input"));
    expect(creates[0]!.variables).toEqual({
      input: { modelId: MODEL_ID, data: { sku: "X" }, published: false },
    });
    expect(
      creates[1]!.variables,
      "Leaving published out keeps the server default (live), so an older caller's create is unchanged.",
    ).toEqual({ input: { modelId: MODEL_ID, data: { sku: "Y" } } });
  });

  it("reads published back on a single record", async () => {
    const { client } = clientAnswering([
      {
        record: {
          get: { id: RECORD_ID, modelId: MODEL_ID, published: false, data: {} },
        },
      },
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect((await ops.models.getRecord(RECORD_ID))?.published).toBe(false);
  });
});
