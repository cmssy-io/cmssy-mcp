import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import { toolAnnotations } from "../ai-tools-binder.js";
import type { CmssyClient } from "../graphql-client.js";
import { listTrashedPagesTool, restorePageTool } from "@cmssy/ai-tools";

type Sent = { document: string; variables: Record<string, unknown> };

function clientAnswering(response: unknown) {
  const sent: Sent[] = [];
  const query = vi.fn(async (document: string, variables?: unknown) => {
    sent.push({
      document,
      variables: (variables ?? {}) as Record<string, unknown>,
    });
    return response;
  });
  return { client: { query } as unknown as CmssyClient, sent };
}

const ENTRY = {
  id: "p1",
  name: "Docs",
  slug: "/docs",
  deletedAt: "2026-10-01T10:00:00.000Z",
  deletedById: "u1",
  deletedByName: "Ada",
  descendantCount: 1,
  expiresAt: "2026-10-31T10:00:00.000Z",
};

describe("pages.listTrash (CMS-2153)", () => {
  it("reads page.trash and hands every row back as the server sent it", async () => {
    const { client, sent } = clientAnswering({ page: { trash: [ENTRY] } });

    const out = await createMcpWorkspaceOps(client).pages.listTrash();

    expect(sent).toHaveLength(1);
    expect(sent[0].document).toMatch(/page\s*\{\s*trash\s*\{/);
    expect(out).toStrictEqual([ENTRY]);
  });
});

describe("pages.restore (CMS-2153)", () => {
  it("restores the trash id it was given through page.restore", async () => {
    const restored = {
      id: "p1",
      name: "Docs",
      slug: "/docs",
      parentId: null,
      published: false,
    };
    const { client, sent } = clientAnswering({
      page: { restore: restored },
    });

    const out = await createMcpWorkspaceOps(client).pages.restore("p1");

    expect(sent).toHaveLength(1);
    expect(sent[0].document).toContain("restore(id: $id)");
    expect(sent[0].variables).toStrictEqual({ id: "p1" });
    expect(out).toStrictEqual(restored);
  });

  it("surfaces the server's refusal instead of reporting a restore", async () => {
    const query = vi.fn(async () => {
      throw new Error(
        'Cannot restore: the slug "/docs" is already used by another page',
      );
    });
    const ops = createMcpWorkspaceOps({ query } as unknown as CmssyClient);

    await expect(ops.pages.restore("p1")).rejects.toThrow('"/docs"');
  });
});

describe("trash tool annotations (CMS-2153)", () => {
  it("lists the trash as a read", () => {
    expect(toolAnnotations(listTrashedPagesTool)).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
  });

  it("keeps restore a write", () => {
    expect(toolAnnotations(restorePageTool)).toMatchObject({
      readOnlyHint: false,
    });
  });
});
