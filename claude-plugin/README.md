# Cmssy for Claude

Cmssy is a hosted headless CMS with native commerce. This plugin connects Claude to one Cmssy workspace so it can read and edit pages, blocks, records, media and forms, and run the store: products, carts, orders, refunds, discounts, customers and webhooks.

## What it runs

The plugin starts one local MCP server, [`@cmssy/mcp-server`](https://www.npmjs.com/package/@cmssy/mcp-server), pinned to an exact version and launched with `npx`. Its source is in this repository: <https://github.com/cmssy-io/cmssy-mcp>.

The server talks only to the Cmssy API at `https://api.cmssy.io` and to the Cmssy storage URL the API returns for uploads. `upload_media` also reads the one local file or downloads the one URL you pass it. Nothing else is read, written or sent.

## Setup

1. Create a Cmssy workspace at <https://www.cmssy.io> - the free plan works; cart and checkout need Pro.
2. Create an API token under Dashboard > API Tokens. It starts with `cs_` and acts with your permissions.
3. Copy your workspace ID from Workspace Settings > General.
4. Install the plugin and enter both values when Claude asks. The token is stored in your system's secure credential store.

## Safety

Every tool carries MCP annotations: reads are marked read-only, and writes that change or remove data are marked destructive. The tools hardest to undo - refunds, order cancellations, publishing, and deleting pages, models, records, forms or webhooks - do nothing on the first call: they return a summary and run only after you approve that exact call.

## Example prompts

- "List the draft pages in my Cmssy workspace and tell me which ones have unpublished changes."
- "Add a FAQ block to the pricing page with these five questions, in English and Polish."
- "Show yesterday's paid orders that are not fulfilled yet."
- "Refund order 1042 in full." (Claude shows what it would do and waits for your approval.)

## Privacy

Policy: <https://www.cmssy.com/privacy>. The full data flow is described in the [server README](https://github.com/cmssy-io/cmssy-mcp#privacy-policy).

## Support

Issues: <https://github.com/cmssy-io/cmssy-mcp/issues>. Docs: <https://www.cmssy.com/docs/api/mcp>.

## License

MIT, see [LICENSE](https://github.com/cmssy-io/cmssy-mcp/blob/main/LICENSE).
