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
| `list_pages`         | Page tree with hierarchy                               |
| `get_page`           | Full page with blocks and i18n content (by slug or id) |
| `list_block_types`   | All available blocks with schemas and defaults         |
| `get_block_schema`   | Detailed schema for one block type                     |
| `get_site_config`    | Languages, navigation, site name                       |
| `get_workspace_info` | Workspace name, plan, limits                           |
| `list_media`         | Media library listing                                  |

### Write Tools

| Tool                   | Description                     |
| ---------------------- | ------------------------------- |
| `create_page`          | Create a new page               |
| `update_page_blocks`   | Set full blocks array on a page |
| `update_page_settings` | Update page metadata and SEO    |
| `publish_page`         | Publish a page                  |
| `unpublish_page`       | Unpublish a page                |
| `delete_page`          | Delete a page                   |

### Block Helper Tools

| Tool                     | Description                                                     |
| ------------------------ | --------------------------------------------------------------- |
| `add_block_to_page`      | Insert a block at position (auto-generates UUID + translations) |
| `update_block_content`   | Merge content into an existing block                            |
| `remove_block_from_page` | Remove a block by ID                                            |

## Resources

| URI                 | Description                  |
| ------------------- | ---------------------------- |
| `cmssy://sitemap`   | Full page tree as JSON       |
| `cmssy://blocks`    | All block types with schemas |
| `cmssy://workspace` | Workspace info + site config |

## Example Workflow

```
> List all pages in my workspace
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
