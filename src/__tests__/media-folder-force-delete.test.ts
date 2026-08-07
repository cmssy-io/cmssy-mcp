import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";

function clientRecording() {
  const sent: Array<{ document: string; variables: Record<string, unknown> }> =
    [];
  const query = vi.fn(async (document: string, variables?: unknown) => {
    sent.push({
      document,
      variables: (variables ?? {}) as Record<string, unknown>,
    });
    return { media: { deleteFolder: { id: "f1", deleted: true } } };
  });
  return { client: { query } as never, sent };
}

describe("forcing a folder delete from an agent (CMS-1164)", () => {
  it("carries force to the server, so a refusal the agent showed can be acted on", async () => {
    const { client, sent } = clientRecording();
    const ops = createMcpWorkspaceOps(client);

    await ops.media.deleteFolder("f1", true, true);

    expect(sent[0].document).toContain("$force: Boolean");
    expect(sent[0].document).toContain("force: $force");
    expect(sent[0].variables).toMatchObject({
      id: "f1",
      deleteContents: true,
      force: true,
    });
  });

  it("does not force what the caller did not ask to force", async () => {
    const { client, sent } = clientRecording();
    const ops = createMcpWorkspaceOps(client);

    await ops.media.deleteFolder("f1", true);

    expect(sent[0].variables).toMatchObject({ force: false });
  });
});
