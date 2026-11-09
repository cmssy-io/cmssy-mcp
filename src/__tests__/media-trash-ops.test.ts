import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";

function clientAnswering(data: unknown) {
  const sent: Array<{ document: string; variables: Record<string, unknown> }> =
    [];
  const query = vi.fn(async (document: string, variables?: unknown) => {
    sent.push({
      document,
      variables: (variables ?? {}) as Record<string, unknown>,
    });
    return data;
  });
  return { client: { query } as never, sent };
}

describe("the media trash from an agent (CMS-2215)", () => {
  it("pages through the trash", async () => {
    const page = { items: [], total: 0, hasMore: false };
    const { client, sent } = clientAnswering({ media: { trash: page } });

    const result = await createMcpWorkspaceOps(client).media.listTrash(10, 20);

    expect(sent[0].document).toContain("trash(limit: $limit, offset: $offset)");
    expect(sent[0].variables).toEqual({ limit: 10, offset: 20 });
    expect(result).toEqual(page);
  });

  it("restores the ids and reports the server's counts", async () => {
    const { client, sent } = clientAnswering({
      media: { restore: { restoredCount: 2, movedToRootCount: 1 } },
    });

    const result = await createMcpWorkspaceOps(client).media.restore([
      "a1",
      "a2",
      "not-in-trash",
    ]);

    expect(sent[0].document).toContain("restore(ids: $ids)");
    expect(sent[0].variables).toEqual({ ids: ["a1", "a2", "not-in-trash"] });
    expect(result).toEqual({ restored: 2, movedToRoot: 1 });
  });
});
