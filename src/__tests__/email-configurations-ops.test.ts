import { parse, visit, type FieldNode } from "graphql";
import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";
import { EMAIL_CONFIGURATIONS_QUERY } from "../queries.js";

function selectedUnder(document: string, parent: string): string[] {
  const names: string[] = [];
  visit(parse(document), {
    Field(node: FieldNode) {
      if (node.name.value !== parent || !node.selectionSet) return;
      for (const sel of node.selectionSet.selections) {
        if (sel.kind === "Field") names.push(sel.name.value);
      }
    },
  });
  return names.sort();
}

function clientAnswering(answer: unknown) {
  const query = vi.fn(async () => answer);
  return { client: { query } as unknown as CmssyClient, query };
}

describe("emailConfigurations.list", () => {
  it("selects the identifying fields and nothing that holds a credential or an address list", () => {
    expect(selectedUnder(EMAIL_CONFIGURATIONS_QUERY, "items")).toEqual(
      [
        "id",
        "name",
        "slug",
        "description",
        "provider",
        "fromEmail",
        "fromName",
        "replyTo",
        "isDefault",
        "isActive",
        "recipientsCount",
      ].sort(),
    );
  });

  it("asks for active configurations when the flag is absent", async () => {
    const { client, query } = clientAnswering({
      email: { configurations: { items: [], total: 0 } },
    });

    await createMcpWorkspaceOps(client).emailConfigurations.list();

    expect(query).toHaveBeenCalledWith(EMAIL_CONFIGURATIONS_QUERY, {
      includeInactive: false,
    });
  });

  it("forwards includeInactive and returns the list as served", async () => {
    const page = { items: [{ id: "cfg-1" }], total: 1 };
    const { client, query } = clientAnswering({
      email: { configurations: page },
    });

    await expect(
      createMcpWorkspaceOps(client).emailConfigurations.list(true),
    ).resolves.toEqual(page);
    expect(query).toHaveBeenCalledWith(EMAIL_CONFIGURATIONS_QUERY, {
      includeInactive: true,
    });
  });
});
