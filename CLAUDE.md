# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

MCP (Model Context Protocol) server for Cmssy CMS. Exposes CMS operations (pages, blocks, media, site config) as MCP tools over stdio transport. Communicates with the Cmssy backend via GraphQL.

## Commands

- `pnpm build` - compile TypeScript to `dist/`
- `pnpm dev -- --token cs_xxx --workspace-id xxx --api-url http://localhost:4000` - run locally
- `pnpm typecheck` - type-check without emitting
- `pnpm test` - Vitest suite in `src/__tests__/`, including `operations.validate` which checks every document in `queries.ts` against the vendored `schema.graphql`.

## Architecture

`src/` holds 15 files; these six carry the shape:

- **index.ts** - CLI entrypoint. Reads the env vars `CMSSY_API_TOKEN`, `CMSSY_WORKSPACE_ID` and `CMSSY_API_URL`, lets the flags override them, refuses to start without a token or a workspace id, and wires `CmssyClient` -> `createServer` -> `StdioServerTransport`. It owns no argument parsing: importing this module runs `main()`, so nothing here is unit-testable.
- **cli-flags.ts** - every argument this binary understands, as pure functions (CMS-1974). `readValueFlags` maps `--token`/`--workspace-id`/`--api-url` onto their fields, `informationalOutput` answers `--version`/`-v` and `--help`/`-h` **before** any credential is read, and `DEFAULT_API_URL` is the one place the fallback API lives. Anything that decides what an argument means belongs here, not in `index.ts`, so it can be tested without starting a server.
- **package-version.ts** - reads `version` out of the shipped `package.json`, so `--version` cannot answer something other than what npm served.
- **server.ts** - All MCP tool/resource definitions via `McpServer` from `@modelcontextprotocol/sdk`. Contains read tools (list_pages, get_page, list_block_types backed by the backend `blockManifest` namespace, etc.), write tools (create_page, update_page_blocks, publish_page, etc.), block helper tools (add_block_to_page, update_block_content, remove_block_from_page), layout tools, and resources (cmssy://sitemap, cmssy://workspace).
- **graphql-client.ts** - `CmssyClient` class. Sends GraphQL queries to `{apiUrl}/graphql` with Bearer token + `x-workspace-id` header. Has `buildSelectionSet()` for runtime schema introspection (used for dynamic header/footer fields in site config).
- **queries.ts** - All GraphQL query/mutation strings as template literals. Block selections read `content: contentWithShared` - the server folds fields declared the same in every language back into each locale, so a tool reads whole rows and writes whole rows back, never the storage split (CMS-1793).
- **types.ts** - TypeScript interfaces for the domain model (Page, BlockData, LayoutBlock, WorkspaceBlock, SiteConfig, etc.).

### Key patterns

- Block helper tools (add/update/remove) do read-modify-write: fetch page, mutate blocks array, save back via `savePage` or `updatePageLayout` mutation.
- Blocks are either content blocks (stored in `page.blocks`, saved via `savePage`) or layout blocks (stored in `page.layoutBlocks`, saved via `updatePageLayout`). Determined by `WorkspaceBlock.layoutPosition` being non-null.
- i18n: content is language-keyed (`{ en: { title: '...' }, pl: { title: '...' } }`), translation status tracked per-block.
- `get_site_config` dynamically introspects `SiteHeader`/`SiteFooter` types from the backend GraphQL schema to build selection sets.
