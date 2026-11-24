import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";

function clientWithPage(page: { id: string; published: boolean } | null) {
  const documents: string[] = [];
  const query = vi.fn(async (document: string) => {
    documents.push(document);
    if (/togglePublish/.test(document)) {
      return { page: { togglePublish: { id: page?.id, published: false } } };
    }
    return { page: { get: page } };
  });
  return { client: { query } as unknown as CmssyClient, documents };
}

const toggled = (documents: string[]) =>
  documents.filter((d) => /togglePublish/.test(d)).length;

describe("pages.unpublish never publishes", () => {
  it("toggles a published page off", async () => {
    const { client, documents } = clientWithPage({ id: "p1", published: true });

    const out = await createMcpWorkspaceOps(client).pages.unpublish("p1");

    expect(toggled(documents)).toBe(1);
    expect(out).toStrictEqual({ id: "p1" });
  });

  it("leaves a page that is not published untouched instead of toggling it live", async () => {
    const { client, documents } = clientWithPage({
      id: "p1",
      published: false,
    });

    const out = await createMcpWorkspaceOps(client).pages.unpublish("p1");

    expect(toggled(documents)).toBe(0);
    expect(out).toStrictEqual({ id: "p1" });
  });

  it("refuses a page that does not exist", async () => {
    const { client, documents } = clientWithPage(null);

    await expect(
      createMcpWorkspaceOps(client).pages.unpublish("missing"),
    ).rejects.toThrow("Page not found");
    expect(toggled(documents)).toBe(0);
  });
});
