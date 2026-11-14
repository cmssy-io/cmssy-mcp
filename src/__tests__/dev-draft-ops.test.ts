import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";

type Sent = { document: string; variables: Record<string, unknown> };

function devDraftClient(blockWarnings: string[] | null) {
  const sent: Sent[] = [];
  const query = vi.fn(async (document: string, variables?: unknown) => {
    sent.push({
      document,
      variables: (variables ?? {}) as Record<string, unknown>,
    });
    if (document.includes("saveDevDraft")) {
      return {
        page: {
          saveDevDraft: {
            pageId: "p1",
            blockWarnings,
            updatedAt: "2026-11-14T00:00:00.000Z",
          },
        },
      };
    }
    if (document.includes("promoteDevDraft")) {
      return {
        page: { promoteDevDraft: { id: "p1", blockWarnings, updatedAt: null } },
      };
    }
    if (document.includes("query DevDraft")) {
      return {
        page: {
          devDraft: {
            blocks: [{ id: "b1", type: "hero", content: { en: {} } }],
          },
        },
      };
    }
    return { page: { get: { id: "p1", version: 3, blocks: [] } } };
  });
  return { client: { query } as unknown as CmssyClient, sent };
}

function promoteInput(sent: Sent[]): Record<string, unknown> {
  const call = sent.find((entry) => entry.document.includes("promoteDevDraft"));
  return call?.variables.input as Record<string, unknown>;
}

describe("dev draft ops (CMS-2261)", () => {
  it("selects blockWarnings on saveDevDraft and returns them", async () => {
    const { client, sent } = devDraftClient(["unknown field title"]);
    const ops = createMcpWorkspaceOps(client);

    const result = await ops.pages.saveDevDraft("p1", [
      { id: "b1", type: "hero" },
    ]);

    const save = sent.find((entry) => entry.document.includes("saveDevDraft"));
    expect(save?.document).toMatch(/\bblockWarnings\b/);
    expect(result).toEqual({
      id: "p1",
      blockWarnings: ["unknown field title"],
    });
  });

  it("returns no blockWarnings key when the save is clean", async () => {
    const { client } = devDraftClient(null);
    const ops = createMcpWorkspaceOps(client);

    const result = await ops.pages.saveDevDraft("p1", []);

    expect(result).toEqual({ id: "p1" });
  });

  it("returns blockWarnings from a dev-draft block update", async () => {
    const { client, sent } = devDraftClient(["unknown field title"]);
    const ops = createMcpWorkspaceOps(client);

    const result = await ops.pages.updateBlock(
      "p1",
      "b1",
      { en: { title: "Hi" } },
      undefined,
      "merge",
      "devDraft",
    );

    expect(sent.some((entry) => entry.document.includes("saveDevDraft"))).toBe(
      true,
    );
    expect(result).toEqual({
      pageId: "p1",
      blockId: "b1",
      blockWarnings: ["unknown field title"],
    });
  });

  it("sends force: true when the caller forces the promote", async () => {
    const { client, sent } = devDraftClient(null);
    const ops = createMcpWorkspaceOps(client);

    await ops.pages.promoteDevDraft("p1", { force: true });

    expect(promoteInput(sent)).toEqual({
      pageId: "p1",
      expectedVersion: 3,
      force: true,
    });
  });

  it("leaves force out of the input unless it is true", async () => {
    const { client, sent } = devDraftClient(null);
    const ops = createMcpWorkspaceOps(client);

    await ops.pages.promoteDevDraft("p1", { force: false });
    await ops.pages.promoteDevDraft("p1");

    const inputs = sent
      .filter((entry) => entry.document.includes("promoteDevDraft"))
      .map((entry) => entry.variables.input);
    expect(inputs).toEqual([
      { pageId: "p1", expectedVersion: 3 },
      { pageId: "p1", expectedVersion: 3 },
    ]);
  });
});
