import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { AiTool, WorkspaceOps } from "@cmssy/ai-tools";
import { TOOL_HEADER, clientHeaders } from "../client-marker.js";
import { callBound, connectBound } from "./mcp-harness.js";

describe("a bound tool runs inside its own tool call (CMS-1865)", () => {
  it("lets the client name the tool while the tool executes", async () => {
    let seen: Record<string, string> | undefined;
    const tool = {
      name: "list_pages",
      description: "",
      inputSchema: z.object({}),
      execute: async () => {
        seen = clientHeaders("0.0.0");
        return { ok: true };
      },
    } as unknown as AiTool;

    const client = await connectBound([tool], {} as WorkspaceOps);
    await callBound(client, "list_pages", {});

    expect(seen?.[TOOL_HEADER]).toBe("list_pages");
    expect(clientHeaders("0.0.0")).not.toHaveProperty(TOOL_HEADER);
  });
});
