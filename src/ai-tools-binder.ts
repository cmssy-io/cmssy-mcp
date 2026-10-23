import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
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

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

export function boundDeclarations(server: McpServer): Map<string, AiTool> {
  return declarations.get(server) ?? new Map();
}

function coerceJson(schema: z.ZodTypeAny): z.ZodTypeAny {
  const meta = z.globalRegistry.get(schema);
  const coerced =
    schema instanceof z.ZodDefault
      ? coerceJson(schema.unwrap() as z.ZodTypeAny).default(
          schema.def.defaultValue,
        )
      : schema instanceof z.ZodOptional
        ? coerceJson(schema.unwrap() as z.ZodTypeAny).optional()
        : z.preprocess(jsonPreprocess, schema).nonoptional();
  return meta ? coerced.meta(meta) : coerced;
}

export function toolInputSchema(
  tool: Pick<AiTool, "inputSchema">,
  extra: z.ZodRawShape = {},
): z.ZodObject<z.ZodRawShape> {
  const declared = tool.inputSchema as unknown as z.ZodObject<z.ZodRawShape>;
  const coerced = Object.fromEntries(
    Object.entries(declared.shape).map(([key, schema]) => [
      key,
      coerceJson(schema as z.ZodTypeAny),
    ]),
  );
  return declared.safeExtend({ ...coerced, ...extra }).strict();
}

const READ_NAME = /^(get|list|search)_/;
const ADDITIVE_NAME = /^(create|upload)_/;
const SENDS_DATA_OUT = new Set(["create_webhook"]);

export function toolTitle(name: string): string {
  const words = name.split("_");
  return [
    words[0].charAt(0).toUpperCase() + words[0].slice(1),
    ...words.slice(1),
  ].join(" ");
}

export function toolAnnotations(
  tool: Pick<AiTool, "name" | "requiredPermissions" | "confirmGated">,
): ToolAnnotations {
  const title = toolTitle(tool.name);
  const readOnly =
    tool.confirmGated !== true &&
    READ_NAME.test(tool.name) &&
    tool.requiredPermissions.every((permission) =>
      permission.endsWith(":view"),
    );
  if (readOnly) {
    return { title, readOnlyHint: true, destructiveHint: false };
  }
  if (SENDS_DATA_OUT.has(tool.name)) {
    return {
      title,
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    };
  }
  return {
    title,
    readOnlyHint: false,
    destructiveHint:
      tool.confirmGated === true || !ADDITIVE_NAME.test(tool.name),
  };
}

function errorResult(err: unknown): ToolResult {
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

async function runTool(
  tool: AiTool,
  input: unknown,
  ops: WorkspaceOps,
): Promise<ToolResult> {
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
    return errorResult(err);
  }
}

function declare(server: McpServer, tool: AiTool): void {
  const declared = declarations.get(server) ?? new Map<string, AiTool>();
  declared.set(tool.name, tool);
  declarations.set(server, declared);
}

export function bindSharedTool(
  server: McpServer,
  tool: AiTool,
  ops: WorkspaceOps,
): void {
  declare(server, tool);
  server.registerTool(
    tool.name,
    {
      title: toolTitle(tool.name),
      description: tool.description,
      inputSchema: toolInputSchema(tool),
      annotations: toolAnnotations(tool),
    },
    (input: unknown) => runTool(tool, input, ops),
  );
}

export const WORKSPACE_ARG = "workspace";

const workspaceArgSchema = z
  .string()
  .regex(/^[^/\s]+\/[^/\s]+$/)
  .describe(
    "Workspace to act in, as <orgSlug>/<workspaceSlug> - one of the workspaces list_workspaces returns",
  );

export interface HostedTarget {
  tool: AiTool;
  ops: WorkspaceOps;
}

export type ResolveHostedTarget = (
  workspace: string,
  tool: AiTool,
) => Promise<HostedTarget>;

export function hostedInputSchema(
  tool: Pick<AiTool, "inputSchema">,
): z.ZodObject<z.ZodRawShape> {
  return toolInputSchema(tool, { [WORKSPACE_ARG]: workspaceArgSchema });
}

export function bindHostedTool(
  server: McpServer,
  tool: AiTool,
  resolve: ResolveHostedTarget,
): void {
  declare(server, tool);
  server.registerTool(
    tool.name,
    {
      title: toolTitle(tool.name),
      description: tool.description,
      inputSchema: hostedInputSchema(tool),
      annotations: toolAnnotations(tool),
    },
    async (input: unknown) => {
      const { [WORKSPACE_ARG]: workspace, ...rest } = input as Record<
        string,
        unknown
      >;
      let target: HostedTarget;
      try {
        target = await resolve(workspace as string, tool);
      } catch (err) {
        return errorResult(err);
      }
      return runTool(target.tool, rest, target.ops);
    },
  );
}
