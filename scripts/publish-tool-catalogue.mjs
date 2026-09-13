#!/usr/bin/env node
import {
  getPageTool,
  updateBlockContentTool,
  publishPageTool,
} from "@cmssy/ai-tools";
import { CmssyClient } from "../dist/graphql-client.js";
import { createMcpWorkspaceOps } from "../dist/ai-tools-ops.js";
import { buildCatalogue, catalogueDrift } from "../dist/tool-catalogue.js";

const BLOCK_TYPE = "docs-tool-catalogue";
const FIELD = "tools";

function parseArgs(argv) {
  const flags = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      flags.set(arg.slice(2), next);
      i += 1;
    } else {
      flags.set(arg.slice(2), "true");
    }
  }
  return {
    token: flags.get("token") ?? process.env.CMSSY_API_TOKEN ?? "",
    workspaceId:
      flags.get("workspace-id") ?? process.env.CMSSY_DOCS_WORKSPACE_ID ?? "",
    apiUrl:
      flags.get("api-url") ??
      process.env.CMSSY_API_URL ??
      "https://api.cmssy.io",
    page:
      flags.get("page") ?? process.env.CMSSY_DOCS_PAGE ?? "/docs/api/mcp-tools",
    language: flags.get("language") ?? "en",
    check: flags.get("check") === "true",
  };
}

function rowsOf(block, language) {
  const buckets = block.content ?? {};
  const shared = block.shared ?? {};
  const localised =
    buckets[language] ?? buckets[block.defaultLanguage ?? "en"] ?? {};
  const rows = Array.isArray(shared[FIELD])
    ? shared[FIELD]
    : Array.isArray(localised[FIELD])
      ? localised[FIELD]
      : [];
  return rows.map((row) => ({
    name: String(row?.name ?? ""),
    permission: String(row?.permission ?? ""),
    description: String(row?.description ?? ""),
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const built = buildCatalogue();
  console.error(`[catalogue] the server exposes ${built.length} tools`);

  if (!args.token || !args.workspaceId) {
    console.error(
      "[catalogue] no token or workspace id - pass --token/--workspace-id or set CMSSY_API_TOKEN/CMSSY_DOCS_WORKSPACE_ID",
    );
    process.exit(2);
  }

  const client = new CmssyClient(args.apiUrl, args.token, args.workspaceId);
  const ops = createMcpWorkspaceOps(client);

  const page = await getPageTool.execute({ idOrSlug: args.page }, ops);
  if (!page?.found) throw new Error(`page ${args.page} not found`);

  const blocks = (page.blocks ?? []).filter(
    (block) => block.type === BLOCK_TYPE,
  );
  if (blocks.length !== 1) {
    throw new Error(
      `${args.page} carries ${blocks.length} ${BLOCK_TYPE} blocks, expected exactly one`,
    );
  }
  const block = blocks[0];
  const drift = catalogueDrift(built, rowsOf(block, args.language));

  if (drift.length === 0) {
    console.error("[catalogue] the page already lists what the server exposes");
    return;
  }

  console.error(`[catalogue] ${drift.length} difference(s):`);
  for (const line of drift.slice(0, 20)) console.error(`  - ${line}`);
  if (drift.length > 20) console.error(`  ... ${drift.length - 20} more`);

  if (args.check) {
    console.error("[catalogue] --check, so nothing was written");
    process.exit(1);
  }

  const result = await updateBlockContentTool.execute(
    {
      pageId: page.id,
      blockId: block.id,
      content: { [args.language]: { [FIELD]: built } },
    },
    ops,
  );
  if (result?.blockWarnings?.length) {
    for (const warning of result.blockWarnings) {
      console.error(`[catalogue] warning: ${warning}`);
    }
  }

  await publishPageTool.execute({ pageId: page.id }, ops);
  console.error(
    `[catalogue] wrote ${built.length} tools and published ${args.page}`,
  );
}

main().catch((error) => {
  console.error(
    `[catalogue] ${error instanceof Error ? error.message : error}`,
  );
  process.exit(1);
});
