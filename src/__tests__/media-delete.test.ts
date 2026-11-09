import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";

function clientDeleting(deletedCount: number) {
  const sent: Array<{ document: string; variables: Record<string, unknown> }> =
    [];
  const query = vi.fn(async (document: string, variables?: unknown) => {
    sent.push({
      document,
      variables: (variables ?? {}) as Record<string, unknown>,
    });
    return { media: { delete: { deletedCount, success: deletedCount > 0 } } };
  });
  return { client: { query } as never, sent };
}

describe("deleting media from an agent (CMS-2215)", () => {
  it("sends the ids and reports the server's count, not the number asked for", async () => {
    const { client, sent } = clientDeleting(1);
    const ops = createMcpWorkspaceOps(client);

    const result = await ops.media.delete(["a1", "other-workspace"]);

    expect(sent[0].document).toContain("delete(ids: $ids, force: $force)");
    expect(sent[0].variables).toEqual({
      ids: ["a1", "other-workspace"],
      force: false,
    });
    expect(result).toEqual({ deleted: 1 });
  });

  it("carries force to the server, so a refusal the agent showed can be acted on", async () => {
    const { client, sent } = clientDeleting(1);
    const ops = createMcpWorkspaceOps(client);

    await ops.media.delete(["a1"], true);

    expect(sent[0].variables).toMatchObject({ force: true });
  });
});
