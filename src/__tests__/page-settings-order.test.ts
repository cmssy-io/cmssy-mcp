import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";
import { UPDATE_PAGE_SETTINGS_MUTATION } from "../queries.js";

type Sent = { document: string; variables: Record<string, unknown> };

function clientRecording() {
  const sent: Sent[] = [];
  const query = vi.fn(async (document: string, variables?: unknown) => {
    sent.push({
      document,
      variables: (variables ?? {}) as Record<string, unknown>,
    });
    if (document === UPDATE_PAGE_SETTINGS_MUTATION) {
      return { page: { updateSettings: { id: "p1" } } };
    }
    return { page: { get: { id: "p1", version: 4 } } };
  });
  return { client: { query } as unknown as CmssyClient, sent };
}

describe("update_page_settings - order reaches the mutation (CMS-1904)", () => {
  it("forwards order next to parentId", async () => {
    const { client, sent } = clientRecording();
    const ops = createMcpWorkspaceOps(client);

    await ops.pages.updateSettings("p1", { parentId: "docs1", order: 3 });

    const write = sent.find((s) => s.document === UPDATE_PAGE_SETTINGS_MUTATION);
    expect(write?.variables.input).toMatchObject({
      id: "p1",
      parentId: "docs1",
      order: 3,
    });
  });

  it("does not invent an order when none was given", async () => {
    const { client, sent } = clientRecording();
    const ops = createMcpWorkspaceOps(client);

    await ops.pages.updateSettings("p1", { name: "Docs" });

    const write = sent.find((s) => s.document === UPDATE_PAGE_SETTINGS_MUTATION);
    expect(write?.variables.input).not.toHaveProperty("order");
  });
});
