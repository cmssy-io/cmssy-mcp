import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AiTool, WorkspaceOps } from "@cmssy/ai-tools";
import { bindSharedTool } from "../ai-tools-binder.js";
import { TOOL_HEADER, clientHeaders } from "../client-marker.js";

describe("a bound tool runs inside its own tool call (CMS-1865)", () => {
  it("lets the client name the tool while the tool executes", async () => {
    let handler: ((input: unknown) => Promise<unknown>) | undefined;
    const server = {
      tool: (_n: string, _d: string, _s: unknown, fn: typeof handler) => {
        handler = fn;
      },
    } as unknown as McpServer;
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

    bindSharedTool(server, tool, {} as WorkspaceOps);
    await handler?.({});

    expect(seen?.[TOOL_HEADER]).toBe("list_pages");
    expect(clientHeaders("0.0.0")).not.toHaveProperty(TOOL_HEADER);
  });
});
