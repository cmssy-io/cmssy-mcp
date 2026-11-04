import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";

const PAGE_ID = "6a649386eb1877bb17dda959";

function clientWithPages(byRef: Record<string, string>) {
  const asked: unknown[] = [];
  const query = vi.fn(async (_document: string, variables?: unknown) => {
    const ref = (variables as { pageId: string }).pageId;
    asked.push(ref);
    const id = byRef[ref];
    return { page: { get: id ? { id, version: 3 } : null } };
  });
  return { client: { query } as unknown as CmssyClient, asked };
}

describe("pages.resolveId", () => {
  it("hands back the id page.get finds for the reference", async () => {
    const { client, asked } = clientWithPages({ "/about": PAGE_ID });

    await expect(
      createMcpWorkspaceOps(client).pages.resolveId("/about"),
    ).resolves.toBe(PAGE_ID);
    expect(asked).toEqual(["/about"]);
  });

  it("finds a slug given without its leading slash, as Spotlight does", async () => {
    const { client, asked } = clientWithPages({ "/about": PAGE_ID });

    await expect(
      createMcpWorkspaceOps(client).pages.resolveId("about"),
    ).resolves.toBe(PAGE_ID);
    expect(asked).toEqual(["about", "/about"]);
  });

  it("asks once for an id", async () => {
    const { client, asked } = clientWithPages({ [PAGE_ID]: PAGE_ID });

    await expect(
      createMcpWorkspaceOps(client).pages.resolveId(PAGE_ID),
    ).resolves.toBe(PAGE_ID);
    expect(asked).toEqual([PAGE_ID]);
  });

  it("reports null for a page that does not exist", async () => {
    const { client } = clientWithPages({});

    await expect(
      createMcpWorkspaceOps(client).pages.resolveId("/missing"),
    ).resolves.toBeNull();
  });
});
