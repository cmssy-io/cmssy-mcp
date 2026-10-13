import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { AiTool, WorkspaceOps } from "@cmssy/ai-tools";
import { runAsTool } from "./client-marker.js";
import {
  CONFIRM_ARG,
  CONFIRM_REF_PATTERN,
  CONFIRMATION_TTL_SECONDS,
  ConfirmGate,
  confirmArgsHash,
  confirmSummary,
} from "./confirm-gate.js";

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

const gates = new WeakMap<McpServer, ConfirmGate>();

function gateFor(server: McpServer): ConfirmGate {
  const existing = gates.get(server);
  if (existing) return existing;
  const gate = new ConfirmGate();
  gates.set(server, gate);
  return gate;
}

const confirmArgSchema = z
  .string()
  .regex(CONFIRM_REF_PATTERN)
  .optional()
  .describe(
    "Confirmation ref this server issued for this exact call after the user approved it. Never invent or reuse one.",
  );

function confirmationPrompt(
  gate: ConfirmGate,
  toolName: string,
  args: Record<string, unknown>,
  reason: "unknown-ref" | "expired" | "args-changed" | null,
): { content: { type: "text"; text: string }[] } {
  const ref = gate.request(toolName, confirmArgsHash(args));
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            needsConfirmation: true,
            ref,
            ...(reason ? { refusedBecause: reason } : {}),
            summary: confirmSummary(toolName, args),
            expiresInSeconds: CONFIRMATION_TTL_SECONDS,
            instruction:
              "This action was NOT performed. Tell the user exactly what it " +
              "would do and wait for their explicit approval in their next " +
              `message. Then call the tool once more with the same arguments plus ${CONFIRM_ARG}: "${ref}". ` +
              "Never invent a ref and never confirm on the user's behalf.",
          },
          null,
          2,
        ),
      },
    ],
  };
}

export function boundDeclarations(server: McpServer): Map<string, AiTool> {
  return declarations.get(server) ?? new Map();
}

function coerceJson(schema: z.ZodTypeAny): z.ZodTypeAny {
  const wrapped = z.preprocess(jsonPreprocess, schema);
  return schema.safeParse(undefined).success ? wrapped : wrapped.nonoptional();
}

export function toolInputSchema(
  tool: Pick<AiTool, "inputSchema" | "confirmGated">,
): z.ZodObject<z.ZodRawShape> {
  const declared = tool.inputSchema as unknown as z.ZodObject<z.ZodRawShape>;
  const coerced = Object.fromEntries(
    Object.entries(declared.shape).map(([key, schema]) => [
      key,
      coerceJson(schema as z.ZodTypeAny),
    ]),
  );
  if (tool.confirmGated === true) {
    coerced[CONFIRM_ARG] = confirmArgSchema;
  }
  return declared.safeExtend(coerced).strict();
}

const READ_NAME = /^(get|list|search)_/;
const ADDITIVE_NAME = /^(create|upload)_/;

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
  return {
    title,
    readOnlyHint: false,
    destructiveHint:
      tool.confirmGated === true || !ADDITIVE_NAME.test(tool.name),
  };
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
      title: toolTitle(tool.name),
      description: tool.description,
      inputSchema: toolInputSchema(tool),
      annotations: toolAnnotations(tool),
    },
    async (input: unknown) => {
      let executeInput = input;
      if (tool.confirmGated === true) {
        const gate = gateFor(server);
        const { [CONFIRM_ARG]: ref, ...rest } = input as Record<
          string,
          unknown
        >;
        if (typeof ref !== "string") {
          return confirmationPrompt(gate, tool.name, rest, null);
        }
        const outcome = gate.consume(ref, tool.name, confirmArgsHash(rest));
        if (outcome !== "approved") {
          return confirmationPrompt(gate, tool.name, rest, outcome);
        }
        executeInput = rest;
      }
      try {
        const result = await runAsTool(tool.name, () =>
          tool.execute(executeInput, ops),
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
