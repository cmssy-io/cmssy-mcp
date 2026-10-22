import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";
import { ADMIN_CARTS_QUERY, DELETE_CARTS_MUTATION } from "../queries.js";

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

  it("list selects the channel each cart was started on and returns it", async () => {
    const page = {
      items: [{ id: "c1", status: "active", channel: "horeca" }],
      total: 1,
      hasMore: false,
    };
    const query = vi.fn().mockResolvedValue({ adminCart: { list: page } });
    const ops = createMcpWorkspaceOps({ query } as unknown as CmssyClient);

    expect(await ops.carts.list("active")).toEqual(page);
    expect(query).toHaveBeenCalledWith(ADMIN_CARTS_QUERY, {
      status: "active",
      skip: 0,
      limit: 20,
    });
    expect(ADMIN_CARTS_QUERY).toMatch(/\bchannel\b/);
  });
});
