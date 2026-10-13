import { describe, expect, it, vi } from "vitest";
import { CONFIRM_GATED_TOOLS } from "@cmssy/ai-tools";
import { createServer } from "../server.js";
import { toolAnnotations } from "../ai-tools-binder.js";
import type { CmssyClient } from "../graphql-client.js";
import { connectServer } from "./mcp-harness.js";

async function listedTools() {
  const server = createServer({ query: vi.fn() } as unknown as CmssyClient);
  const client = await connectServer(server);
  const { tools } = await client.listTools();
  return tools;
}

describe("tool annotations for the Claude directory", () => {
  it("lists the server's tools at all", async () => {
    expect((await listedTools()).length).toBeGreaterThan(90);
  });

  it("gives every tool a title and an explicit read-only or destructive hint", async () => {
    const missing = (await listedTools())
      .filter(
        (tool) =>
          !tool.title ||
          tool.annotations?.title !== tool.title ||
          typeof tool.annotations?.readOnlyHint !== "boolean" ||
          typeof tool.annotations?.destructiveHint !== "boolean",
      )
      .map((tool) => tool.name);

    expect(missing).toEqual([]);
  });

  it("marks every confirm-gated tool destructive and never read-only", async () => {
    const gated = (await listedTools()).filter((tool) =>
      CONFIRM_GATED_TOOLS.has(tool.name),
    );

    expect(gated.length).toBe(CONFIRM_GATED_TOOLS.size);
    expect(
      gated
        .filter(
          (tool) =>
            tool.annotations?.destructiveHint !== true ||
            tool.annotations?.readOnlyHint !== false,
        )
        .map((tool) => tool.name),
    ).toEqual([]);
  });

  it("never calls a read-only tool destructive", async () => {
    const contradictory = (await listedTools())
      .filter(
        (tool) =>
          tool.annotations?.readOnlyHint === true &&
          tool.annotations?.destructiveHint !== false,
      )
      .map((tool) => tool.name);

    expect(contradictory).toEqual([]);
  });

  it("splits reads from writes by name and permission", async () => {
    const byName = Object.fromEntries(
      (await listedTools()).map((tool) => [tool.name, tool.annotations]),
    );

    expect(byName.list_pages).toMatchObject({
      title: "List pages",
      readOnlyHint: true,
      destructiveHint: false,
    });
    expect(byName.get_workspace_info?.readOnlyHint).toBe(true);
    expect(byName.create_page).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    });
    expect(byName.update_page_blocks).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
    expect(byName.refund_order).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
    expect(byName.update_region_settings?.readOnlyHint).toBe(false);
  });

  it("lets the confirm gate outrank a read-like or additive name", () => {
    expect(
      toolAnnotations({
        name: "create_snapshot",
        requiredPermissions: ["pages:edit"],
        confirmGated: true,
      }),
    ).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(
      toolAnnotations({
        name: "list_and_purge",
        requiredPermissions: ["pages:view"],
        confirmGated: true,
      }),
    ).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it("keeps a read-like name with a write permission off the read-only list", () => {
    expect(
      toolAnnotations({
        name: "get_and_lock",
        requiredPermissions: ["pages:edit"],
      }),
    ).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it("keeps a write-like name with no permission off the read-only list", () => {
    expect(
      toolAnnotations({ name: "touch_session", requiredPermissions: [] }),
    ).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });
});
