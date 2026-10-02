import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AiTool, WorkspaceOps } from "@cmssy/ai-tools";
import { runAsTool } from "./client-marker.js";

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

function coerceJson(schema: z.ZodTypeAny): z.ZodTypeAny {
  const wrapped = z.preprocess(jsonPreprocess, schema);
  return schema.safeParse(undefined).success ? wrapped : wrapped.nonoptional();
}

export function toolInputSchema(
  tool: Pick<AiTool, "inputSchema">,
): z.ZodObject<z.ZodRawShape> {
  const declared = tool.inputSchema as unknown as z.ZodObject<z.ZodRawShape>;
  const coerced = Object.fromEntries(
    Object.entries(declared.shape).map(([key, schema]) => [
      key,
      coerceJson(schema as z.ZodTypeAny),
    ]),
  );
  return declared.safeExtend(coerced).strict();
}

export function bindSharedTool(
  server: McpServer,
  tool: AiTool,
  ops: WorkspaceOps,
): void {
  const declared = declarations.get(server) ?? new Map<string, AiTool>();
  declared.set(tool.name, tool);
  declarations.set(server, declared);

  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: toolInputSchema(tool),
    },
    async (input: unknown) => {
      try {
        const result = await runAsTool(tool.name, () =>
          tool.execute(input, ops),
        );
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
    },
  );
}
