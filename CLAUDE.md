# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

MCP (Model Context Protocol) server for Cmssy CMS. Exposes CMS operations (pages, blocks, media, site config) as MCP tools over stdio transport. Communicates with the Cmssy backend via GraphQL.

## Commands

- `pnpm build` - compile TypeScript to `dist/`
- `pnpm dev -- --token cs_xxx --workspace-id xxx --api-url http://localhost:4000` - run locally
- `pnpm typecheck` - type-check without emitting

No test framework is configured.

## Architecture

5 source files in `src/`:

- **index.ts** - CLI entrypoint. Parses `--token`, `--workspace-id`, `--api-url` args (falls back to env vars `CMSSY_API_TOKEN`, `CMSSY_WORKSPACE_ID`, `CMSSY_API_URL`). Wires `CmssyClient` -> `createServer` -> `StdioServerTransport`.
- **server.ts** - All MCP tool/resource definitions via `McpServer` from `@modelcontextprotocol/sdk`. Contains read tools (list_pages, get_page, etc.), write tools (create_page, update_page_blocks, publish_page, etc.), block helper tools (add_block_to_page, update_block_content, remove_block_from_page), layout tools, and resources (cmssy://sitemap, cmssy://blocks, cmssy://workspace). Caches workspace block registry in-memory.
- **graphql-client.ts** - `CmssyClient` class. Sends GraphQL queries to `{apiUrl}/graphql` with Bearer token + `x-workspace-id` header. Has `buildSelectionSet()` for runtime schema introspection (used for dynamic header/footer fields in site config).
- **queries.ts** - All GraphQL query/mutation strings as template literals.
- **types.ts** - TypeScript interfaces for the domain model (Page, BlockData, LayoutBlock, WorkspaceBlock, SiteConfig, etc.).

### Key patterns

- Block helper tools (add/update/remove) do read-modify-write: fetch page, mutate blocks array, save back via `savePage` or `updatePageLayout` mutation.
- Blocks are either content blocks (stored in `page.blocks`, saved via `savePage`) or layout blocks (stored in `page.layoutBlocks`, saved via `updatePageLayout`). Determined by `WorkspaceBlock.layoutPosition` being non-null.
- i18n: content is language-keyed (`{ en: { title: '...' }, pl: { title: '...' } }`), translation status tracked per-block.
- `get_site_config` dynamically introspects `SiteHeader`/`SiteFooter` types from the backend GraphQL schema to build selection sets.
