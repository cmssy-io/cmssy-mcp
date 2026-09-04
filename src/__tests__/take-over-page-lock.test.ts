import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";

type Sent = { document: string; variables: Record<string, unknown> };

function clientAnswering(response: unknown) {
  const sent: Sent[] = [];
  const query = vi.fn(async (document: string, variables?: unknown) => {
    sent.push({ document, variables: (variables ?? {}) as Record<string, unknown> });
    return response;
  });
  return { client: { query } as unknown as CmssyClient, sent };
}

describe("pages.takeOverLock (CMS-1674)", () => {
  it("reassigns the lock through page.takeOverLock and reports who holds it now", async () => {
    const { client, sent } = clientAnswering({
      page: { takeOverLock: { lockHolderId: "me", lockHeldByMe: true } },
    });
    const ops = createMcpWorkspaceOps(client);

    const out = await ops.pages.takeOverLock("p1");

    expect(sent).toHaveLength(1);
    expect(sent[0].document).toContain("takeOverLock(pageId: $pageId)");
    expect(sent[0].variables).toStrictEqual({ pageId: "p1" });
    expect(
      out,
      "The agent retries its write only on lockHeldByMe; the tool must hand the server's answer back for the page it asked about.",
    ).toStrictEqual({ pageId: "p1", lockHolderId: "me", lockHeldByMe: true });
  });

  it("does not claim the lock when the server acquired nothing", async () => {
    const { client } = clientAnswering({
      page: { takeOverLock: { lockHolderId: null, lockHeldByMe: false } },
    });
    const ops = createMcpWorkspaceOps(client);

    await expect(ops.pages.takeOverLock("p1")).resolves.toStrictEqual({
      pageId: "p1",
      lockHolderId: null,
      lockHeldByMe: false,
    });
  });

  it("surfaces a refusal (FORBIDDEN, not found) instead of a fake lock", async () => {
    const query = vi.fn(async () => {
      throw new Error("Missing permission: pages:edit or pages:publish");
    });
    const ops = createMcpWorkspaceOps({ query } as unknown as CmssyClient);

    await expect(ops.pages.takeOverLock("p1")).rejects.toThrow(
      "Missing permission",
    );
  });
});
