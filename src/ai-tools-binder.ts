import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AiTool, WorkspaceOps } from "@cmssy/ai-tools";

const jsonPreprocess = (val: unknown) => {
  if (typeof val !== "string") return val;
  try {
    const parsed: unknown = JSON.parse(val);
    return parsed !== null && typeof parsed === "object" ? parsed : val;
  } catch {
    return val;
  }
};

const declarations = new WeakMap<McpServer, Map<string, AiTool>>();

export function boundDeclarations(server: McpServer): Map<string, AiTool> {
  return declarations.get(server) ?? new Map();
}

export function bindSharedTool(
  server: McpServer,
  tool: AiTool,
  ops: WorkspaceOps,
): void {
  const declared = declarations.get(server) ?? new Map<string, AiTool>();
  declared.set(tool.name, tool);
  declarations.set(server, declared);

  const shape = (tool.inputSchema as unknown as z.ZodObject<z.ZodRawShape>)
    .shape;
  const mcpShape: z.ZodRawShape = Object.fromEntries(
    Object.entries(shape).map(([key, schema]) => [
      key,
      z.preprocess(jsonPreprocess, schema as z.ZodTypeAny),
    ]),
  );

  server.tool(tool.name, tool.description, mcpShape, async (input: unknown) => {
    try {
      const result = await tool.execute(input, ops);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: err instanceof Error ? err.message : String(err),
          },
        ],
        isError: true,
      };
    }
  });
}
