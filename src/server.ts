import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CmssyClient } from "./graphql-client.js";
import {
  PAGES_QUERY,
  PAGE_BY_ID_QUERY,
  PAGE_BY_SLUG_QUERY,
  WORKSPACE_BLOCKS_QUERY,
  WORKSPACE_BLOCK_BY_TYPE_QUERY,
  SITE_CONFIG_QUERY,
  CURRENT_WORKSPACE_QUERY,
  MEDIA_ASSETS_QUERY,
  SAVE_PAGE_MUTATION,
  UPDATE_PAGE_SETTINGS_MUTATION,
  TOGGLE_PUBLISH_MUTATION,
  PUBLISH_PAGE_MUTATION,
  REMOVE_PAGE_MUTATION,
} from "./queries.js";
import type {
  Page,
  WorkspaceBlock,
  SiteConfig,
  Workspace,
  MediaAsset,
  BlockInput,
} from "./types.js";

export function createServer(client: CmssyClient) {
  const server = new McpServer({
    name: "cmssy",
    version: "0.1.0",
  });

  // ─── Read Tools ──────────────────────────────────────────────

  server.tool(
    "list_pages",
    "List all pages in the workspace with hierarchy info (id, name, slug, published, parentId, pageType)",
    {},
    async () => {
      const data = await client.query<{ pages: Page[] }>(PAGES_QUERY);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(data.pages, null, 2) },
        ],
      };
    },
  );

  server.tool(
    "get_page",
    "Get full page details with all blocks and i18n content. Provide either slug or id.",
    {
      slug: z.string().optional().describe("Page slug (e.g. '/' or 'about')"),
      id: z.string().optional().describe("Page ID"),
    },
    async ({ slug, id }) => {
      if (!slug && !id) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: provide either 'slug' or 'id'",
            },
          ],
          isError: true,
        };
      }

      let page: Page | null;
      if (id) {
        const data = await client.query<{ pageById: Page | null }>(
          PAGE_BY_ID_QUERY,
          { id },
        );
        page = data.pageById;
      } else {
        const data = await client.query<{ page: Page | null }>(
          PAGE_BY_SLUG_QUERY,
          { slug },
        );
        page = data.page;
      }

      if (!page) {
        return {
          content: [{ type: "text" as const, text: "Page not found" }],
          isError: true,
        };
      }

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(page, null, 2) },
        ],
      };
    },
  );

  server.tool(
    "list_block_types",
    "List all available block types with schemas, categories, and defaults",
    {},
    async () => {
      const data = await client.query<{ workspaceBlocks: WorkspaceBlock[] }>(
        WORKSPACE_BLOCKS_QUERY,
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.workspaceBlocks, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "get_block_schema",
    "Get detailed schema for a specific block type (fields, types, validation, defaults)",
    {
      blockType: z
        .string()
        .describe("Block type identifier (e.g. 'hero', 'text-block')"),
    },
    async ({ blockType }) => {
      const data = await client.query<{
        workspaceBlockByType: WorkspaceBlock | null;
      }>(WORKSPACE_BLOCK_BY_TYPE_QUERY, { blockType });

      if (!data.workspaceBlockByType) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Block type '${blockType}' not found`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.workspaceBlockByType, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "get_site_config",
    "Get site configuration: languages, navigation, site name, enabled features",
    {},
    async () => {
      const data = await client.query<{ siteConfig: SiteConfig | null }>(
        SITE_CONFIG_QUERY,
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.siteConfig, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "get_workspace_info",
    "Get workspace name, plan, limits, and usage",
    {},
    async () => {
      const data = await client.query<{
        currentWorkspace: Workspace | null;
      }>(CURRENT_WORKSPACE_QUERY);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.currentWorkspace, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "list_media",
    "List media assets in the workspace (url, filename, alt, type)",
    {
      limit: z
        .number()
        .optional()
        .default(50)
        .describe("Max items to return (default 50, max 100)"),
    },
    async ({ limit }) => {
      const data = await client.query<{
        mediaAssets: { items: MediaAsset[]; total: number; hasMore: boolean };
      }>(MEDIA_ASSETS_QUERY, { limit });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.mediaAssets, null, 2),
          },
        ],
      };
    },
  );

  // ─── Write Tools ─────────────────────────────────────────────

  server.tool(
    "create_page",
    "Create a new page. Returns the created page with its ID.",
    {
      name: z.string().describe("Internal page name"),
      slug: z.string().describe("URL slug (e.g. 'about', 'features')"),
      parentId: z
        .string()
        .optional()
        .describe("Parent page ID for nested pages"),
      pageType: z
        .string()
        .optional()
        .default("page")
        .describe("Page type (default: 'page')"),
      displayName: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          "Multilingual display name, e.g. { en: 'About', pl: 'O nas' }",
        ),
      seoTitle: z
        .record(z.string(), z.string())
        .optional()
        .describe("Multilingual SEO title"),
      seoDescription: z
        .record(z.string(), z.string())
        .optional()
        .describe("Multilingual SEO description"),
    },
    async ({
      name,
      slug,
      parentId,
      pageType,
      displayName,
      seoTitle,
      seoDescription,
    }) => {
      const input: Record<string, unknown> = { name, slug };
      if (parentId) input.parentId = parentId;
      if (pageType) input.pageType = pageType;
      if (displayName) input.displayName = displayName;
      if (seoTitle) input.seoTitle = seoTitle;
      if (seoDescription) input.seoDescription = seoDescription;

      const data = await client.query<{ savePage: Page }>(SAVE_PAGE_MUTATION, {
        input,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.savePage, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "update_page_blocks",
    "Set the full blocks array on a page. Replaces all existing blocks.",
    {
      pageId: z.string().describe("Page ID"),
      blocks: z
        .array(
          z.object({
            id: z.string().describe("Unique block instance ID (UUID)"),
            type: z.string().describe("Block type (e.g. 'hero', 'text-block')"),
            content: z
              .record(z.string(), z.unknown())
              .optional()
              .describe(
                "Language-keyed content: { en: { title: '...' }, pl: { title: '...' } }",
              ),
            settings: z.record(z.string(), z.unknown()).optional(),
            style: z.record(z.string(), z.unknown()).optional(),
            advanced: z.record(z.string(), z.unknown()).optional(),
            translations: z
              .record(z.string(), z.object({ status: z.string() }))
              .optional()
              .describe(
                "Translation status per language: { en: { status: 'completed' } }",
              ),
            defaultLanguage: z.string().optional(),
            metadata: z.record(z.string(), z.unknown()).optional(),
            blockVersion: z.string().optional(),
          }),
        )
        .describe("Full array of blocks to set on the page"),
    },
    async ({ pageId, blocks }) => {
      // Fetch current page to preserve name/slug
      const pageData = await client.query<{ pageById: Page | null }>(
        PAGE_BY_ID_QUERY,
        { id: pageId },
      );

      if (!pageData.pageById) {
        return {
          content: [{ type: "text" as const, text: "Page not found" }],
          isError: true,
        };
      }

      const data = await client.query<{ savePage: Page }>(SAVE_PAGE_MUTATION, {
        input: {
          id: pageId,
          name: pageData.pageById.name,
          slug: pageData.pageById.slug,
          blocks,
        },
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.savePage, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "update_page_settings",
    "Update page metadata: name, slug, display name, SEO fields",
    {
      id: z.string().describe("Page ID"),
      name: z.string().optional().describe("Internal page name"),
      slug: z.string().optional().describe("URL slug"),
      displayName: z
        .record(z.string(), z.string())
        .optional()
        .describe("Multilingual display name"),
      seoTitle: z
        .record(z.string(), z.string())
        .optional()
        .describe("Multilingual SEO title"),
      seoDescription: z
        .record(z.string(), z.string())
        .optional()
        .describe("Multilingual SEO description"),
      seoKeywords: z.array(z.string()).optional().describe("SEO keywords"),
    },
    async ({
      id,
      name,
      slug,
      displayName,
      seoTitle,
      seoDescription,
      seoKeywords,
    }) => {
      const input: Record<string, unknown> = { id };
      if (name !== undefined) input.name = name;
      if (slug !== undefined) input.slug = slug;
      if (displayName !== undefined) input.displayName = displayName;
      if (seoTitle !== undefined) input.seoTitle = seoTitle;
      if (seoDescription !== undefined) input.seoDescription = seoDescription;
      if (seoKeywords !== undefined) input.seoKeywords = seoKeywords;

      const data = await client.query<{ updatePageSettings: Page }>(
        UPDATE_PAGE_SETTINGS_MUTATION,
        { input },
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.updatePageSettings, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "publish_page",
    "Publish a page or re-publish with latest draft changes. Uses atomic publishPage mutation.",
    { pageId: z.string().describe("Page ID to publish") },
    async ({ pageId }) => {
      const pageData = await client.query<{ pageById: Page | null }>(
        PAGE_BY_ID_QUERY,
        { id: pageId },
      );

      if (!pageData.pageById) {
        return {
          content: [{ type: "text" as const, text: "Page not found" }],
          isError: true,
        };
      }

      const page = pageData.pageById;

      if (page.published && !page.hasUnpublishedChanges) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Page is already published with latest content. No changes to publish.",
            },
          ],
        };
      }

      const blocks = (page.blocks || []).map((b) => ({
        id: b.id,
        type: b.type,
        content: b.content,
        settings: b.settings,
        style: b.style,
        advanced: b.advanced,
        translations: b.translations,
        defaultLanguage: b.defaultLanguage,
        metadata: b.metadata,
        blockVersion: b.blockVersion,
      }));

      const data = await client.query<{ publishPage: Page }>(
        PUBLISH_PAGE_MUTATION,
        { id: pageId, blocks },
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.publishPage, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "unpublish_page",
    "Unpublish a published page (toggles published state off).",
    { pageId: z.string().describe("Page ID to unpublish") },
    async ({ pageId }) => {
      const pageData = await client.query<{ pageById: Page | null }>(
        PAGE_BY_ID_QUERY,
        { id: pageId },
      );

      if (!pageData.pageById) {
        return {
          content: [{ type: "text" as const, text: "Page not found" }],
          isError: true,
        };
      }

      if (!pageData.pageById.published) {
        return {
          content: [
            { type: "text" as const, text: "Page is already unpublished" },
          ],
        };
      }

      const data = await client.query<{ togglePublish: Page }>(
        TOGGLE_PUBLISH_MUTATION,
        { id: pageId },
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.togglePublish, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "delete_page",
    "Permanently delete a page and all its descendants. Cannot delete the homepage.",
    { pageId: z.string().describe("Page ID to delete") },
    async ({ pageId }) => {
      const data = await client.query<{ removePage: boolean }>(
        REMOVE_PAGE_MUTATION,
        { id: pageId },
      );
      return {
        content: [
          {
            type: "text" as const,
            text: data.removePage
              ? "Page deleted successfully"
              : "Failed to delete page",
          },
        ],
      };
    },
  );

  // ─── Block Helper Tools (read-modify-write) ─────────────────

  server.tool(
    "add_block_to_page",
    "Add a block to a page at a specific position. Auto-generates UUID and translation status for all enabled languages.",
    {
      pageId: z.string().describe("Page ID"),
      block: z.object({
        type: z.string().describe("Block type (e.g. 'hero', 'text-block')"),
        content: z
          .record(z.string(), z.unknown())
          .describe(
            "Language-keyed content: { en: { title: '...' }, pl: { title: '...' } }",
          ),
        settings: z.record(z.string(), z.unknown()).optional(),
        style: z.record(z.string(), z.unknown()).optional(),
      }),
      position: z
        .number()
        .optional()
        .describe("0-based position to insert at (default: end of page)"),
    },
    async ({ pageId, block, position }) => {
      // Fetch current page
      const pageData = await client.query<{ pageById: Page | null }>(
        PAGE_BY_ID_QUERY,
        { id: pageId },
      );

      if (!pageData.pageById) {
        return {
          content: [{ type: "text" as const, text: "Page not found" }],
          isError: true,
        };
      }

      // Get site config for languages
      const configData = await client.query<{
        siteConfig: SiteConfig | null;
      }>(SITE_CONFIG_QUERY);
      const defaultLanguage = configData.siteConfig?.defaultLanguage ?? "en";
      const enabledLanguages = configData.siteConfig?.enabledLanguages ?? [
        defaultLanguage,
      ];

      // Build translations object
      const translations: Record<string, { status: string }> = {};
      for (const lang of enabledLanguages) {
        translations[lang] = {
          status: block.content[lang] ? "completed" : "pending",
        };
      }

      // Build new block
      const newBlock: BlockInput = {
        id: crypto.randomUUID(),
        type: block.type,
        content: block.content,
        settings: block.settings,
        style: block.style,
        translations,
        defaultLanguage,
      };

      // Insert at position
      const blocks = [...pageData.pageById.blocks];
      if (position !== undefined && position >= 0 && position < blocks.length) {
        blocks.splice(position, 0, newBlock);
      } else {
        blocks.push(newBlock);
      }

      // Save
      const data = await client.query<{ savePage: Page }>(SAVE_PAGE_MUTATION, {
        input: {
          id: pageId,
          name: pageData.pageById.name,
          slug: pageData.pageById.slug,
          blocks,
        },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { blockId: newBlock.id, page: data.savePage },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    "update_block_content",
    "Update a specific block's content on a page. Merges with existing content.",
    {
      pageId: z.string().describe("Page ID"),
      blockId: z.string().describe("Block instance ID (UUID) to update"),
      content: z
        .record(z.string(), z.unknown())
        .describe("Content to merge: { en: { title: 'New Title' } }"),
      settings: z.record(z.string(), z.unknown()).optional(),
    },
    async ({ pageId, blockId, content, settings }) => {
      // Fetch current page
      const pageData = await client.query<{ pageById: Page | null }>(
        PAGE_BY_ID_QUERY,
        { id: pageId },
      );

      if (!pageData.pageById) {
        return {
          content: [{ type: "text" as const, text: "Page not found" }],
          isError: true,
        };
      }

      const blockIndex = pageData.pageById.blocks.findIndex(
        (b) => b.id === blockId,
      );
      if (blockIndex === -1) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Block '${blockId}' not found on page`,
            },
          ],
          isError: true,
        };
      }

      // Merge content
      const blocks = [...pageData.pageById.blocks];
      const existingBlock = { ...blocks[blockIndex] };

      // Deep merge content per language
      const mergedContent = { ...(existingBlock.content ?? {}) };
      for (const [lang, langContent] of Object.entries(content)) {
        if (
          typeof langContent === "object" &&
          langContent !== null &&
          typeof mergedContent[lang] === "object" &&
          mergedContent[lang] !== null
        ) {
          mergedContent[lang] = {
            ...(mergedContent[lang] as Record<string, unknown>),
            ...(langContent as Record<string, unknown>),
          };
        } else {
          mergedContent[lang] = langContent;
        }
      }
      existingBlock.content = mergedContent;

      if (settings) {
        existingBlock.settings = {
          ...(existingBlock.settings ?? {}),
          ...settings,
        };
      }

      // Update translation status
      if (existingBlock.translations) {
        for (const lang of Object.keys(content)) {
          if (existingBlock.translations[lang]) {
            existingBlock.translations[lang] = { status: "completed" };
          }
        }
      }

      blocks[blockIndex] = existingBlock;

      // Save
      const data = await client.query<{ savePage: Page }>(SAVE_PAGE_MUTATION, {
        input: {
          id: pageId,
          name: pageData.pageById.name,
          slug: pageData.pageById.slug,
          blocks,
        },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.savePage, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "remove_block_from_page",
    "Remove a specific block from a page by its instance ID.",
    {
      pageId: z.string().describe("Page ID"),
      blockId: z.string().describe("Block instance ID (UUID) to remove"),
    },
    async ({ pageId, blockId }) => {
      // Fetch current page
      const pageData = await client.query<{ pageById: Page | null }>(
        PAGE_BY_ID_QUERY,
        { id: pageId },
      );

      if (!pageData.pageById) {
        return {
          content: [{ type: "text" as const, text: "Page not found" }],
          isError: true,
        };
      }

      const blocks = pageData.pageById.blocks.filter((b) => b.id !== blockId);

      if (blocks.length === pageData.pageById.blocks.length) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Block '${blockId}' not found on page`,
            },
          ],
          isError: true,
        };
      }

      // Save
      const data = await client.query<{ savePage: Page }>(SAVE_PAGE_MUTATION, {
        input: {
          id: pageId,
          name: pageData.pageById.name,
          slug: pageData.pageById.slug,
          blocks,
        },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.savePage, null, 2),
          },
        ],
      };
    },
  );

  // ─── Resources ───────────────────────────────────────────────

  server.resource(
    "sitemap",
    "cmssy://sitemap",
    {
      description: "Full page tree as JSON — all pages with hierarchy",
      mimeType: "application/json",
    },
    async (uri) => {
      const data = await client.query<{ pages: Page[] }>(PAGES_QUERY);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(data.pages, null, 2),
          },
        ],
      };
    },
  );

  server.resource(
    "blocks",
    "cmssy://blocks",
    {
      description: "All available block types with schemas and defaults",
      mimeType: "application/json",
    },
    async (uri) => {
      const data = await client.query<{ workspaceBlocks: WorkspaceBlock[] }>(
        WORKSPACE_BLOCKS_QUERY,
      );
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(data.workspaceBlocks, null, 2),
          },
        ],
      };
    },
  );

  server.resource(
    "workspace",
    "cmssy://workspace",
    {
      description: "Workspace info and site configuration merged",
      mimeType: "application/json",
    },
    async (uri) => {
      const [workspaceData, configData] = await Promise.all([
        client.query<{ currentWorkspace: Workspace | null }>(
          CURRENT_WORKSPACE_QUERY,
        ),
        client.query<{ siteConfig: SiteConfig | null }>(SITE_CONFIG_QUERY),
      ]);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                workspace: workspaceData.currentWorkspace,
                siteConfig: configData.siteConfig,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  return server;
}
