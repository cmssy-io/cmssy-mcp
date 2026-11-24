import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";

function clientRecordingVariables() {
  const variables: Record<string, unknown>[] = [];
  const query = vi.fn(async (_document: string, vars?: unknown) => {
    variables.push((vars ?? {}) as Record<string, unknown>);
    return { media: { folders: { items: [], total: 0 } } };
  });
  return { client: { query } as unknown as CmssyClient, variables };
}

describe("media.listFolders", () => {
  it("asks for the top-level folders when no parent is given, as Spotlight does", async () => {
    const { client, variables } = clientRecordingVariables();

    await createMcpWorkspaceOps(client).media.listFolders();

    expect(variables[0].parentId).toBe("");
  });

  it("asks for the children of the parent it was given", async () => {
    const { client, variables } = clientRecordingVariables();

    await createMcpWorkspaceOps(client).media.listFolders("f1");

    expect(variables[0].parentId).toBe("f1");
  });
});
