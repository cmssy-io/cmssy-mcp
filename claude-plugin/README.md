# Cmssy for Claude

Cmssy is a hosted headless CMS with native commerce. This plugin connects Claude to the Cmssy workspaces you choose so it can read and edit pages, blocks, records, media and forms, and run the store: products, carts, orders, refunds, discounts, customers and webhooks.

## What it runs

Nothing on your machine. The plugin adds the hosted Cmssy MCP server at `https://api.cmssy.io/mcp` (Streamable HTTP). It works in Claude Code, Claude Desktop and on claude.ai.

## Setup

1. Have a Cmssy account at <https://www.cmssy.io> - the free plan works; cart and checkout need Pro.
2. Install the plugin. The first time Claude uses Cmssy, sign in to Cmssy in your browser (in Claude Code: run `/mcp` and choose `cmssy`).
3. Tick the workspaces Claude may use and choose read only or read and write.

There is no token to copy. Every tool takes a `workspace` argument (`org-slug/workspace-slug`); `list_workspaces` lists the ones you granted.

## Safety

Claude acts with your own role in each workspace, and read only stays read only even where your role could write. Every tool carries MCP annotations: reads are marked read-only, and writes that change or remove data are marked destructive. The tools hardest to undo - refunds, order cancellations, publishing, and deleting pages, models, records, forms or webhooks - do nothing on the first call: they return a summary and run only after you approve that exact call.

Disconnect any time under Account > Connected apps in Cmssy. A workspace admin can remove one workspace from a member's connection under Settings > Connected apps.

## Example prompts

- "List the draft pages in my Cmssy workspace and tell me which ones have unpublished changes."
- "Add a FAQ block to the pricing page with these five questions, in English and Polish."
- "Show yesterday's paid orders that are not fulfilled yet."
- "Refund order 1042 in full." (Claude shows what it would do and waits for your approval.)

## Privacy

Only the content of the workspaces you granted, and only what a tool call returns, reaches Claude. Cmssy stores the connection (which app, which workspaces, read or write) and hashed tokens - never the conversation. Policy: <https://www.cmssy.com/privacy>.

## Support

Issues: <https://github.com/cmssy-io/cmssy-mcp/issues>. Docs: <https://www.cmssy.com/docs/api/mcp>.

## License

MIT, see [LICENSE](../LICENSE).
