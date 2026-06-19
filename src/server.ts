import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { mediaTypeValues } from "@cmssy/types";
import { CmssyClient } from "./graphql-client.js";

// Read our own version from package.json so the MCP handshake
// advertises what the user actually installed, instead of drifting
// whenever we bump the package.
const PACKAGE_VERSION = (() => {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(
      readFileSync(resolve(here, "../package.json"), "utf8"),
    );
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

/**
 * Preprocess helper: parse JSON string to object if needed.
 * MCP clients may serialize complex nested objects as JSON strings
 * instead of passing them as objects. This ensures they're parsed.
 * Malformed JSON is passed through so Zod produces a validation error
 * instead of crashing the handler.
 */
const jsonPreprocess = (val: unknown) => {
  if (typeof val !== "string") return val;
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
};
import {
  PAGES_QUERY,
  PAGE_BY_ID_QUERY,
  SITE_CONFIG_QUERY,
  CURRENT_WORKSPACE_QUERY,
  MEDIA_ASSETS_QUERY,
  SAVE_PAGE_MUTATION,
  PATCH_BLOCK_CONTENT_MUTATION,
  UPDATE_PAGE_SETTINGS_MUTATION,
  TOGGLE_PUBLISH_MUTATION,
  PUBLISH_PAGE_CONTENT_MUTATION,
  PUBLISH_PAGE_LAYOUT_MUTATION,
  REVERT_CONTENT_TO_PUBLISHED_MUTATION,
  REVERT_LAYOUT_TO_PUBLISHED_MUTATION,
  REMOVE_PAGE_MUTATION,
  UPDATE_PAGE_LAYOUT_MUTATION,
  FORMS_QUERY,
  FORM_BY_ID_QUERY,
  FORM_SUBMISSIONS_QUERY,
  FORM_SUBMISSION_BY_ID_QUERY,
  CREATE_FORM_MUTATION,
  UPDATE_FORM_MUTATION,
  DELETE_FORM_MUTATION,
  UPDATE_FORM_SUBMISSION_STATUS_MUTATION,
  DELETE_FORM_SUBMISSION_MUTATION,
  MODEL_DEFINITIONS_QUERY,
  MODEL_DEFINITIONS_BY_SLUG_INDEX_QUERY,
  MODEL_DEFINITION_BY_ID_QUERY,
  MODEL_RECORDS_QUERY,
  MODEL_RECORD_BY_ID_QUERY,
  CREATE_MODEL_DEFINITION_MUTATION,
  UPDATE_MODEL_DEFINITION_MUTATION,
  DELETE_MODEL_DEFINITION_MUTATION,
  CREATE_MODEL_RECORD_MUTATION,
  UPDATE_MODEL_RECORD_MUTATION,
  UPDATE_MODEL_RECORD_STATUS_MUTATION,
  DELETE_MODEL_RECORD_MUTATION,
  IMPORT_MODEL_RECORDS_MUTATION,
  ORDERS_QUERY,
  ORDER_BY_ID_QUERY,
  ORDER_PIPELINE_QUERY,
  CREATE_MANUAL_ORDER_MUTATION,
  EDIT_ORDER_MUTATION,
  UPDATE_ORDER_DETAILS_MUTATION,
  MARK_ORDER_PAID_MUTATION,
  RECORD_ORDER_PAYMENT_MUTATION,
  REFUND_ORDER_MUTATION,
  CANCEL_ORDER_MUTATION,
  TRANSITION_ORDER_FULFILLMENT_MUTATION,
  SET_ORDER_PIPELINE_STAGE_MUTATION,
  RECORD_ORDER_INVOICE_MUTATION,
  ADMIN_CARTS_QUERY,
  DISCOUNTS_QUERY,
  DISCOUNT_BY_ID_QUERY,
  CREATE_DISCOUNT_MUTATION,
  UPDATE_DISCOUNT_MUTATION,
  SET_DISCOUNT_ENABLED_MUTATION,
  WEBHOOK_ENDPOINTS_QUERY,
  WEBHOOK_DELIVERIES_QUERY,
  WEBHOOK_EVENT_TYPES_QUERY,
  CREATE_WEBHOOK_ENDPOINT_MUTATION,
  UPDATE_WEBHOOK_ENDPOINT_MUTATION,
  ROTATE_WEBHOOK_SECRET_MUTATION,
  DELETE_WEBHOOK_ENDPOINT_MUTATION,
  PRODUCT_CATALOG_QUERY,
  BULK_UPDATE_PRODUCT_RECORDS_MUTATION,
  BULK_DELETE_PRODUCT_RECORDS_MUTATION,
} from "./queries.js";
import type {
  Page,
  SiteConfig,
  Workspace,
  MediaAsset,
  BlockInput,
} from "./types.js";
import {
  responseModeSchema,
  pageMinimal,
  pageBlockMinimal,
  formMinimal,
  modelMinimal,
  recordMinimal,
  orderMinimal,
  discountMinimal,
  jsonText,
} from "./responses.js";

export function createServer(client: CmssyClient) {
  const server = new McpServer({
    name: "cmssy",
    version: PACKAGE_VERSION,
  });

  /** Check if value is null, undefined, or empty object */
  const isEmpty = (obj: unknown) =>
    obj == null ||
    (typeof obj === "object" && Object.keys(obj as object).length === 0);

  /** Extract last slug segment - savePage expects relative slug, not fullSlug */
  function toRelativeSlug(slug: string): string {
    if (slug === "/") return "/";
    return "/" + slug.split("/").filter(Boolean).pop();
  }

  /**
   * Optimistic-concurrency guard for a read-modify-write save. Passes the
   * version we just read as `expectedVersion`, so if another writer (e.g. the
   * web editor) changed the page in the read→save window the backend returns
   * VERSION_CONFLICT instead of silently clobbering it. Re-running the tool
   * re-reads the fresh page and succeeds.
   */
  function expectedVersionOf(page: {
    version?: string | number | null;
  }): number | undefined {
    return page?.version != null ? Number(page.version) : undefined;
  }

  // ─── Read Tools ──────────────────────────────────────────────

  server.tool(
    "list_pages",
    "List pages in the workspace. Optionally filter by search query (matches name, slug, displayName).",
    {
      search: z
        .string()
        .optional()
        .describe("Search query to filter pages by name, slug, or displayName"),
    },
    async ({ search }) => {
      const data = await client.query<{ pages: Page[] }>(PAGES_QUERY, {
        search: search || undefined,
      });
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

      const data = await client.query<{ page: Page | null }>(PAGE_BY_ID_QUERY, {
        pageId: id || slug,
      });
      const page = data.page;

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
    "get_site_config",
    "Get site configuration: languages, navigation, header, footer, site name, enabled features",
    {},
    async () => {
      // Dynamically introspect header/footer types from the backend schema
      const [headerSel, footerSel] = await Promise.all([
        client.buildSelectionSet("SiteHeader"),
        client.buildSelectionSet("SiteFooter"),
      ]);

      const query = `
        query SiteConfig {
          siteConfig {
            id
            defaultLanguage
            enabledLanguages
            siteName
            enabledFeatures
            ${headerSel ? `header { ${headerSel} }` : ""}
            ${footerSel ? `footer { ${footerSel} }` : ""}
          }
        }
      `;

      const data = await client.query<{ siteConfig: SiteConfig | null }>(query);
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
    "Create a new page. Returns a minimal ack by default; pass response='full' for the full mutation response.",
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
        .preprocess(jsonPreprocess, z.record(z.string(), z.string()))
        .optional()
        .describe(
          "Multilingual display name, e.g. { en: 'About', pl: 'O nas' }",
        ),
      seoTitle: z
        .preprocess(jsonPreprocess, z.record(z.string(), z.string()))
        .optional()
        .describe("Multilingual SEO title"),
      seoDescription: z
        .preprocess(jsonPreprocess, z.record(z.string(), z.string()))
        .optional()
        .describe("Multilingual SEO description"),
      response: responseModeSchema,
    },
    async ({
      name,
      slug,
      parentId,
      pageType,
      displayName,
      seoTitle,
      seoDescription,
      response,
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
      return jsonText(response, data.savePage, pageMinimal);
    },
  );

  server.tool(
    "update_page_blocks",
    "Set the full content blocks array on a page. Replaces all existing content blocks. Block types are validated server-side on save. Blocks with matching IDs preserve their existing content/settings when not explicitly provided. Returns a minimal ack by default; pass response='full' for the full mutation response.",
    {
      pageId: z.string().describe("Page ID"),
      blocks: z.preprocess(
        jsonPreprocess,
        z
          .array(
            z.object({
              id: z.string().describe("Unique block instance ID (UUID)"),
              type: z.string().describe("Block type"),
              content: z.record(z.string(), z.unknown()).optional(),
              settings: z.record(z.string(), z.unknown()).optional(),
              style: z.record(z.string(), z.unknown()).optional(),
              advanced: z.record(z.string(), z.unknown()).optional(),
              translations: z
                .record(z.string(), z.object({ status: z.string() }))
                .optional(),
              defaultLanguage: z.string().optional(),
              metadata: z.record(z.string(), z.unknown()).optional(),
              blockVersion: z.string().optional(),
            }),
          )
          .describe("Full array of content blocks to set on the page"),
      ),
      response: responseModeSchema,
    },
    async ({ pageId, blocks, response }) => {
      const pageData = await client.query<{ page: Page | null }>(
        PAGE_BY_ID_QUERY,
        { pageId },
      );

      if (!pageData.page) {
        return {
          content: [{ type: "text" as const, text: "Page not found" }],
          isError: true,
        };
      }

      // Merge: preserve existing block data when not provided in input
      const existingBlocks = pageData.page.blocks || [];
      const mergedBlocks = blocks.map((block) => {
        const existing = existingBlocks.find((b) => b.id === block.id);
        if (!existing) return block;
        return {
          ...block,
          content: isEmpty(block.content) ? existing.content : block.content,
          settings: isEmpty(block.settings)
            ? existing.settings
            : block.settings,
          style: block.style ?? existing.style,
          advanced: block.advanced ?? existing.advanced,
          translations: isEmpty(block.translations)
            ? existing.translations
            : block.translations,
          defaultLanguage: block.defaultLanguage ?? existing.defaultLanguage,
          metadata: block.metadata ?? existing.metadata,
          blockVersion: block.blockVersion ?? existing.blockVersion,
        };
      });

      const data = await client.query<{ savePage: Page }>(SAVE_PAGE_MUTATION, {
        input: {
          id: pageId,
          name: pageData.page.name,
          slug: toRelativeSlug(pageData.page.slug),
          parentId: pageData.page.parentId ?? undefined,
          blocks: mergedBlocks,
          expectedVersion: expectedVersionOf(pageData.page),
        },
      });
      return jsonText(response, data.savePage, pageMinimal);
    },
  );

  server.tool(
    "update_page_settings",
    "Update page metadata: name, slug, display name, SEO fields. Returns a minimal ack by default; pass response='full' for the full mutation response.",
    {
      id: z.string().describe("Page ID"),
      name: z.string().optional().describe("Internal page name"),
      slug: z.string().optional().describe("URL slug"),
      displayName: z
        .preprocess(jsonPreprocess, z.record(z.string(), z.string()))
        .optional()
        .describe("Multilingual display name"),
      seoTitle: z
        .preprocess(jsonPreprocess, z.record(z.string(), z.string()))
        .optional()
        .describe("Multilingual SEO title"),
      seoDescription: z
        .preprocess(jsonPreprocess, z.record(z.string(), z.string()))
        .optional()
        .describe("Multilingual SEO description"),
      seoKeywords: z.array(z.string()).optional().describe("SEO keywords"),
      response: responseModeSchema,
    },
    async ({
      id,
      name,
      slug,
      displayName,
      seoTitle,
      seoDescription,
      seoKeywords,
      response,
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
      return jsonText(response, data.updatePageSettings, pageMinimal);
    },
  );

  server.tool(
    "publish_page",
    "Publish a page or re-publish with latest draft changes. Publishes both content and layout axes. Returns a minimal ack by default; pass response='full' for the full mutation response.",
    {
      pageId: z.string().describe("Page ID to publish"),
      response: responseModeSchema,
    },
    async ({ pageId, response }) => {
      const pageData = await client.query<{ page: Page | null }>(
        PAGE_BY_ID_QUERY,
        { pageId },
      );

      if (!pageData.page) {
        return {
          content: [{ type: "text" as const, text: "Page not found" }],
          isError: true,
        };
      }

      const page = pageData.page;

      if (
        page.published &&
        !page.hasUnpublishedContentChanges &&
        !page.hasUnpublishedLayoutChanges
      ) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Page is already published with latest content. No changes to publish.",
            },
          ],
        };
      }

      // Publishing content flips published=true and snapshots blocks.
      const contentData = await client.query<{ publishPageContent: Page }>(
        PUBLISH_PAGE_CONTENT_MUTATION,
        { id: pageId },
      );

      // Publish layout too so no draft axis is left behind. The two axes are
      // separate backend mutations - if layout fails, content is already
      // published, so report the partial state instead of a bare throw.
      let layoutData: { publishPageLayout: Page | null };
      try {
        layoutData = await client.query<{ publishPageLayout: Page | null }>(
          PUBLISH_PAGE_LAYOUT_MUTATION,
          { id: pageId },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Content published, but the layout axis failed and is still unpublished: ${message}. Note: re-running publish_page also re-publishes the current content draft, so publish any pending content edits first.`,
            },
          ],
          isError: true,
        };
      }

      if (!layoutData.publishPageLayout) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Content published, but the layout axis returned no result and is still unpublished. Note: re-running publish_page also re-publishes the current content draft, so publish any pending content edits first.",
            },
          ],
          isError: true,
        };
      }

      // Merge: content payload carries blocks, layout payload carries the
      // up-to-date layout flags (it ran last).
      const published = {
        ...contentData.publishPageContent,
        ...layoutData.publishPageLayout,
      };
      return jsonText(response, published, (p) =>
        pageMinimal(p, { published: true }),
      );
    },
  );

  server.tool(
    "unpublish_page",
    "Unpublish a published page (toggles published state off). Returns a minimal ack by default; pass response='full' for the full mutation response.",
    {
      pageId: z.string().describe("Page ID to unpublish"),
      response: responseModeSchema,
    },
    async ({ pageId, response }) => {
      const pageData = await client.query<{ page: Page | null }>(
        PAGE_BY_ID_QUERY,
        { pageId },
      );

      if (!pageData.page) {
        return {
          content: [{ type: "text" as const, text: "Page not found" }],
          isError: true,
        };
      }

      if (!pageData.page.published) {
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
      return jsonText(response, data.togglePublish, (p) =>
        pageMinimal(p, { published: false }),
      );
    },
  );

  server.tool(
    "revert_to_published",
    "Discard all draft changes and revert a page to its last published version. Returns a minimal ack by default; pass response='full' for the full mutation response.",
    {
      pageId: z.string().describe("Page ID to revert"),
      response: responseModeSchema,
    },
    async ({ pageId, response }) => {
      // Both revert mutations throw if the page has no published version, so
      // guard up front for a clean message (mirrors publish_page/unpublish_page).
      const pageData = await client.query<{ page: Page | null }>(
        PAGE_BY_ID_QUERY,
        { pageId },
      );

      if (!pageData.page) {
        return {
          content: [{ type: "text" as const, text: "Page not found" }],
          isError: true,
        };
      }

      if (!pageData.page.published) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Page has no published version to revert to",
            },
          ],
          isError: true,
        };
      }

      const contentData = await client.query<{
        revertContentToPublished: Page | null;
      }>(REVERT_CONTENT_TO_PUBLISHED_MUTATION, { id: pageId });

      const revertedContent = contentData.revertContentToPublished;
      if (!revertedContent) {
        return {
          content: [
            { type: "text" as const, text: "Failed to revert page content" },
          ],
          isError: true,
        };
      }

      // Layout revert is a separate mutation - if it fails, content drafts are
      // already discarded, so report the partial state rather than a bare throw.
      let layoutData: { revertLayoutToPublished: Page | null };
      try {
        layoutData = await client.query<{
          revertLayoutToPublished: Page | null;
        }>(REVERT_LAYOUT_TO_PUBLISHED_MUTATION, { id: pageId });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Content reverted, but the layout axis failed and still holds draft changes: ${message}. Note: re-running revert_to_published reverts the content axis again first, discarding any content edits made since this failure.`,
            },
          ],
          isError: true,
        };
      }

      if (!layoutData.revertLayoutToPublished) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Content reverted, but the layout axis returned no result and still holds draft changes. Note: re-running revert_to_published reverts the content axis again first, discarding any content edits made since this failure.",
            },
          ],
          isError: true,
        };
      }

      // Merge: content payload carries blocks, layout payload carries the
      // up-to-date layout flags (it ran last).
      const reverted = {
        ...revertedContent,
        ...layoutData.revertLayoutToPublished,
      };
      return jsonText(response, reverted, pageMinimal);
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

  // ─── Layout Tools ──────────────────────────────────────────

  server.tool(
    "update_page_layout",
    "Update page-level layout settings: inheritance, overrides, or replace all layout blocks. Block types are validated server-side on save. Returns a minimal ack by default; pass response='full' for the full mutation response.",
    {
      pageId: z.string().describe("Page ID"),
      layoutBlocks: z
        .array(z.record(z.string(), z.unknown()))
        .optional()
        .describe(
          "Full replacement array of layout blocks. Each must have 'type' (validated server-side on save). Position, order, content etc. are passed through to the backend.",
        ),
      layoutOverrides: z
        .array(
          z.object({
            position: z.string().describe("Layout position to override"),
            action: z.string().describe("Override action"),
            blockId: z.string().optional().describe("Replacement block ID"),
          }),
        )
        .optional()
        .describe("Layout overrides for inherited positions"),
      inheritsLayout: z
        .boolean()
        .optional()
        .describe("Whether this page inherits layout from parent"),
      response: responseModeSchema,
    },
    async ({
      pageId,
      layoutBlocks,
      layoutOverrides,
      inheritsLayout,
      response,
    }) => {
      // Merge layout blocks: preserve existing content when not provided
      let mergedLayoutBlocks = layoutBlocks;
      if (layoutBlocks) {
        const pageData = await client.query<{ page: Page | null }>(
          PAGE_BY_ID_QUERY,
          { pageId },
        );
        const existingLayoutBlocks = pageData.page?.layoutBlocks ?? [];
        mergedLayoutBlocks = layoutBlocks.map((block) => {
          const existing = existingLayoutBlocks.find((b) => b.id === block.id);
          if (!existing) return block;
          return {
            ...block,
            content: isEmpty(block.content) ? existing.content : block.content,
            settings: isEmpty(block.settings)
              ? existing.settings
              : block.settings,
            translations: isEmpty(block.translations)
              ? existing.translations
              : block.translations,
          };
        });
      }

      const input: Record<string, unknown> = { pageId };
      if (mergedLayoutBlocks !== undefined)
        input.layoutBlocks = mergedLayoutBlocks;
      if (layoutOverrides !== undefined)
        input.layoutOverrides = layoutOverrides;
      if (inheritsLayout !== undefined) input.inheritsLayout = inheritsLayout;

      const data = await client.query<{ updatePageLayout: Page | null }>(
        UPDATE_PAGE_LAYOUT_MUTATION,
        { input },
      );

      if (!data.updatePageLayout) {
        return {
          content: [
            { type: "text" as const, text: "Page not found or update failed" },
          ],
          isError: true,
        };
      }

      return jsonText(response, data.updatePageLayout, pageMinimal);
    },
  );

  // ─── Block Helper Tools (read-modify-write) ─────────────────

  server.tool(
    "add_block_to_page",
    "Add a block to a page. Auto-generates UUID and translation status. Pass layoutPosition (e.g. 'header'/'footer') to add a layout block; omit it for a content block in the page body. Returns a minimal ack by default ({pageId, blockId, hasUnpublishedChanges, updatedAt}); pass response='full' for the full mutation response.",
    {
      pageId: z.string().describe("Page ID"),
      block: z.preprocess(
        jsonPreprocess,
        z.object({
          type: z.string().describe("Block type"),
          content: z
            .record(z.string(), z.unknown())
            .describe(
              "Language-keyed content: { en: { title: '...' }, pl: { title: '...' } }",
            ),
          settings: z.record(z.string(), z.unknown()).optional(),
          style: z.record(z.string(), z.unknown()).optional(),
        }),
      ),
      layoutPosition: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          "Layout position (e.g. 'header', 'footer') to add a layout block; omit for a content block",
        ),
      position: z
        .number()
        .optional()
        .describe(
          "0-based position to insert at (default: end). Content blocks only - layout blocks are always appended within their position",
        ),
      response: responseModeSchema,
    },
    async ({ pageId, block, layoutPosition, position, response }) => {
      // Fetch current page
      const pageData = await client.query<{ page: Page | null }>(
        PAGE_BY_ID_QUERY,
        { pageId },
      );

      if (!pageData.page) {
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

      const newBlockId = crypto.randomUUID();

      if (layoutPosition) {
        // Layout block — add to layoutBlocks via updatePageLayout
        const existingLayoutBlocks = pageData.page.layoutBlocks || [];

        // Append after existing blocks in same position
        const maxOrder = existingLayoutBlocks
          .filter((b) => b.position === layoutPosition)
          .reduce((max, b) => Math.max(max, b.order), -1);

        const newLayoutBlock = {
          id: newBlockId,
          type: block.type,
          position: layoutPosition,
          order: maxOrder + 1,
          isActive: true,
          content: block.content,
          settings: block.settings,
          style: block.style,
          translations,
          defaultLanguage,
        };

        const layoutBlocks = [...existingLayoutBlocks, newLayoutBlock];
        const data = await client.query<{ updatePageLayout: Page | null }>(
          UPDATE_PAGE_LAYOUT_MUTATION,
          { input: { pageId, layoutBlocks } },
        );

        if (!data.updatePageLayout) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to update layout while adding block to page '${pageId}'`,
              },
            ],
            isError: true,
          };
        }

        return jsonText(
          response,
          { blockId: newBlockId, page: data.updatePageLayout },
          () => pageBlockMinimal(data.updatePageLayout!, newBlockId),
        );
      } else {
        // Content block — add to blocks via savePage
        const newBlock: BlockInput = {
          id: newBlockId,
          type: block.type,
          content: block.content,
          settings: block.settings,
          style: block.style,
          translations,
          defaultLanguage,
        };

        const blocks = [...pageData.page.blocks];
        if (
          position !== undefined &&
          position >= 0 &&
          position < blocks.length
        ) {
          blocks.splice(position, 0, newBlock);
        } else {
          blocks.push(newBlock);
        }

        const data = await client.query<{ savePage: Page }>(
          SAVE_PAGE_MUTATION,
          {
            input: {
              id: pageId,
              name: pageData.page.name,
              slug: toRelativeSlug(pageData.page.slug),
              parentId: pageData.page.parentId ?? undefined,
              blocks,
              expectedVersion: expectedVersionOf(pageData.page),
            },
          },
        );

        return jsonText(
          response,
          { blockId: newBlockId, page: data.savePage },
          () => pageBlockMinimal(data.savePage, newBlockId),
        );
      }
    },
  );

  server.tool(
    "update_block_content",
    "Update a specific block's content on a page. Merges with existing content. Works for both content and layout blocks. Returns a minimal ack by default ({pageId, blockId, hasUnpublishedChanges, updatedAt}); pass response='full' for the full mutation response.",
    {
      pageId: z.string().describe("Page ID"),
      blockId: z.string().describe("Block instance ID (UUID) to update"),
      content: z
        .record(z.string(), z.unknown())
        .describe("Content to merge: { en: { title: 'New Title' } }"),
      settings: z.record(z.string(), z.unknown()).optional(),
      response: responseModeSchema,
    },
    async ({ pageId, blockId, content, settings, response }) => {
      // Fetch current page
      const pageData = await client.query<{ page: Page | null }>(
        PAGE_BY_ID_QUERY,
        { pageId },
      );

      if (!pageData.page) {
        return {
          content: [{ type: "text" as const, text: "Page not found" }],
          isError: true,
        };
      }

      const page = pageData.page;

      // Search in content blocks first, then layout blocks
      const contentIdx = page.blocks.findIndex((b) => b.id === blockId);
      const layoutIdx =
        contentIdx === -1
          ? (page.layoutBlocks || []).findIndex((b) => b.id === blockId)
          : -1;

      if (contentIdx === -1 && layoutIdx === -1) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Block '${blockId}' not found on page (checked both content and layout blocks)`,
            },
          ],
          isError: true,
        };
      }

      const isLayout = layoutIdx !== -1;
      const targetArray = isLayout
        ? [...(page.layoutBlocks || [])]
        : [...page.blocks];
      const targetIndex = isLayout ? layoutIdx : contentIdx;

      // Merge content
      const existingBlock = { ...targetArray[targetIndex] };
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

      targetArray[targetIndex] = existingBlock;

      if (isLayout) {
        const data = await client.query<{ updatePageLayout: Page | null }>(
          UPDATE_PAGE_LAYOUT_MUTATION,
          { input: { pageId, layoutBlocks: targetArray } },
        );
        if (!data.updatePageLayout) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to update layout while editing block '${blockId}' on page '${pageId}'`,
              },
            ],
            isError: true,
          };
        }
        return jsonText(response, data.updatePageLayout, (p) =>
          pageBlockMinimal(p, blockId),
        );
      } else {
        const data = await client.query<{ savePage: Page }>(
          SAVE_PAGE_MUTATION,
          {
            input: {
              id: pageId,
              name: page.name,
              slug: toRelativeSlug(page.slug),
              parentId: page.parentId ?? undefined,
              blocks: targetArray,
              expectedVersion: expectedVersionOf(page),
            },
          },
        );
        return jsonText(response, data.savePage, (p) =>
          pageBlockMinimal(p, blockId),
        );
      }
    },
  );

  server.tool(
    "patch_block_content",
    "Apply surgical HTML edits (insert_before/insert_after/replace_section) to a block's localized content string (e.g. a docs-article HTML body) without re-sending the full content. Use this for small edits where you have a unique anchor substring in the existing HTML - it's ~10x cheaper in tokens than update_block_content and rejects any op whose marker is missing or ambiguous. For replace_section: startMarker is inclusive, endMarker is exclusive.",
    {
      pageId: z.string().describe("Page ID"),
      blockId: z
        .string()
        .describe(
          "Block instance ID (UUID) on the page. Layout blocks (header/footer) aren't supported - use update_block_content for those.",
        ),
      locale: z
        .string()
        .describe(
          "Language code matching the workspace's enabledLanguages (e.g. 'en', 'pl', 'zh'). Check get_site_config first if unsure.",
        ),
      fieldPath: z
        .string()
        .optional()
        .describe(
          "Field inside content[locale] to patch (default: 'content', the HTML body of docs-article blocks). Must resolve to a string.",
        ),
      expectedVersion: z
        .number()
        .int()
        .optional()
        .describe(
          "Optimistic-concurrency guard: the page `version` you last read (e.g. from get_page). If set and the page changed since, the patch is rejected with VERSION_CONFLICT instead of overwriting concurrent edits - refetch the page and retry.",
        ),
      // `jsonPreprocess` matches the other tools in this file that accept
      // complex inputs - MCP clients sometimes JSON-serialize nested
      // arrays/objects instead of passing raw JSON. Without the preprocess
      // those clients fail validation before the handler ever runs.
      operations: z.preprocess(
        jsonPreprocess,
        z
          .array(
            // Discriminated on `op` so clients can't pass e.g. `insert_before`
            // with a `startMarker` - the backend would reject, but it's
            // cleaner (and cheaper) to fail at MCP boundary.
            z
              .discriminatedUnion("op", [
                z
                  .object({
                    op: z
                      .literal("insert_before")
                      .describe("Insert html immediately before `marker`"),
                    marker: z
                      .string()
                      .describe(
                        "Unique anchor substring. Must match exactly one location in the field (zero or multiple → error).",
                      ),
                    html: z.string().describe("HTML fragment to insert"),
                  })
                  .strict(),
                z
                  .object({
                    op: z
                      .literal("insert_after")
                      .describe("Insert html immediately after `marker`"),
                    marker: z
                      .string()
                      .describe(
                        "Unique anchor substring. Must match exactly one location in the field (zero or multiple → error).",
                      ),
                    html: z.string().describe("HTML fragment to insert"),
                  })
                  .strict(),
                z
                  .object({
                    op: z
                      .literal("replace_section")
                      .describe(
                        "Replace everything from startMarker (inclusive) up to endMarker (exclusive)",
                      ),
                    startMarker: z
                      .string()
                      .describe(
                        "Inclusive lower bound. Must match exactly one location.",
                      ),
                    endMarker: z
                      .string()
                      .describe(
                        "Exclusive upper bound. Must appear exactly once after startMarker.",
                      ),
                    html: z
                      .string()
                      .describe("HTML fragment to replace the section with"),
                  })
                  .strict(),
              ])
              .describe(
                "A single patch op. Ops apply in order; any failure aborts the whole patch (no half-applied state).",
              ),
          )
          .min(1)
          .describe(
            "Ordered list of patch operations. Apply smallest first - each op must still find its markers in the string after previous ops have applied.",
          ),
      ),
    },
    async ({
      pageId,
      blockId,
      locale,
      fieldPath,
      operations,
      expectedVersion,
    }) => {
      // discriminatedUnion narrows each op so only the relevant marker
      // fields are present - pass them through directly.
      // Narrow shape matches the minimal selection set in
      // PATCH_BLOCK_CONTENT_MUTATION - we don't round-trip block content.
      interface PatchResult {
        id: string;
        slug: string;
        hasUnpublishedContentChanges: boolean;
        hasUnpublishedLayoutChanges: boolean;
        updatedAt: string;
      }

      // Zod's discriminatedUnion + .strict() already shapes each op
      // exactly like the backend's PatchOperationInput (insert_*: op,
      // marker, html; replace_section: op, startMarker, endMarker, html).
      // Pass the array straight through - a manual map here is both
      // redundant AND unsafe (a switch without an exhaustiveness check
      // could return undefined on an unexpected op, which would then
      // serialize as null in the mutation variables and blow up server-side
      // with a hard-to-trace error).
      const data = await client.query<{
        patchBlockContent: PatchResult | null;
      }>(PATCH_BLOCK_CONTENT_MUTATION, {
        input: {
          pageId,
          blockId,
          locale,
          ...(fieldPath ? { fieldPath } : {}),
          ...(expectedVersion !== undefined ? { expectedVersion } : {}),
          operations,
        },
      });

      if (!data.patchBlockContent) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Page not found or patch failed",
            },
          ],
          isError: true,
        };
      }

      // Compact JSON: patch_block_content is ack-only (no pretty-print
      // needed), matching the compact shape used by minimal-mode returns.
      const patched = data.patchBlockContent;
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              id: patched.id,
              slug: patched.slug,
              hasUnpublishedChanges:
                Boolean(patched.hasUnpublishedContentChanges) ||
                Boolean(patched.hasUnpublishedLayoutChanges),
              updatedAt: patched.updatedAt,
            }),
          },
        ],
      };
    },
  );

  server.tool(
    "remove_block_from_page",
    "Remove a specific block from a page by its instance ID. Works for both content and layout blocks. Returns a minimal ack by default ({pageId, blockId, hasUnpublishedChanges, updatedAt}); pass response='full' for the full mutation response.",
    {
      pageId: z.string().describe("Page ID"),
      blockId: z.string().describe("Block instance ID (UUID) to remove"),
      response: responseModeSchema,
    },
    async ({ pageId, blockId, response }) => {
      const pageData = await client.query<{ page: Page | null }>(
        PAGE_BY_ID_QUERY,
        { pageId },
      );

      if (!pageData.page) {
        return {
          content: [{ type: "text" as const, text: "Page not found" }],
          isError: true,
        };
      }

      const page = pageData.page;

      // Try content blocks first
      const contentBlocks = page.blocks.filter((b) => b.id !== blockId);
      if (contentBlocks.length < page.blocks.length) {
        const data = await client.query<{ savePage: Page }>(
          SAVE_PAGE_MUTATION,
          {
            input: {
              id: pageId,
              name: page.name,
              slug: toRelativeSlug(page.slug),
              parentId: page.parentId ?? undefined,
              blocks: contentBlocks,
              expectedVersion: expectedVersionOf(page),
            },
          },
        );
        return jsonText(response, data.savePage, (p) =>
          pageBlockMinimal(p, blockId),
        );
      }

      // Try layout blocks
      const layoutBlocks = (page.layoutBlocks || []).filter(
        (b) => b.id !== blockId,
      );
      if (layoutBlocks.length < (page.layoutBlocks || []).length) {
        const data = await client.query<{ updatePageLayout: Page | null }>(
          UPDATE_PAGE_LAYOUT_MUTATION,
          { input: { pageId, layoutBlocks } },
        );
        if (!data.updatePageLayout) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to update layout while removing block '${blockId}' from page '${pageId}'`,
              },
            ],
            isError: true,
          };
        }
        return jsonText(response, data.updatePageLayout, (p) =>
          pageBlockMinimal(p, blockId),
        );
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Block '${blockId}' not found on page (checked both content and layout blocks)`,
          },
        ],
        isError: true,
      };
    },
  );

  // ─── Form Tools ──────────────────────────────────────────────

  server.tool(
    "list_forms",
    "List forms in the workspace with optional status filter and pagination.",
    {
      status: z
        .enum(["draft", "published", "archived"])
        .optional()
        .describe("Filter by form status"),
      skip: z
        .number()
        .optional()
        .default(0)
        .describe("Number of items to skip"),
      limit: z
        .number()
        .optional()
        .default(50)
        .describe("Max items to return (default 50)"),
    },
    async ({ status, skip, limit }) => {
      const data = await client.query<{
        forms: { forms: unknown[]; total: number; hasMore: boolean };
      }>(FORMS_QUERY, {
        status: status || undefined,
        skip,
        limit,
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(data.forms, null, 2) },
        ],
      };
    },
  );

  server.tool(
    "get_form",
    "Get full form details including fields, settings, and i18n content.",
    {
      formId: z.string().describe("Form ID"),
    },
    async ({ formId }) => {
      const data = await client.query<{ form: unknown | null }>(
        FORM_BY_ID_QUERY,
        { formId },
      );
      if (!data.form) {
        return {
          content: [{ type: "text" as const, text: "Form not found" }],
          isError: true,
        };
      }
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(data.form, null, 2) },
        ],
      };
    },
  );

  server.tool(
    "create_form",
    "Create a new form with fields and settings. Returns a minimal ack by default; pass response='full' for the full form.",
    {
      name: z.string().describe("Form name"),
      slug: z.string().describe("URL-friendly slug (must be unique)"),
      description: z.string().optional().describe("Form description"),
      fields: z
        .preprocess(
          jsonPreprocess,
          z.array(
            z.object({
              id: z.string().describe("Unique field ID"),
              name: z.string().describe("Field name (used as form data key)"),
              fieldType: z
                .enum([
                  "text",
                  "email",
                  "password",
                  "textarea",
                  "number",
                  "phone",
                  "url",
                  "date",
                  "datetime",
                  "select",
                  "multiselect",
                  "checkbox",
                  "radio",
                  "file",
                  "hidden",
                ])
                .optional()
                .default("text"),
              label: z
                .record(z.string(), z.unknown())
                .optional()
                .describe("i18n labels: { en: 'Name', pl: 'Imię' }"),
              placeholder: z.record(z.string(), z.unknown()).optional(),
              helpText: z.record(z.string(), z.unknown()).optional(),
              defaultValue: z.string().optional(),
              validation: z
                .object({
                  required: z.boolean().optional(),
                  minLength: z.number().optional(),
                  maxLength: z.number().optional(),
                  minValue: z.number().optional(),
                  maxValue: z.number().optional(),
                  pattern: z.string().optional(),
                  customMessage: z.string().optional(),
                })
                .optional(),
              options: z
                .array(
                  z.object({
                    value: z.string(),
                    label: z.record(z.string(), z.unknown()).optional(),
                    disabled: z.boolean().optional(),
                  }),
                )
                .optional(),
              width: z
                .enum(["full", "half", "third"])
                .optional()
                .default("full"),
              order: z.number().optional().default(0),
              showIf: z.record(z.string(), z.unknown()).optional(),
            }),
          ),
        )
        .optional()
        .describe("Form field definitions"),
      settings: z
        .preprocess(
          jsonPreprocess,
          z.object({
            actionType: z
              .enum(["login", "register", "newsletter", "contact", "custom"])
              .optional()
              .default("contact"),
            webhookUrl: z.string().optional(),
            emailRecipients: z.array(z.string()).optional(),
            newsletterListId: z.string().optional(),
            submitButtonLabel: z.record(z.string(), z.unknown()).optional(),
            successMessage: z.record(z.string(), z.unknown()).optional(),
            errorMessage: z.record(z.string(), z.unknown()).optional(),
            redirectUrl: z.string().optional(),
            enableCaptcha: z.boolean().optional(),
            requireLogin: z.boolean().optional(),
            saveSubmissions: z.boolean().optional(),
            sendEmailNotification: z.boolean().optional(),
            emailConfigurationId: z.string().optional(),
          }),
        )
        .optional()
        .describe("Form settings (action type, notifications, etc.)"),
      response: responseModeSchema,
    },
    async ({ name, slug, description, fields, settings, response }) => {
      const input: Record<string, unknown> = { name, slug };
      if (description) input.description = description;
      if (fields) input.fields = fields;
      if (settings) input.settings = settings;

      const data = await client.query<{
        createForm: {
          id: string;
          slug?: string | null;
          status?: string | null;
          updatedAt?: string | null;
        };
      }>(CREATE_FORM_MUTATION, { input });
      return jsonText(response, data.createForm, formMinimal);
    },
  );

  server.tool(
    "update_form",
    "Update an existing form's name, slug, status, fields, or settings. Returns a minimal ack by default; pass response='full' for the full form.",
    {
      formId: z.string().describe("Form ID to update"),
      name: z.string().optional().describe("New form name"),
      slug: z.string().optional().describe("New slug"),
      description: z.string().optional().describe("New description"),
      status: z
        .enum(["draft", "published", "archived"])
        .optional()
        .describe("New status"),
      fields: z
        .preprocess(
          jsonPreprocess,
          z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              fieldType: z
                .enum([
                  "text",
                  "email",
                  "password",
                  "textarea",
                  "number",
                  "phone",
                  "url",
                  "date",
                  "datetime",
                  "select",
                  "multiselect",
                  "checkbox",
                  "radio",
                  "file",
                  "hidden",
                ])
                .optional(),
              label: z.record(z.string(), z.unknown()).optional(),
              placeholder: z.record(z.string(), z.unknown()).optional(),
              helpText: z.record(z.string(), z.unknown()).optional(),
              defaultValue: z.string().optional(),
              validation: z
                .object({
                  required: z.boolean().optional(),
                  minLength: z.number().optional(),
                  maxLength: z.number().optional(),
                  minValue: z.number().optional(),
                  maxValue: z.number().optional(),
                  pattern: z.string().optional(),
                  customMessage: z.string().optional(),
                })
                .optional(),
              options: z
                .array(
                  z.object({
                    value: z.string(),
                    label: z.record(z.string(), z.unknown()).optional(),
                    disabled: z.boolean().optional(),
                  }),
                )
                .optional(),
              width: z.enum(["full", "half", "third"]).optional(),
              order: z.number().optional(),
              showIf: z.record(z.string(), z.unknown()).optional(),
            }),
          ),
        )
        .optional()
        .describe("Replacement fields array"),
      settings: z
        .preprocess(
          jsonPreprocess,
          z.object({
            actionType: z
              .enum(["login", "register", "newsletter", "contact", "custom"])
              .optional(),
            webhookUrl: z.string().optional(),
            emailRecipients: z.array(z.string()).optional(),
            newsletterListId: z.string().optional(),
            submitButtonLabel: z.record(z.string(), z.unknown()).optional(),
            successMessage: z.record(z.string(), z.unknown()).optional(),
            errorMessage: z.record(z.string(), z.unknown()).optional(),
            redirectUrl: z.string().optional(),
            enableCaptcha: z.boolean().optional(),
            requireLogin: z.boolean().optional(),
            saveSubmissions: z.boolean().optional(),
            sendEmailNotification: z.boolean().optional(),
            emailConfigurationId: z.string().optional(),
          }),
        )
        .optional()
        .describe("Updated settings"),
      response: responseModeSchema,
    },
    async ({
      formId,
      name,
      slug,
      description,
      status,
      fields,
      settings,
      response,
    }) => {
      const input: Record<string, unknown> = {};
      if (name !== undefined) input.name = name;
      if (slug !== undefined) input.slug = slug;
      if (description !== undefined) input.description = description;
      if (status !== undefined) input.status = status;
      if (fields !== undefined) input.fields = fields;
      if (settings !== undefined) input.settings = settings;

      const data = await client.query<{
        updateForm: {
          id: string;
          slug?: string | null;
          status?: string | null;
          updatedAt?: string | null;
        } | null;
      }>(UPDATE_FORM_MUTATION, { formId, input });
      if (!data.updateForm) {
        return {
          content: [
            { type: "text" as const, text: "Form not found or update failed" },
          ],
          isError: true,
        };
      }
      return jsonText(response, data.updateForm, formMinimal);
    },
  );

  server.tool(
    "delete_form",
    "Permanently delete a form and all its submissions.",
    {
      formId: z.string().describe("Form ID to delete"),
    },
    async ({ formId }) => {
      const data = await client.query<{ deleteForm: boolean }>(
        DELETE_FORM_MUTATION,
        { formId },
      );
      return {
        content: [
          {
            type: "text" as const,
            text: data.deleteForm
              ? "Form deleted successfully"
              : "Failed to delete form",
          },
        ],
      };
    },
  );

  server.tool(
    "list_form_submissions",
    "List form submissions with optional filters and pagination.",
    {
      formId: z.string().optional().describe("Filter by form ID"),
      status: z
        .enum(["pending", "processed", "spam", "archived"])
        .optional()
        .describe("Filter by submission status"),
      skip: z.number().optional().default(0),
      limit: z.number().optional().default(50),
    },
    async ({ formId, status, skip, limit }) => {
      const data = await client.query<{
        formSubmissions: {
          submissions: unknown[];
          total: number;
          hasMore: boolean;
        };
      }>(FORM_SUBMISSIONS_QUERY, {
        formId: formId || undefined,
        status: status || undefined,
        skip,
        limit,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.formSubmissions, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "get_form_submission",
    "Get a specific form submission by ID.",
    {
      submissionId: z.string().describe("Submission ID"),
    },
    async ({ submissionId }) => {
      const data = await client.query<{ formSubmission: unknown | null }>(
        FORM_SUBMISSION_BY_ID_QUERY,
        { submissionId },
      );
      if (!data.formSubmission) {
        return {
          content: [{ type: "text" as const, text: "Submission not found" }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.formSubmission, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "update_form_submission_status",
    "Update a form submission's status (pending, processed, spam, archived).",
    {
      submissionId: z.string().describe("Submission ID"),
      status: z
        .enum(["pending", "processed", "spam", "archived"])
        .describe("New status"),
    },
    async ({ submissionId, status }) => {
      const data = await client.query<{
        updateFormSubmissionStatus: boolean;
      }>(UPDATE_FORM_SUBMISSION_STATUS_MUTATION, { submissionId, status });
      return {
        content: [
          {
            type: "text" as const,
            text: data.updateFormSubmissionStatus
              ? "Submission status updated"
              : "Failed to update submission status",
          },
        ],
      };
    },
  );

  server.tool(
    "delete_form_submission",
    "Permanently delete a form submission.",
    {
      submissionId: z.string().describe("Submission ID to delete"),
    },
    async ({ submissionId }) => {
      const data = await client.query<{ deleteFormSubmission: boolean }>(
        DELETE_FORM_SUBMISSION_MUTATION,
        { submissionId },
      );
      return {
        content: [
          {
            type: "text" as const,
            text: data.deleteFormSubmission
              ? "Submission deleted successfully"
              : "Failed to delete submission",
          },
        ],
      };
    },
  );

  // ─── Model Tools (Custom Data Models) ────────────────────────

  const propertyFieldTypes = [
    "string",
    "richtext",
    "number",
    "boolean",
    "date",
    "datetime",
    "email",
    "url",
    "media",
    "relation",
    "select",
    "multiselect",
    "object",
    "list",
  ] as const;

  const relationTypes = ["hasOne", "hasMany", "manyToMany"] as const;

  type PropertyFieldInput = {
    key: string;
    label: string;
    type: (typeof propertyFieldTypes)[number];
    required?: boolean;
    description?: string;
    defaultValue?: string;
    options?: string[];
    fields?: PropertyFieldInput[];
    itemType?: (typeof propertyFieldTypes)[number];
    itemFields?: PropertyFieldInput[];
    relationTo?: string;
    relationType?: (typeof relationTypes)[number];
    acceptedTypes?: (typeof mediaTypeValues)[number][];
    multiple?: boolean;
    schemaProperty?: string;
    minLength?: number;
    maxLength?: number;
    minValue?: number;
    maxValue?: number;
    pattern?: string;
  };

  const propertyFieldSchema: z.ZodType<PropertyFieldInput> = z.lazy(() =>
    z.object({
      key: z.string().describe("Field key (identifier in record data)"),
      label: z.string().describe("Human-readable field label"),
      type: z
        .enum(propertyFieldTypes)
        .describe("Field type — controls validation + UI"),
      required: z.boolean().optional(),
      description: z.string().optional(),
      defaultValue: z.string().optional(),
      options: z
        .array(z.string())
        .optional()
        .describe("For select/multiselect: allowed values"),
      fields: z
        .array(propertyFieldSchema)
        .optional()
        .describe("For type=object: nested fields"),
      itemType: z
        .enum(propertyFieldTypes)
        .optional()
        .describe("For type=list: item type"),
      itemFields: z
        .array(propertyFieldSchema)
        .optional()
        .describe("For type=list of objects: nested field defs"),
      relationTo: z
        .string()
        .optional()
        .describe("For type=relation: target model slug"),
      relationType: z.enum(relationTypes).optional(),
      acceptedTypes: z
        .array(z.enum(mediaTypeValues))
        .optional()
        .describe("For type=media: allowed media kinds (empty = all)"),
      multiple: z
        .boolean()
        .optional()
        .describe("For type=media: true = gallery, false = single"),
      schemaProperty: z.string().optional(),
      minLength: z.number().int().optional(),
      maxLength: z.number().int().optional(),
      minValue: z.number().optional(),
      maxValue: z.number().optional(),
      pattern: z.string().optional(),
    }),
  );

  const statusFieldSchema = z.object({
    enabled: z.boolean().optional(),
    values: z
      .array(z.string())
      .optional()
      .describe("Allowed status values (e.g. ['draft','active'])"),
    defaultValue: z.string().optional(),
    transitions: z
      .array(
        z.object({
          from: z.string(),
          to: z.array(z.string()),
        }),
      )
      .optional()
      .describe("Allowed transitions: from one state to a set of states"),
  });

  const defaultSortSchema = z.object({
    field: z.string(),
    direction: z.enum(["asc", "desc"]),
  });

  const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

  // Match backend: apps/backend/src/models/model-definition.ts
  const SLUG_RE = /^[a-z][a-z0-9-]*$/;
  const SLUG_MSG =
    "Slug must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens";

  server.tool(
    "list_models",
    "List all Custom Data Models (ModelDefinition) in the workspace.",
    {},
    async () => {
      const data = await client.query<{ modelDefinitions: unknown[] }>(
        MODEL_DEFINITIONS_QUERY,
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.modelDefinitions, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "get_model",
    "Get a ModelDefinition by id (24-hex ObjectId) or by slug. Returns full definition including fields, statusField, and defaultSort.",
    {
      idOrSlug: z.string().describe("Model id (ObjectId) or slug"),
    },
    async ({ idOrSlug }) => {
      if (OBJECT_ID_RE.test(idOrSlug)) {
        const data = await client.query<{ modelDefinition: unknown | null }>(
          MODEL_DEFINITION_BY_ID_QUERY,
          { id: idOrSlug },
        );
        if (data.modelDefinition) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(data.modelDefinition, null, 2),
              },
            ],
          };
        }
      }

      // Fallback: resolve slug → id via a lightweight list (id + slug only),
      // then fetch the full definition for that single model. Avoids
      // pulling every model's fields when only one is needed.
      const index = await client.query<{
        modelDefinitions: Array<{ id: string; slug: string }>;
      }>(MODEL_DEFINITIONS_BY_SLUG_INDEX_QUERY);
      const match = index.modelDefinitions.find((m) => m.slug === idOrSlug);
      if (!match) {
        return {
          content: [
            { type: "text" as const, text: `Model '${idOrSlug}' not found` },
          ],
          isError: true,
        };
      }
      const full = await client.query<{ modelDefinition: unknown | null }>(
        MODEL_DEFINITION_BY_ID_QUERY,
        { id: match.id },
      );
      if (!full.modelDefinition) {
        return {
          content: [
            { type: "text" as const, text: `Model '${idOrSlug}' not found` },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(full.modelDefinition, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "create_model",
    "Create a new Custom Data Model (ModelDefinition). Returns a minimal ack by default; pass response='full' for the full model.",
    {
      name: z.string().describe("Display name"),
      slug: z
        .string()
        .trim()
        .regex(SLUG_RE, SLUG_MSG)
        .describe("URL-safe slug, lowercase (regex: ^[a-z][a-z0-9-]*$)"),
      description: z.string().optional(),
      icon: z
        .string()
        .optional()
        .describe("Lucide icon name, defaults to 'database'"),
      color: z.string().optional(),
      displayField: z
        .string()
        .optional()
        .describe("Field key used as the record's display label in UI"),
      defaultSort: z.preprocess(jsonPreprocess, defaultSortSchema).optional(),
      fields: z
        .preprocess(jsonPreprocess, z.array(propertyFieldSchema))
        .optional()
        .describe("Field definitions. Validates record data on write."),
      statusField: z
        .preprocess(jsonPreprocess, statusFieldSchema)
        .optional()
        .describe("Enable record lifecycle states with allowed transitions"),
      response: responseModeSchema,
    },
    async ({
      name,
      slug,
      description,
      icon,
      color,
      displayField,
      defaultSort,
      fields,
      statusField,
      response,
    }) => {
      const input: Record<string, unknown> = { name, slug };
      if (description !== undefined) input.description = description;
      if (icon !== undefined) input.icon = icon;
      if (color !== undefined) input.color = color;
      if (displayField !== undefined) input.displayField = displayField;
      if (defaultSort !== undefined) input.defaultSort = defaultSort;
      if (fields !== undefined) input.fields = fields;
      if (statusField !== undefined) input.statusField = statusField;

      const data = await client.query<{
        createModelDefinition: {
          id: string;
          slug?: string | null;
          updatedAt?: string | null;
        };
      }>(CREATE_MODEL_DEFINITION_MUTATION, { input });
      return jsonText(response, data.createModelDefinition, modelMinimal);
    },
  );

  server.tool(
    "update_model",
    "Update any field of an existing ModelDefinition. Changing 'fields' migrates the schema - existing records are re-validated on next write. Returns a minimal ack by default; pass response='full' for the full model.",
    {
      id: z.string().describe("Model id (ObjectId) to update"),
      name: z.string().optional(),
      slug: z.string().trim().regex(SLUG_RE, SLUG_MSG).optional(),
      description: z.string().optional(),
      icon: z.string().optional(),
      color: z.string().optional(),
      displayField: z.string().optional(),
      defaultSort: z.preprocess(jsonPreprocess, defaultSortSchema).optional(),
      fields: z
        .preprocess(jsonPreprocess, z.array(propertyFieldSchema))
        .optional(),
      statusField: z.preprocess(jsonPreprocess, statusFieldSchema).optional(),
      response: responseModeSchema,
    },
    async (args) => {
      const input: Record<string, unknown> = { id: args.id };
      for (const key of [
        "name",
        "slug",
        "description",
        "icon",
        "color",
        "displayField",
        "defaultSort",
        "fields",
        "statusField",
      ] as const) {
        if (args[key] !== undefined) input[key] = args[key];
      }

      const data = await client.query<{
        updateModelDefinition: {
          id: string;
          slug?: string | null;
          updatedAt?: string | null;
        } | null;
      }>(UPDATE_MODEL_DEFINITION_MUTATION, { input });
      if (!data.updateModelDefinition) {
        return {
          content: [{ type: "text" as const, text: "Model not found" }],
          isError: true,
        };
      }
      return jsonText(args.response, data.updateModelDefinition, modelMinimal);
    },
  );

  server.tool(
    "delete_model",
    "Delete a ModelDefinition. WARNING: cascades - ALL records of this model are deleted.",
    {
      id: z.string().describe("Model id (ObjectId) to delete"),
    },
    async ({ id }) => {
      const data = await client.query<{ deleteModelDefinition: boolean }>(
        DELETE_MODEL_DEFINITION_MUTATION,
        { id },
      );
      return {
        content: [
          {
            type: "text" as const,
            text: data.deleteModelDefinition
              ? "Model deleted (records cascaded)"
              : "Failed to delete model",
          },
        ],
        isError: !data.deleteModelDefinition,
      };
    },
  );

  server.tool(
    "list_records",
    "List records of a model with filter, sort, and pagination. Filter is a MongoDB-style plain object. Sort is a string (e.g. '-createdAt' for desc). Populate loads relations by field key.",
    {
      modelId: z.string().describe("Target model id (ObjectId)"),
      filter: z
        .preprocess(jsonPreprocess, z.record(z.string(), z.unknown()))
        .optional()
        .describe("Plain object filter, e.g. {status: 'active'}"),
      limit: z.number().int().optional().default(50),
      offset: z.number().int().optional().default(0),
      sort: z
        .string()
        .optional()
        .describe("Sort expression, e.g. 'createdAt' or '-updatedAt'"),
      populate: z
        .array(z.string())
        .optional()
        .describe("Field keys of type=relation to populate"),
    },
    async ({ modelId, filter, limit, offset, sort, populate }) => {
      const data = await client.query<{
        modelRecords: { items: unknown[]; total: number; hasMore: boolean };
      }>(MODEL_RECORDS_QUERY, {
        modelId,
        filter,
        limit,
        offset,
        sort,
        populate,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.modelRecords, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "get_record",
    "Get a single record by id.",
    {
      id: z.string().describe("Record id (ObjectId)"),
    },
    async ({ id }) => {
      const data = await client.query<{ modelRecord: unknown | null }>(
        MODEL_RECORD_BY_ID_QUERY,
        { id },
      );
      if (!data.modelRecord) {
        return {
          content: [{ type: "text" as const, text: "Record not found" }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.modelRecord, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "create_record",
    "Create a new record in a model. Data keys must match field keys of the model; backend validates against the ModelDefinition. Returns a minimal ack by default; pass response='full' for the full record.",
    {
      modelId: z.string().describe("Target model id (ObjectId)"),
      data: z
        .preprocess(jsonPreprocess, z.record(z.string(), z.unknown()))
        .describe("Record data keyed by model field keys"),
      response: responseModeSchema,
    },
    async ({ modelId, data: recordData, response }) => {
      const result = await client.query<{
        createModelRecord: {
          id: string;
          status?: string | null;
          updatedAt?: string | null;
        };
      }>(CREATE_MODEL_RECORD_MUTATION, {
        input: { modelId, data: recordData },
      });
      return jsonText(response, result.createModelRecord, recordMinimal);
    },
  );

  server.tool(
    "update_record",
    "Update a record. Pass 'data' for a full data replace. Pass 'status' to transition the record's status (validated against statusField.transitions). At least one of data/status is required. Returns a minimal ack by default; pass response='full' for the full record.",
    {
      id: z.string().describe("Record id (ObjectId)"),
      data: z
        .preprocess(jsonPreprocess, z.record(z.string(), z.unknown()))
        .optional()
        .describe("New data (full replace)"),
      status: z
        .string()
        .optional()
        .describe("New status value (must be allowed by model.statusField)"),
      response: responseModeSchema,
    },
    async ({ id, data: recordData, status, response }) => {
      if (recordData === undefined && status === undefined) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Provide 'data' and/or 'status' to update",
            },
          ],
          isError: true,
        };
      }

      type RecordResult = {
        id: string;
        status?: string | null;
        updatedAt?: string | null;
      };
      let dataResult: RecordResult | null = null;
      let statusResult: RecordResult | null = null;

      if (recordData !== undefined) {
        const res = await client.query<{
          updateModelRecord: RecordResult | null;
        }>(UPDATE_MODEL_RECORD_MUTATION, {
          input: { id, data: recordData },
        });
        dataResult = res.updateModelRecord;
        if (!dataResult) {
          return {
            content: [{ type: "text" as const, text: "Record not found" }],
            isError: true,
          };
        }
      }

      if (status !== undefined) {
        // Data update (if any) already committed. Wrap status call so a
        // failed transition reports partial-success clearly instead of
        // hiding the completed data write behind a bare throw.
        try {
          const res = await client.query<{
            updateModelRecordStatus: RecordResult | null;
          }>(UPDATE_MODEL_RECORD_STATUS_MUTATION, {
            input: { id, status },
          });
          statusResult = res.updateModelRecordStatus;
          if (!statusResult) {
            if (dataResult) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(
                      {
                        partialSuccess: true,
                        message:
                          "Data updated, but record not found when applying status.",
                        dataResult,
                      },
                      null,
                      2,
                    ),
                  },
                ],
                isError: true,
              };
            }
            return {
              content: [{ type: "text" as const, text: "Record not found" }],
              isError: true,
            };
          }
        } catch (error) {
          if (dataResult) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      partialSuccess: true,
                      message:
                        "Data updated, but status transition failed. Retry status only.",
                      dataResult,
                      statusError:
                        error instanceof Error ? error.message : String(error),
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }
          throw error;
        }
      }

      const finalResult = (statusResult ?? dataResult) as RecordResult;
      return jsonText(response, finalResult, recordMinimal);
    },
  );

  server.tool(
    "delete_record",
    "Delete a record permanently.",
    {
      id: z.string().describe("Record id (ObjectId) to delete"),
    },
    async ({ id }) => {
      const data = await client.query<{ deleteModelRecord: boolean }>(
        DELETE_MODEL_RECORD_MUTATION,
        { id },
      );
      return {
        content: [
          {
            type: "text" as const,
            text: data.deleteModelRecord
              ? "Record deleted"
              : "Failed to delete record",
          },
        ],
        isError: !data.deleteModelRecord,
      };
    },
  );

  server.tool(
    "import_records",
    "Bulk import records into a model. Accepts up to 1000 rows as plain objects. Returns { importedCount, errors[{row, message}] } - same shape as CSV/XLSX import.",
    {
      modelId: z.string().describe("Target model id (ObjectId)"),
      rows: z
        .preprocess(
          jsonPreprocess,
          z
            .array(z.record(z.string(), z.unknown()))
            .min(1, "Provide at least 1 row")
            .max(1000, "Maximum 1000 rows per import"),
        )
        .describe("Array of plain objects keyed by model field keys"),
    },
    async ({ modelId, rows }) => {
      const data = await client.query<{
        importModelRecords: {
          importedCount: number;
          errors: Array<{ row: number; message: string }>;
        };
      }>(IMPORT_MODEL_RECORDS_MUTATION, { input: { modelId, rows } });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.importModelRecords, null, 2),
          },
        ],
      };
    },
  );

  // ─── Commerce: Orders ────────────────────────────────────────
  //
  // workspaceId is required by every commerce resolver and cross-checked
  // against the token's workspace context, so it always comes from the
  // client (the same value sent in the x-workspace-id header) - it is not
  // a caller-supplied arg. All money fields are integer minor units (cents).

  const PAYMENT_STATUS = [
    "unpaid",
    "partially_paid",
    "authorized",
    "paid",
    "partially_refunded",
    "refunded",
  ] as const;
  const FULFILLMENT_STATUS = [
    "unfulfilled",
    "partially_fulfilled",
    "fulfilled",
    "returned",
  ] as const;
  const CART_STATUS = [
    "active",
    "saved",
    "quote_requested",
    "merged",
    "expired",
    "abandoned",
    "ordered",
  ] as const;
  const DISCOUNT_TYPE = ["percentage", "fixed", "free_shipping"] as const;

  type OrderResult = {
    id: string;
    orderNumber?: number | null;
    status?: string | null;
    paymentStatus?: string | null;
    fulfillmentStatus?: string | null;
    total?: number | null;
    balanceDue?: number | null;
    currency?: string | null;
    updatedAt?: string | null;
  };
  type DiscountResult = {
    id: string;
    code?: string | null;
    type?: string | null;
    value?: number | null;
    enabled?: boolean | null;
    updatedAt?: string | null;
  };

  const orderItemSchema = z.object({
    recordId: z
      .string()
      .optional()
      .describe("Product record id (ObjectId) the line refers to"),
    quantity: z.number().int().positive(),
    variantSelections: z
      .preprocess(jsonPreprocess, z.record(z.string(), z.unknown()))
      .optional()
      .describe("Selected variant options, e.g. {size: 'M', color: 'red'}"),
    name: z.string().optional().describe("Custom line name (ad-hoc item)"),
    price: z
      .number()
      .int()
      .optional()
      .describe("Custom unit price in minor units (ad-hoc item)"),
  });

  server.tool(
    "list_orders",
    "List orders with optional filters and pagination. Money fields are integer minor units (cents). Pass pipelineStageId='__unassigned__' to list orders with no pipeline stage.",
    {
      paymentStatus: z.enum(PAYMENT_STATUS).optional(),
      fulfillmentStatus: z.enum(FULFILLMENT_STATUS).optional(),
      customerId: z.string().optional(),
      search: z.string().optional(),
      pipelineStageId: z.string().optional(),
      dateFrom: z
        .string()
        .optional()
        .describe("ISO date-time lower bound (inclusive)"),
      dateTo: z
        .string()
        .optional()
        .describe("ISO date-time upper bound (inclusive)"),
      skip: z.number().int().optional().default(0),
      limit: z.number().int().optional().default(20),
    },
    async (args) => {
      const data = await client.query<{
        orders: { items: unknown[]; total: number; hasMore: boolean };
      }>(ORDERS_QUERY, { workspaceId: client.workspaceId, ...args });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(data.orders, null, 2) },
        ],
      };
    },
  );

  server.tool(
    "get_order",
    "Get a single order by id, including items, payments, and tax summary.",
    {
      id: z.string().describe("Order id"),
    },
    async ({ id }) => {
      const data = await client.query<{ order: unknown | null }>(
        ORDER_BY_ID_QUERY,
        { workspaceId: client.workspaceId, id },
      );
      if (!data.order) {
        return {
          content: [{ type: "text" as const, text: "Order not found" }],
          isError: true,
        };
      }
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(data.order, null, 2) },
        ],
      };
    },
  );

  server.tool(
    "get_order_pipeline",
    "Get the workspace order pipeline (the configurable stages orders move through).",
    {},
    async () => {
      const data = await client.query<{ orderPipeline: unknown }>(
        ORDER_PIPELINE_QUERY,
        { workspaceId: client.workspaceId },
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.orderPipeline, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "create_manual_order",
    "Create a manual (admin-entered) order. Each item references a product recordId or is an ad-hoc line with name+price (minor units). Returns a minimal ack by default; pass response='full' for the full order.",
    {
      customerEmail: z.string().describe("Customer email for the order"),
      customerId: z.string().optional(),
      items: z.array(orderItemSchema).min(1, "Provide at least 1 item"),
      response: responseModeSchema,
    },
    async ({ customerEmail, customerId, items, response }) => {
      const result = await client.query<{ createManualOrder: OrderResult }>(
        CREATE_MANUAL_ORDER_MUTATION,
        {
          input: {
            workspaceId: client.workspaceId,
            customerEmail,
            customerId,
            items,
          },
        },
      );
      return jsonText(response, result.createManualOrder, orderMinimal);
    },
  );

  server.tool(
    "edit_order",
    "Replace an order's line items (full replace of the items array). Recomputes totals. Returns a minimal ack by default; pass response='full' for the full order.",
    {
      orderId: z.string(),
      items: z.array(orderItemSchema).min(1, "Provide at least 1 item"),
      response: responseModeSchema,
    },
    async ({ orderId, items, response }) => {
      const result = await client.query<{ editOrder: OrderResult }>(
        EDIT_ORDER_MUTATION,
        { input: { workspaceId: client.workspaceId, orderId, items } },
      );
      return jsonText(response, result.editOrder, orderMinimal);
    },
  );

  server.tool(
    "update_order_details",
    "Update order metadata: customer email, internal notes, and shipment tracking. Only provided fields change.",
    {
      orderId: z.string(),
      customerEmail: z.string().optional(),
      notes: z.string().optional(),
      trackingNumber: z.string().optional(),
      trackingCarrier: z.string().optional(),
      response: responseModeSchema,
    },
    async ({ orderId, response, ...fields }) => {
      if (Object.keys(fields).length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Provide at least one field to update",
            },
          ],
          isError: true,
        };
      }
      const result = await client.query<{ updateOrderDetails: OrderResult }>(
        UPDATE_ORDER_DETAILS_MUTATION,
        { input: { workspaceId: client.workspaceId, orderId, ...fields } },
      );
      return jsonText(response, result.updateOrderDetails, orderMinimal);
    },
  );

  server.tool(
    "mark_order_paid",
    "Record a full payment for an order (does NOT verify with a payment provider - admin/manual reconciliation). amount is in minor units.",
    {
      orderId: z.string(),
      amount: z.number().int().describe("Amount in minor units (cents)"),
      reference: z.string().describe("Payment reference / receipt id"),
      provider: z.string().describe("Payment provider label, e.g. 'manual'"),
      response: responseModeSchema,
    },
    async ({ orderId, amount, reference, provider, response }) => {
      const result = await client.query<{ markOrderPaid: OrderResult }>(
        MARK_ORDER_PAID_MUTATION,
        {
          input: {
            workspaceId: client.workspaceId,
            orderId,
            amount,
            reference,
            provider,
          },
        },
      );
      return jsonText(response, result.markOrderPaid, orderMinimal);
    },
  );

  server.tool(
    "record_order_payment",
    "Record a (possibly partial) payment against an order's outstanding balance. amount is in minor units and capped at the balance due.",
    {
      orderId: z.string(),
      amount: z.number().int().describe("Amount in minor units (cents)"),
      reference: z.string().describe("Payment reference / receipt id"),
      provider: z.string().optional(),
      response: responseModeSchema,
    },
    async ({ orderId, amount, reference, provider, response }) => {
      const result = await client.query<{ recordOrderPayment: OrderResult }>(
        RECORD_ORDER_PAYMENT_MUTATION,
        {
          input: {
            workspaceId: client.workspaceId,
            orderId,
            amount,
            reference,
            provider,
          },
        },
      );
      return jsonText(response, result.recordOrderPayment, orderMinimal);
    },
  );

  server.tool(
    "refund_order",
    "Refund an order. Omit amount for a full refund; pass amount (minor units) for a partial refund.",
    {
      orderId: z.string(),
      reference: z.string().describe("Refund reference / receipt id"),
      amount: z
        .number()
        .int()
        .optional()
        .describe("Partial refund amount in minor units; omit for full refund"),
      response: responseModeSchema,
    },
    async ({ orderId, reference, amount, response }) => {
      const result = await client.query<{ refundOrder: OrderResult }>(
        REFUND_ORDER_MUTATION,
        {
          input: {
            workspaceId: client.workspaceId,
            orderId,
            reference,
            amount,
          },
        },
      );
      return jsonText(response, result.refundOrder, orderMinimal);
    },
  );

  server.tool(
    "cancel_order",
    "Cancel an order.",
    {
      orderId: z.string(),
      response: responseModeSchema,
    },
    async ({ orderId, response }) => {
      const result = await client.query<{ cancelOrder: OrderResult }>(
        CANCEL_ORDER_MUTATION,
        { input: { workspaceId: client.workspaceId, orderId } },
      );
      return jsonText(response, result.cancelOrder, orderMinimal);
    },
  );

  server.tool(
    "transition_order_fulfillment",
    "Move an order to a new fulfillment status. Optionally attach tracking when marking fulfilled.",
    {
      orderId: z.string(),
      status: z.enum(FULFILLMENT_STATUS),
      trackingNumber: z.string().optional(),
      trackingCarrier: z.string().optional(),
      response: responseModeSchema,
    },
    async ({ orderId, status, trackingNumber, trackingCarrier, response }) => {
      const result = await client.query<{
        transitionOrderFulfillment: OrderResult;
      }>(TRANSITION_ORDER_FULFILLMENT_MUTATION, {
        input: {
          workspaceId: client.workspaceId,
          orderId,
          status,
          trackingNumber,
          trackingCarrier,
        },
      });
      return jsonText(
        response,
        result.transitionOrderFulfillment,
        orderMinimal,
      );
    },
  );

  server.tool(
    "set_order_pipeline_stage",
    "Move an order to a pipeline stage (use get_order_pipeline for valid stage ids).",
    {
      orderId: z.string(),
      stageId: z.string(),
      response: responseModeSchema,
    },
    async ({ orderId, stageId, response }) => {
      const result = await client.query<{ setOrderPipelineStage: OrderResult }>(
        SET_ORDER_PIPELINE_STAGE_MUTATION,
        { input: { workspaceId: client.workspaceId, orderId, stageId } },
      );
      return jsonText(response, result.setOrderPipelineStage, orderMinimal);
    },
  );

  server.tool(
    "record_order_invoice",
    "Attach an invoice (number, optional URL and provider) to an order.",
    {
      orderId: z.string(),
      number: z.string().describe("Invoice number"),
      url: z.string().optional(),
      provider: z.string().optional(),
      response: responseModeSchema,
    },
    async ({ orderId, number, url, provider, response }) => {
      const result = await client.query<{ recordOrderInvoice: OrderResult }>(
        RECORD_ORDER_INVOICE_MUTATION,
        {
          input: {
            workspaceId: client.workspaceId,
            orderId,
            number,
            url,
            provider,
          },
        },
      );
      return jsonText(response, result.recordOrderInvoice, orderMinimal);
    },
  );

  // ─── Commerce: Carts ─────────────────────────────────────────

  server.tool(
    "list_carts",
    "List shopping carts (admin view) with optional status filter and pagination. totalValue is in minor units.",
    {
      status: z.enum(CART_STATUS).optional(),
      skip: z.number().int().optional().default(0),
      limit: z.number().int().optional().default(20),
    },
    async (args) => {
      const data = await client.query<{
        adminCarts: { items: unknown[]; total: number; hasMore: boolean };
      }>(ADMIN_CARTS_QUERY, { workspaceId: client.workspaceId, ...args });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.adminCarts, null, 2),
          },
        ],
      };
    },
  );

  // ─── Commerce: Discounts ─────────────────────────────────────

  server.tool(
    "list_discounts",
    "List discount codes with optional filters and pagination.",
    {
      enabled: z.boolean().optional(),
      type: z.enum(DISCOUNT_TYPE).optional(),
      search: z.string().optional().describe("Substring match on code"),
      limit: z.number().int().optional().default(25),
      offset: z.number().int().optional().default(0),
    },
    async (args) => {
      const data = await client.query<{
        discounts: { items: unknown[]; total: number; hasMore: boolean };
      }>(DISCOUNTS_QUERY, { workspaceId: client.workspaceId, ...args });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.discounts, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "get_discount",
    "Get a single discount by id.",
    {
      id: z.string(),
    },
    async ({ id }) => {
      const data = await client.query<{ discount: unknown | null }>(
        DISCOUNT_BY_ID_QUERY,
        { workspaceId: client.workspaceId, id },
      );
      if (!data.discount) {
        return {
          content: [{ type: "text" as const, text: "Discount not found" }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.discount, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "create_discount",
    "Create a discount code. For type='fixed', value and currency are required (value in minor units). For 'percentage', value is the percent and currency must be omitted. minSubtotal is in minor units. Dates are ISO date-time strings.",
    {
      code: z.string(),
      type: z.enum(DISCOUNT_TYPE),
      value: z
        .number()
        .describe("Percent for 'percentage'; minor units for 'fixed'"),
      currency: z
        .string()
        .optional()
        .describe("Required for 'fixed'; omit otherwise"),
      minSubtotal: z
        .number()
        .optional()
        .describe("Minimum order subtotal in minor units"),
      maxUses: z.number().int().optional(),
      maxUsesPerUser: z.number().int().optional(),
      startsAt: z.string().optional().describe("ISO date-time"),
      endsAt: z.string().optional().describe("ISO date-time"),
      enabled: z.boolean(),
      response: responseModeSchema,
    },
    async ({ response, ...input }) => {
      const result = await client.query<{ createDiscount: DiscountResult }>(
        CREATE_DISCOUNT_MUTATION,
        { workspaceId: client.workspaceId, input },
      );
      return jsonText(response, result.createDiscount, discountMinimal);
    },
  );

  server.tool(
    "update_discount",
    "Update a discount (partial - only provided fields change). code/type/currency become immutable once the discount has been used at least once.",
    {
      id: z.string(),
      code: z.string().optional(),
      type: z.enum(DISCOUNT_TYPE).optional(),
      value: z.number().optional(),
      currency: z.string().optional(),
      minSubtotal: z.number().optional(),
      maxUses: z.number().int().optional(),
      maxUsesPerUser: z.number().int().optional(),
      startsAt: z.string().optional().describe("ISO date-time"),
      endsAt: z.string().optional().describe("ISO date-time"),
      enabled: z.boolean().optional(),
      response: responseModeSchema,
    },
    async ({ id, response, ...input }) => {
      if (Object.keys(input).length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Provide at least one field to update",
            },
          ],
          isError: true,
        };
      }
      const result = await client.query<{ updateDiscount: DiscountResult }>(
        UPDATE_DISCOUNT_MUTATION,
        { workspaceId: client.workspaceId, id, input },
      );
      return jsonText(response, result.updateDiscount, discountMinimal);
    },
  );

  server.tool(
    "set_discount_enabled",
    "Enable or disable a discount code.",
    {
      id: z.string(),
      enabled: z.boolean(),
      response: responseModeSchema,
    },
    async ({ id, enabled, response }) => {
      const result = await client.query<{ setDiscountEnabled: DiscountResult }>(
        SET_DISCOUNT_ENABLED_MUTATION,
        { workspaceId: client.workspaceId, id, enabled },
      );
      return jsonText(response, result.setDiscountEnabled, discountMinimal);
    },
  );

  // ─── Commerce: Products (catalog over model records) ─────────
  //
  // Products are stored as records of a Custom Data Model. These tools add
  // product-aware reads/writes (stock + variants) on top of the generic
  // record tools. Money fields are integer minor units (cents).

  const productFilterSchema = z.object({
    search: z.string().optional(),
    status: z.string().optional(),
    stockState: z
      .enum(["in", "low", "out"])
      .optional()
      .describe("in stock / low stock / out of stock"),
    priceMin: z.number().optional(),
    priceMax: z.number().optional(),
    hasVariants: z.boolean().optional(),
  });

  server.tool(
    "list_products",
    "List a product model's catalog with stock and variant info. modelId is the Custom Data Model holding the products. Returns CatalogItem rows (onHand/reserved/available + per-variant stock) plus the workspace lowStockThreshold.",
    {
      modelId: z.string().describe("Product model id (ObjectId)"),
      filter: productFilterSchema.optional(),
      limit: z.number().int().optional().default(50),
      offset: z.number().int().optional().default(0),
      sort: z
        .string()
        .optional()
        .describe("Sort expression, e.g. 'createdAt' or '-updatedAt'"),
    },
    async ({ modelId, filter, limit, offset, sort }) => {
      const data = await client.query<{ productCatalog: unknown }>(
        PRODUCT_CATALOG_QUERY,
        { modelId, filter, limit, offset, sort },
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.productCatalog, null, 2),
          },
        ],
      };
    },
  );

  // Selection model shared by the bulk product mutations: target an explicit
  // list of ids, OR everything matching a filter (allMatching=true). One of
  // the two is required by the backend.
  const productSelectionSchema = z
    .object({
      ids: z
        .array(z.string())
        .optional()
        .describe("Explicit record ids to target"),
      allMatching: z
        .boolean()
        .optional()
        .describe("Target every record matching filter (ignores ids)"),
      filter: productFilterSchema.optional(),
    })
    .describe("Provide non-empty 'ids' OR 'allMatching: true'");

  server.tool(
    "bulk_update_products",
    "Bulk-update selected product records with a single patch applied uniformly (status, set/adjust stock, set/adjust price). Stock fields are units; price fields are minor units. Returns the number of records updated.",
    {
      modelId: z.string().describe("Product model id (ObjectId)"),
      selection: productSelectionSchema,
      patch: z
        .object({
          status: z.string().optional(),
          setStock: z.number().int().optional().describe("Set absolute stock"),
          adjustStock: z
            .number()
            .int()
            .optional()
            .describe("Delta to stock (+/-)"),
          setPrice: z
            .number()
            .optional()
            .describe("Set absolute price (minor units)"),
          adjustPrice: z
            .number()
            .optional()
            .describe("Delta to price (minor units, +/-)"),
        })
        .describe("Single patch applied to every selected record"),
    },
    async ({ modelId, selection, patch }) => {
      const data = await client.query<{ bulkUpdateProductRecords: number }>(
        BULK_UPDATE_PRODUCT_RECORDS_MUTATION,
        { modelId, selection, patch },
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ updated: data.bulkUpdateProductRecords }),
          },
        ],
      };
    },
  );

  server.tool(
    "bulk_delete_products",
    "Bulk-delete selected product records permanently. Returns the number of records deleted.",
    {
      modelId: z.string().describe("Product model id (ObjectId)"),
      selection: productSelectionSchema,
    },
    async ({ modelId, selection }) => {
      const data = await client.query<{ bulkDeleteProductRecords: number }>(
        BULK_DELETE_PRODUCT_RECORDS_MUTATION,
        { modelId, selection },
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ deleted: data.bulkDeleteProductRecords }),
          },
        ],
      };
    },
  );

  // ─── Webhooks ────────────────────────────────────────────────
  //
  // Outbound event webhooks. Like commerce, workspaceId is required by every
  // resolver and sourced from the client. createWebhookEndpoint and
  // rotateWebhookSecret return the signing secret ONCE - it is surfaced in
  // full and cannot be retrieved again.

  server.tool(
    "list_webhooks",
    "List the workspace's webhook endpoints (signing secrets are never returned here).",
    {},
    async () => {
      const data = await client.query<{ webhookEndpoints: unknown[] }>(
        WEBHOOK_ENDPOINTS_QUERY,
        { workspaceId: client.workspaceId },
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.webhookEndpoints, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "list_webhook_deliveries",
    "List recent webhook delivery attempts (status: pending/success/failed) for debugging.",
    {
      limit: z.number().int().optional().default(50),
    },
    async ({ limit }) => {
      const data = await client.query<{ webhookDeliveries: unknown[] }>(
        WEBHOOK_DELIVERIES_QUERY,
        { workspaceId: client.workspaceId, limit },
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.webhookDeliveries, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "list_webhook_event_types",
    "List the event types a webhook can subscribe to (the authoritative allowlist).",
    {},
    async () => {
      const data = await client.query<{ webhookEventTypes: string[] }>(
        WEBHOOK_EVENT_TYPES_QUERY,
        { workspaceId: client.workspaceId },
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.webhookEventTypes, null, 2),
          },
        ],
      };
    },
  );

  // The backend validates events against its allowlist; list_webhook_event_types
  // is authoritative. These are the known values at time of writing.
  const WEBHOOK_EVENTS_HINT =
    "Event names, e.g. order.created, order.paid, order.refunded, order.canceled, order.fulfilled, order.returned, order.edited, order.pipeline_changed. Use list_webhook_event_types for the authoritative list.";

  server.tool(
    "create_webhook",
    "Create a webhook endpoint subscribed to one or more events. The URL must be a public https endpoint. Returns the endpoint AND its signing secret - the secret is shown only once.",
    {
      url: z.string().describe("Public https endpoint URL"),
      events: z
        .array(z.string())
        .min(1, "Subscribe to at least 1 event")
        .describe(WEBHOOK_EVENTS_HINT),
      description: z.string().optional(),
    },
    async ({ url, events, description }) => {
      const data = await client.query<{ createWebhookEndpoint: unknown }>(
        CREATE_WEBHOOK_ENDPOINT_MUTATION,
        {
          input: { workspaceId: client.workspaceId, url, events, description },
        },
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.createWebhookEndpoint, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "update_webhook",
    "Update a webhook endpoint (partial - only provided fields change). Pass enabled to enable/disable. Pass description=null to clear it. The signing secret is not returned.",
    {
      id: z.string(),
      url: z.string().optional(),
      events: z
        .array(z.string())
        .min(1)
        .optional()
        .describe(WEBHOOK_EVENTS_HINT),
      enabled: z.boolean().optional(),
      description: z
        .string()
        .nullable()
        .optional()
        .describe("New description; null clears it"),
    },
    async ({ id, ...fields }) => {
      if (Object.keys(fields).length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Provide at least one field to update",
            },
          ],
          isError: true,
        };
      }
      const data = await client.query<{ updateWebhookEndpoint: unknown }>(
        UPDATE_WEBHOOK_ENDPOINT_MUTATION,
        { input: { workspaceId: client.workspaceId, id, ...fields } },
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.updateWebhookEndpoint, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "rotate_webhook_secret",
    "Rotate a webhook endpoint's signing secret. Returns the endpoint and the NEW secret - shown only once.",
    {
      id: z.string(),
    },
    async ({ id }) => {
      const data = await client.query<{ rotateWebhookSecret: unknown }>(
        ROTATE_WEBHOOK_SECRET_MUTATION,
        { workspaceId: client.workspaceId, id },
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.rotateWebhookSecret, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "delete_webhook",
    "Delete a webhook endpoint permanently.",
    {
      id: z.string(),
    },
    async ({ id }) => {
      const data = await client.query<{ deleteWebhookEndpoint: boolean }>(
        DELETE_WEBHOOK_ENDPOINT_MUTATION,
        { workspaceId: client.workspaceId, id },
      );
      return {
        content: [
          {
            type: "text" as const,
            text: data.deleteWebhookEndpoint
              ? "Webhook deleted"
              : "Failed to delete webhook",
          },
        ],
        isError: !data.deleteWebhookEndpoint,
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
