import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";
import { DELETE_CARTS_MUTATION } from "../queries.js";

describe("carts ops", () => {
  it("delete sends the ids to adminCart.delete and returns the count", async () => {
    const query = vi.fn().mockResolvedValue({ adminCart: { delete: 2 } });
    const ops = createMcpWorkspaceOps({ query } as unknown as CmssyClient);

    const deleted = await ops.carts.delete(["c1", "c2"]);

    expect(query).toHaveBeenCalledWith(DELETE_CARTS_MUTATION, {
      ids: ["c1", "c2"],
    });
    expect(DELETE_CARTS_MUTATION).toMatch(/adminCart \{ delete\(ids: \$ids\) \}/);
    expect(deleted).toBe(2);
  });
});
