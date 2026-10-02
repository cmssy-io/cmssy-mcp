import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { AiTool, WorkspaceOps } from "@cmssy/ai-tools";
import { bindSharedTool } from "../ai-tools-binder.js";

export async function connectServer(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
  return client;
}

export async function connectBound(
  tools: AiTool[],
  ops: WorkspaceOps,
): Promise<Client> {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  for (const tool of tools) bindSharedTool(server, tool, ops);
  return connectServer(server);
}

export async function callBound(
  client: Client,
  name: string,
  args: unknown,
): Promise<Awaited<ReturnType<Client["callTool"]>>> {
  return client.callTool({ name, arguments: args as Record<string, unknown> });
}

export function validationRefusal(
  result: Awaited<ReturnType<Client["callTool"]>>,
): string | null {
  if (!result.isError) return null;
  const text = (result.content as { text?: string }[])[0]?.text ?? "";
  return text.includes("Input validation error") ? text : null;
}
