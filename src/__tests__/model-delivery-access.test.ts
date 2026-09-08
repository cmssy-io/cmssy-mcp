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

const fields = [
  { key: "title", label: "Title", type: "text" as const, required: false },
];
const MODEL_ID = "64b1f0c2a3d4e5f60718293a";

describe("models.create deliveryAccess (CMS-1768)", () => {
  it("forwards deliveryAccess to the create mutation", async () => {
    const { client, sent } = clientAnswering([
      {
        model: {
          create: { id: "m1", name: "Post", slug: "post", fields: [{}] },
        },
      },
    ]);
    const ops = createMcpWorkspaceOps(client);

    await ops.models.create({ name: "Post", fields, deliveryAccess: "public" });

    const input = sent[0]!.variables.input as Record<string, unknown>;
    expect(input.deliveryAccess).toBe("public");
  });

  it("leaves deliveryAccess out of the mutation when the tool did not set it", async () => {
    const { client, sent } = clientAnswering([
      {
        model: {
          create: { id: "m1", name: "Post", slug: "post", fields: [{}] },
        },
      },
    ]);
    const ops = createMcpWorkspaceOps(client);

    await ops.models.create({ name: "Post", fields });

    const input = sent[0]!.variables.input as Record<string, unknown>;
    expect(input).not.toHaveProperty("deliveryAccess");
  });
});

describe("models.update deliveryAccess (CMS-1768)", () => {
  it("forwards a deliveryAccess flip to the update mutation", async () => {
    const { client, sent } = clientAnswering([
      { model: { get: { id: MODEL_ID, name: "Post", fields: [] } } },
      {
        model: {
          update: { id: MODEL_ID, name: "Post", slug: "post", fields: [{}] },
        },
      },
    ]);
    const ops = createMcpWorkspaceOps(client);

    await ops.models.update(MODEL_ID, { deliveryAccess: "public" });

    const update = sent[sent.length - 1]!;
    expect(update.document).toContain("mutation");
    const input = update.variables.input as Record<string, unknown>;
    expect(input.deliveryAccess).toBe("public");
  });
});
