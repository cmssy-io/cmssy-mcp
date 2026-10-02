import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import * as aiTools from "@cmssy/ai-tools";
import type { AiTool, WorkspaceOps } from "@cmssy/ai-tools";
import { createServer } from "../server.js";
import type { CmssyClient } from "../graphql-client.js";
import {
  callBound as call,
  connectBound as connect,
  connectServer,
  validationRefusal as refusal,
} from "./mcp-harness.js";

type JsonSchema = {
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

const refusingOps = {} as WorkspaceOps;

function fakeTool(
  overrides: Partial<AiTool> & Pick<AiTool, "inputSchema">,
): AiTool {
  return {
    name: "probe_tool",
    description: "a tool",
    requiredPermissions: [],
    execute: async (input: unknown) => ({ echoed: input }),
    ...overrides,
  } as unknown as AiTool;
}

describe("the binder hands the MCP server the schema the tool declared (CMS-1982)", () => {
  it("refuses a parameter the tool does not declare instead of discarding it", async () => {
    const client = await connect(
      [
        fakeTool({
          inputSchema: z.object({
            limit: z.number().int().optional(),
          }) as unknown as AiTool["inputSchema"],
        }),
      ],
      refusingOps,
    );

    const result = await call(client, "probe_tool", { limit: 5, type: "video" });

    expect(
      refusal(result),
      "an undeclared parameter has to come back as a refusal; stripping it answers a request nobody made and reads as success",
    ).toMatch(/type/);
  });

  it("names the required parameters in the advertised schema", async () => {
    const client = await connect(
      [
        fakeTool({
          inputSchema: z.object({
            id: z.string().min(1),
            name: z.string().optional(),
            rows: z.array(z.object({ k: z.string() })),
            page: z.number().default(1),
          }) as unknown as AiTool["inputSchema"],
        }),
      ],
      refusingOps,
    );

    const listed = await client.listTools();
    const schema = listed.tools[0]!.inputSchema as JsonSchema;

    expect(
      schema.required?.sort(),
      "a parameter the tool cannot run without has to reach the model as required; an empty required list reads as 'everything is optional'",
    ).toStrictEqual(["id", "rows"]);
    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties ?? {}).sort()).toStrictEqual([
      "id",
      "name",
      "page",
      "rows",
    ]);
  });

  it("still accepts an object parameter sent as a JSON-encoded string", async () => {
    const client = await connect(
      [
        fakeTool({
          inputSchema: z.object({
            id: z.string(),
            rows: z.array(z.object({ k: z.string() })),
          }) as unknown as AiTool["inputSchema"],
        }),
      ],
      refusingOps,
    );

    const result = await call(client, "probe_tool", {
      id: "a",
      rows: '[{"k":"v"}]',
    });

    expect(JSON.parse((result.content as { text: string }[])[0]!.text)).toStrictEqual(
      { echoed: { id: "a", rows: [{ k: "v" }] } },
    );
  });

  it("refuses a value of the wrong type for a declared parameter", async () => {
    const client = await connect(
      [
        fakeTool({
          inputSchema: z.object({
            limit: z.number(),
          }) as unknown as AiTool["inputSchema"],
        }),
      ],
      refusingOps,
    );

    const result = await call(client, "probe_tool", { limit: "lots" });

    expect(refusal(result)).toMatch(/limit/);
  });
});

const OBJECT_LEVEL_RULES: Record<string, { refused: unknown; accepted: unknown }> =
  {
    update_media_folder: {
      refused: { id: "6abd61e1a51c17ea3525336a" },
      accepted: { id: "6abd61e1a51c17ea3525336a", name: "renamed" },
    },
    upload_media: {
      refused: { filePath: "/tmp/a.png", url: "https://example.com/a.png" },
      accepted: { filePath: "/tmp/a.png" },
    },
  };

function declaredTools(): AiTool[] {
  return (Object.values(aiTools) as unknown[]).filter(
    (value): value is AiTool =>
      typeof value === "object" &&
      value !== null &&
      "name" in value &&
      "inputSchema" in value &&
      "execute" in value,
  );
}

function withObjectLevelRules(): AiTool[] {
  return declaredTools().filter(
    (tool) =>
      ((
        tool.inputSchema as unknown as {
          _zod?: { def?: { checks?: unknown[] } };
        }
      )._zod?.def?.checks?.length ?? 0) > 0,
  );
}

describe("a rule the tool declares across its parameters is enforced through the binder (CMS-1982)", () => {
  it("covers every tool whose input schema carries an object-level rule", () => {
    expect(
      withObjectLevelRules()
        .map((tool) => tool.name)
        .sort(),
      "the table below is the proof per rule; a tool that gains a cross-field rule without a row here would be bound unenforced and nothing else would notice",
    ).toStrictEqual(Object.keys(OBJECT_LEVEL_RULES).sort());
  });

  for (const [name, probe] of Object.entries(OBJECT_LEVEL_RULES)) {
    it(`refuses the input ${name} was written to refuse`, async () => {
      const tool = declaredTools().find((candidate) => candidate.name === name);
      expect(tool, `${name} is no longer exported`).toBeDefined();
      const client = await connect([tool!], refusingOps);

      const result = await call(client, name, probe.refused);

      expect(
        refusal(result),
        "the rule is declared across the parameters, so only a parse of the whole object can enforce it",
      ).toBeTruthy();
    });

    it(`lets ${name} through once the rule is satisfied`, async () => {
      const tool = declaredTools().find((candidate) => candidate.name === name);
      const client = await connect(
        [{ ...tool!, execute: async () => ({ ok: true }) } as AiTool],
        refusingOps,
      );

      const result = await call(client, name, probe.accepted);

      expect(
        result.isError,
        "the rule has to refuse its own case only; a guard that refuses everything proves nothing",
      ).toBeFalsy();
    });
  }
});

const RULE_INSTEAD_OF_A_REQUIRED_FIELD = ["upload_media"];

describe("every tool the live server binds advertises what it needs (CMS-1982)", () => {
  async function advertised() {
    const client = await connectServer(
      createServer({ query: vi.fn() } as unknown as CmssyClient),
    );
    const listed = await client.listTools();
    return listed.tools.map((tool) => ({
      name: tool.name,
      schema: tool.inputSchema as JsonSchema,
    }));
  }

  it("refuses an undeclared parameter on every one of them", async () => {
    const open = (await advertised()).filter(
      (tool) => tool.schema.additionalProperties !== false,
    );

    expect(open.map((tool) => tool.name)).toStrictEqual([]);
  });

  it("names a required parameter whenever the tool cannot run without one", async () => {
    const byName = new Map(
      declaredTools().map((tool) => [tool.name, tool.inputSchema]),
    );
    const disagree: string[] = [];

    for (const { name, schema } of await advertised()) {
      const declared = byName.get(name);
      if (!declared) continue;
      const needsSomething = !(
        declared as unknown as { safeParse(v: unknown): { success: boolean } }
      ).safeParse({}).success;
      const advertisesSomething = (schema.required ?? []).length > 0;
      if (needsSomething !== advertisesSomething) disagree.push(name);
    }

    expect(
      disagree,
      "a tool that refuses an empty call has to say which parameter it was missing; before CMS-1982 the rebuilt shape left required empty on 71 of them and the model had to guess. The exception is a tool whose requirement is a rule across optional parameters - JSON Schema cannot carry 'exactly one of', so the rule surfaces as the refusal proven in the table above, and a tool joining that class has to be a decision rather than a silent entry",
    ).toStrictEqual(RULE_INSTEAD_OF_A_REQUIRED_FIELD);
  });
});
