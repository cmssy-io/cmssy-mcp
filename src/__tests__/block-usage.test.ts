import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";

const report = {
  manifestPresent: true,
  orphanTypes: ["legacy"],
  unusedTypes: [],
  types: [
    {
      type: "legacy",
      registered: false,
      draftCount: 1,
      publishedCount: 0,
      layoutDraftCount: 0,
      layoutPublishedCount: 0,
      devDraftCount: 0,
      historyCount: null,
      pages: [{ id: "p1", name: "Home", slug: "/", surfaces: ["draft"] }],
    },
  ],
};

function clientAnswering(response: unknown) {
  const query = vi.fn(async (_document: string, _variables?: unknown) => response);
  return { client: { query } as unknown as CmssyClient, query };
}

describe("workspace.blockUsage (CMS-1881)", () => {
  it("asks blockManifest.usage with the caller's filters and returns its report", async () => {
    const { client, query } = clientAnswering({ blockManifest: { usage: report } });
    const ops = createMcpWorkspaceOps(client);

    const out = await ops.workspace.blockUsage({
      types: ["legacy"],
      includeHistory: true,
    });

    expect(out).toStrictEqual(report);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain(
      "usage(types: $types, includeHistory: $includeHistory)",
    );
    expect(query.mock.calls[0][1]).toStrictEqual({
      types: ["legacy"],
      includeHistory: true,
    });
  });

  it("sends null for filters the caller left out", async () => {
    const { client, query } = clientAnswering({ blockManifest: { usage: report } });

    await createMcpWorkspaceOps(client).workspace.blockUsage({});

    expect(query.mock.calls[0][1]).toStrictEqual({
      types: null,
      includeHistory: null,
    });
  });
});
