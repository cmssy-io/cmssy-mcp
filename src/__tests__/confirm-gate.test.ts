import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { CONFIRM_GATED_TOOLS, cancelOrderTool } from "@cmssy/ai-tools";
import type { AiTool, WorkspaceOps } from "@cmssy/ai-tools";
import { toolInputSchema } from "../ai-tools-binder.js";
import { CONFIRM_ARG } from "../confirm-gate.js";
import { callBound as call, connectBound as connect } from "./mcp-harness.js";

function gatedTool(execute: AiTool["execute"]): AiTool {
  return {
    name: "delete_record",
    description: "a destructive tool",
    requiredPermissions: [],
    confirmGated: true,
    inputSchema: z.object({
      modelIdOrSlug: z.string(),
      recordId: z.string(),
    }) as unknown as AiTool["inputSchema"],
    execute,
  } as unknown as AiTool;
}

function resultJson(
  result: Awaited<ReturnType<typeof call>>,
): Record<string, unknown> {
  const text = (result.content as { text?: string }[])[0]?.text ?? "";
  return JSON.parse(text) as Record<string, unknown>;
}

const ARGS = { modelIdOrSlug: "products", recordId: "r1" };

afterEach(() => {
  vi.useRealTimers();
});

describe("the MCP confirm gate (CMS-2067)", () => {
  it("refuses the first call and does not execute - the moat claim is server-side on this surface too", async () => {
    const execute = vi.fn();
    const client = await connect([gatedTool(execute)], {} as WorkspaceOps);

    const result = await call(client, "delete_record", ARGS);
    const body = resultJson(result);

    expect(
      execute,
      "a gated tool executing on its first call is exactly the hole the funnel run found: cancel_order ran with no confirmation",
    ).not.toHaveBeenCalled();
    expect(body.needsConfirmation).toBe(true);
    expect(body.ref).toMatch(/^[0-9a-f]{8}$/);
    expect(body.instruction).toContain("NOT performed");
  });

  it("executes exactly once with the issued ref and refuses the replay", async () => {
    const execute = vi.fn().mockResolvedValue({ deleted: true });
    const client = await connect([gatedTool(execute)], {} as WorkspaceOps);

    const first = resultJson(await call(client, "delete_record", ARGS));
    const approved = await call(client, "delete_record", {
      ...ARGS,
      [CONFIRM_ARG]: first.ref,
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(
      execute.mock.calls[0]![0],
      "the ref must not leak into the tool's own input - ai-tools schemas never declared it",
    ).toEqual(ARGS);
    expect(resultJson(approved)).toEqual({ deleted: true });

    const replay = resultJson(
      await call(client, "delete_record", {
        ...ARGS,
        [CONFIRM_ARG]: first.ref,
      }),
    );
    expect(
      replay.needsConfirmation,
      "a consumed ref approving a second run would turn one approval into unlimited runs",
    ).toBe(true);
    expect(replay.refusedBecause).toBe("unknown-ref");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("refuses a ref when the arguments drifted - the approval covered different work", async () => {
    const execute = vi.fn();
    const client = await connect([gatedTool(execute)], {} as WorkspaceOps);

    const first = resultJson(await call(client, "delete_record", ARGS));
    const drifted = resultJson(
      await call(client, "delete_record", {
        modelIdOrSlug: "products",
        recordId: "r2",
        [CONFIRM_ARG]: first.ref,
      }),
    );

    expect(execute).not.toHaveBeenCalled();
    expect(drifted.refusedBecause).toBe("args-changed");
    expect(drifted.needsConfirmation).toBe(true);
  });

  it("refuses an expired ref and issues a fresh one", async () => {
    vi.useFakeTimers();
    const execute = vi.fn();
    const client = await connect([gatedTool(execute)], {} as WorkspaceOps);

    const first = resultJson(await call(client, "delete_record", ARGS));
    vi.advanceTimersByTime(601_000);
    const expired = resultJson(
      await call(client, "delete_record", {
        ...ARGS,
        [CONFIRM_ARG]: first.ref,
      }),
    );

    expect(execute).not.toHaveBeenCalled();
    expect(expired.refusedBecause).toBe("expired");
    expect(expired.ref).not.toBe(first.ref);
  });

  it("re-asking without a ref reuses the live pending ref instead of minting a parade of them", async () => {
    const execute = vi.fn();
    const client = await connect([gatedTool(execute)], {} as WorkspaceOps);

    const first = resultJson(await call(client, "delete_record", ARGS));
    const second = resultJson(await call(client, "delete_record", ARGS));
    expect(second.ref).toBe(first.ref);
  });

  it("an invented ref never executes", async () => {
    const execute = vi.fn();
    const client = await connect([gatedTool(execute)], {} as WorkspaceOps);

    const forged = resultJson(
      await call(client, "delete_record", {
        ...ARGS,
        [CONFIRM_ARG]: "deadbeef",
      }),
    );
    expect(execute).not.toHaveBeenCalled();
    expect(forged.refusedBecause).toBe("unknown-ref");
  });

  it("an ungated tool executes directly and does not advertise _confirm", async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const tool = {
      name: "list_records",
      description: "read",
      requiredPermissions: [],
      inputSchema: z.object({
        modelIdOrSlug: z.string(),
      }) as unknown as AiTool["inputSchema"],
      execute,
    } as unknown as AiTool;
    const client = await connect([tool], {} as WorkspaceOps);

    const result = await call(client, "list_records", {
      modelIdOrSlug: "products",
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(resultJson(result)).toEqual({ ok: true });
    expect(
      Object.keys(toolInputSchema(tool).shape),
      "advertising _confirm on a read tool would teach agents to pass it everywhere",
    ).not.toContain(CONFIRM_ARG);
  });

  it("a real gated tool from the registry advertises _confirm in its schema", () => {
    expect(cancelOrderTool.confirmGated).toBe(true);
    expect(Object.keys(toolInputSchema(cancelOrderTool).shape)).toContain(
      CONFIRM_ARG,
    );
  });

  it("pins the gated vocabulary this server enforces", () => {
    expect([...CONFIRM_GATED_TOOLS].sort()).toEqual([
      "bulk_delete_products",
      "bulk_update_products",
      "cancel_order",
      "clear_cart_config",
      "delete_form",
      "delete_form_submission",
      "delete_model",
      "delete_page",
      "delete_record",
      "delete_webhook",
      "promote_dev_draft",
      "publish_page",
      "refund_order",
      "revert_to_published",
      "rotate_webhook_secret",
      "suspend_customer",
      "unpublish_page",
    ]);
  });
});
