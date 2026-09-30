#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CmssyClient } from "./graphql-client.js";
import {
  DEFAULT_API_URL,
  VALUE_FLAGS,
  informationalOutput,
  type GivenOptions,
} from "./cli-flags.js";
import { createServer } from "./server.js";

function parseArgs(args: string[]): GivenOptions {
  const given: GivenOptions = {
    token: process.env.CMSSY_API_TOKEN ?? "",
    workspaceId: process.env.CMSSY_WORKSPACE_ID ?? "",
    apiUrl: process.env.CMSSY_API_URL ?? "",
  };

  for (let i = 0; i < args.length; i++) {
    const key = VALUE_FLAGS[args[i]];
    const next = args[i + 1];

    if (key && next) {
      given[key] = next;
      i++;
    }
  }

  if (!given.token) {
    console.error(
      "Error: API token required. Use --token <cs_xxx> or set CMSSY_API_TOKEN env var.",
    );
    process.exit(1);
  }

  if (!given.workspaceId) {
    console.error(
      "Error: Workspace ID required. Use --workspace-id <id> or set CMSSY_WORKSPACE_ID env var.",
    );
    process.exit(1);
  }

  if (!given.apiUrl) {
    const apiUrl = DEFAULT_API_URL;
    console.error(`No --api-url provided, defaulting to ${apiUrl}`);
    return { ...given, apiUrl };
  }

  return given;
}

async function main() {
  const args = process.argv.slice(2);

  const answer = informationalOutput(args);
  if (answer !== null) {
    console.log(answer);
    return;
  }

  const { token, workspaceId, apiUrl } = parseArgs(args);

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
