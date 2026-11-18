import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSchema, isInputObjectType } from "graphql";
import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";
import {
  CREATE_MANUAL_ORDER_MUTATION,
  CREATE_RETURN_MUTATION,
} from "../queries.js";

// CMS-2269: an agent that retries create_manual_order / create_return after a
// timeout passes the same idempotencyKey; it must reach the GraphQL input, or
// the retry creates a second order or return.

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

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const schema = buildSchema(
  readFileSync(resolve(root, "schema.graphql"), "utf8"),
);

describe("idempotency key on order creates (CMS-2269)", () => {
  it("createManual sends the key in the order input", async () => {
    const { client, sent } = clientAnswering([
      { order: { create: { id: "o-1", orderNumber: 1 } } },
    ]);
    const items = [{ recordId: "p-1", quantity: 1 }];

    await createMcpWorkspaceOps(client).orders.createManual(
      "a@example.com",
      items,
      undefined,
      undefined,
      undefined,
      "order-7f3a",
    );

    expect(sent[0]!.document).toBe(CREATE_MANUAL_ORDER_MUTATION);
    expect(sent[0]!.variables).toEqual({
      input: {
        customerEmail: "a@example.com",
        items,
        idempotencyKey: "order-7f3a",
      },
    });
  });

  it("createReturn sends the key in the return input", async () => {
    const { client, sent } = clientAnswering([
      { order: { createReturn: { id: "o-1", orderNumber: 1 } } },
    ]);
    const lines = [{ itemId: "i-1", quantity: 1, reason: "other" as const }];

    await createMcpWorkspaceOps(client).orders.createReturn("o-1", {
      lines,
      idempotencyKey: "return-91c2",
    });

    expect(sent[0]!.document).toBe(CREATE_RETURN_MUTATION);
    expect(sent[0]!.variables).toEqual({
      input: { orderId: "o-1", lines, idempotencyKey: "return-91c2" },
    });
  });

  it("the API declares the key on both inputs", () => {
    for (const name of ["CreateManualOrderInput", "CreateReturnInput"]) {
      const type = schema.getType(name);
      if (!isInputObjectType(type)) throw new Error(`${name} missing`);
      expect(Object.keys(type.getFields())).toContain("idempotencyKey");
    }
  });
});
