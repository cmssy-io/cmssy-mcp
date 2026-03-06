#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CmssyClient } from "./graphql-client.js";
import { createServer } from "./server.js";

function parseArgs(args: string[]): {
  token: string;
  workspaceId: string;
  apiUrl: string;
} {
  let token = process.env.CMSSY_API_TOKEN ?? "";
  let workspaceId = process.env.CMSSY_WORKSPACE_ID ?? "";
  let apiUrl = process.env.CMSSY_API_URL ?? "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === "--token" && next) {
      token = next;
      i++;
    } else if (arg === "--workspace-id" && next) {
      workspaceId = next;
      i++;
    } else if (arg === "--api-url" && next) {
      apiUrl = next;
      i++;
    }
  }

  if (!token) {
    console.error(
      "Error: API token required. Use --token <cs_xxx> or set CMSSY_API_TOKEN env var.",
    );
    process.exit(1);
  }

  if (!workspaceId) {
    console.error(
      "Error: Workspace ID required. Use --workspace-id <id> or set CMSSY_WORKSPACE_ID env var.",
    );
    process.exit(1);
  }

  if (!apiUrl) {
    apiUrl = "https://api.cmssy.io";
    console.error(`No --api-url provided, defaulting to ${apiUrl}`);
  }

  return { token, workspaceId, apiUrl };
}

async function main() {
  const { token, workspaceId, apiUrl } = parseArgs(process.argv.slice(2));

  const client = new CmssyClient(apiUrl, token, workspaceId);
  const server = createServer(client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`Cmssy MCP server running (API: ${apiUrl})`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
