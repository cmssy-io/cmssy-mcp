# @cmssy/mcp-server

MCP server for [Cmssy CMS](https://cmssy.com) — enables AI-driven page creation and management with i18n support.

## Setup

### Prerequisites

1. Your Cmssy backend API URL (e.g. `https://api.your-cmssy.com`)
2. An API token (create in Dashboard > API Tokens, starts with `cs_`)
3. Your workspace ID

### Add to Claude Code

Add to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "cmssy": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@cmssy/mcp-server",
        "--token",
        "cs_YOUR_TOKEN",
        "--workspace-id",
        "YOUR_WORKSPACE_ID",
        "--api-url",
        "https://api.your-cmssy.com"
      ]
    }
  }
}
```

### Environment Variables

Instead of CLI args, you can set:

- `CMSSY_API_TOKEN` — API token (`cs_xxx`)
- `CMSSY_WORKSPACE_ID` — Workspace ID
- `CMSSY_API_URL` — API URL (required, e.g. `https://api.your-cmssy.com`)

## Available Tools

### Read Tools

| Tool                 | Description                                            |
| -------------------- | ------------------------------------------------------ |
| `list_pages`         | Page tree with hierarchy (optional `search` filter)    |
| `get_page`           | Full page with blocks and i18n content (by slug or id) |
| `list_block_types`   | All available blocks with schemas and defaults         |
| `get_block_schema`   | Detailed schema for one block type                     |
| `get_site_config`    | Languages, navigation, site name                       |
| `get_workspace_info` | Workspace name, plan, limits                           |
| `list_media`         | Media library listing                                  |

### Write Tools

| Tool                   | Description                        |
| ---------------------- | ---------------------------------- |
| `create_page`          | Create a new page                  |
| `update_page_blocks`   | Set full blocks array on a page    |
| `update_page_settings` | Update page metadata and SEO       |
| `publish_page`         | Publish a page                     |
| `unpublish_page`       | Unpublish a page                   |
| `delete_page`          | Delete a page                      |
| `revert_to_published`  | Discard draft, revert to published |

### Block Helper Tools

| Tool                     | Description                                                     |
| ------------------------ | --------------------------------------------------------------- |
| `add_block_to_page`      | Insert a block at position (auto-generates UUID + translations) |
| `update_block_content`   | Merge content into an existing block                            |
| `patch_block_content`    | Surgical HTML patch (insert/replace around unique markers)      |
| `remove_block_from_page` | Remove a block by ID                                            |
| `update_page_layout`     | Update layout blocks and overrides                              |

#### `patch_block_content`

For small edits on long HTML content strings (e.g. a `docs-article` body),
`patch_block_content` is ~10x cheaper in tokens than `update_block_content`
and catches marker mistakes before anything writes to the DB.

```jsonc
{
  "pageId": "...",
  "blockId": "...",
  "locale": "en",
  "operations": [
    {
      "op": "insert_before",
      "marker": "<h2>Environment Variables</h2>",
      "html": "<hr><h2>cmssy skills install</h2><p>...</p>",
    },
  ],
}
```

Three ops: `insert_before`, `insert_after`, `replace_section`. Every
marker must match **exactly once** - 0 or 2+ matches error out with the
actual count (no silent half-applied state). For `replace_section`,
`startMarker` is inclusive and `endMarker` is exclusive.

Requires `@cmssy/cli`-registered workspace with `PAGES_EDIT` permission.
Default `fieldPath` is `"content"` (the HTML body on docs-article); override
if patching a different string field.

## Resources

| URI                 | Description                  |
| ------------------- | ---------------------------- |
| `cmssy://sitemap`   | Full page tree as JSON       |
| `cmssy://blocks`    | All block types with schemas |
| `cmssy://workspace` | Workspace info + site config |

## Example Workflow

```
> List all pages in my workspace
> Search for pages matching "blog"
> Show me the available block types
> Create a new "Features" page with content in English and Polish
> Add a hero block to the Features page
> Publish the Features page
```

## Development

```bash
pnpm install
pnpm dev -- --token cs_xxx --workspace-id xxx --api-url http://localhost:4000
```
