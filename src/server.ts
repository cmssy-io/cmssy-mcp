import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CmssyClient } from "./graphql-client.js";
import {
  listPagesTool,
  getPageTool,
  getSiteConfigTool,
  getWorkspaceInfoTool,
  listMediaTool,
  createPageTool,
  updatePageBlocksTool,
  updatePageSettingsTool,
  listPageTypesTool,
  createPageTypeTool,
  publishPageTool,
  unpublishPageTool,
  revertToPublishedTool,
  deletePageTool,
  updatePageLayoutTool,
  addBlockToPageTool,
  updateBlockContentTool,
  patchBlockContentTool,
  removeBlockFromPageTool,
  listFormsTool,
  getFormTool,
  createFormTool,
  updateFormTool,
  deleteFormTool,
  listFormSubmissionsTool,
  getFormSubmissionTool,
  updateFormSubmissionStatusTool,
  deleteFormSubmissionTool,
  listModelsTool,
  getModelTool,
  createModelTool,
  updateModelTool,
  deleteModelTool,
  listRecordsTool,
  getRecordTool,
  createRecordTool,
  updateRecordTool,
  deleteRecordTool,
  importRecordsTool,
  listOrdersTool,
  getOrderTool,
  getOrderPipelineTool,
  createManualOrderTool,
  editOrderTool,
  updateOrderDetailsTool,
  markOrderPaidTool,
  recordOrderPaymentTool,
  refundOrderTool,
  cancelOrderTool,
  transitionOrderFulfillmentTool,
  setOrderPipelineStageTool,
  recordOrderInvoiceTool,
  listCartsTool,
  listDiscountsTool,
  getDiscountTool,
  createDiscountTool,
  updateDiscountTool,
  setDiscountEnabledTool,
  listProductsTool,
  bulkUpdateProductsTool,
  bulkDeleteProductsTool,
  listWebhooksTool,
  listWebhookDeliveriesTool,
  listWebhookEventTypesTool,
  createWebhookTool,
  updateWebhookTool,
  rotateWebhookSecretTool,
  deleteWebhookTool,
  listMembersTool,
  listRolesTool,
} from "@cmssy/ai-tools";
import { createMcpWorkspaceOps } from "./ai-tools-ops.js";
import { bindSharedTool } from "./ai-tools-binder.js";
import {
  PAGES_QUERY,
  SITE_CONFIG_QUERY,
  CURRENT_WORKSPACE_QUERY,
} from "./queries.js";
import type { Page, SiteConfig, Workspace } from "./types.js";

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

export function createServer(client: CmssyClient) {
  const server = new McpServer({
    name: "cmssy",
    version: PACKAGE_VERSION,
  });

  const sharedOps = createMcpWorkspaceOps(client);

  // ─── Read Tools ──────────────────────────────────────────────

  bindSharedTool(server, listPagesTool, sharedOps);
  bindSharedTool(server, getPageTool, sharedOps);
  bindSharedTool(server, getSiteConfigTool, sharedOps);
  bindSharedTool(server, getWorkspaceInfoTool, sharedOps);
  bindSharedTool(server, listMediaTool, sharedOps);
  bindSharedTool(server, listMembersTool, sharedOps);
  bindSharedTool(server, listRolesTool, sharedOps);

  // ─── Write Tools ─────────────────────────────────────────────

  bindSharedTool(server, createPageTool, sharedOps);
  bindSharedTool(server, updatePageBlocksTool, sharedOps);
  bindSharedTool(server, updatePageSettingsTool, sharedOps);
  bindSharedTool(server, listPageTypesTool, sharedOps);
  bindSharedTool(server, createPageTypeTool, sharedOps);
  bindSharedTool(server, publishPageTool, sharedOps);
  bindSharedTool(server, unpublishPageTool, sharedOps);
  bindSharedTool(server, revertToPublishedTool, sharedOps);
  bindSharedTool(server, deletePageTool, sharedOps);

  // ─── Layout Tools ──────────────────────────────────────────

  bindSharedTool(server, updatePageLayoutTool, sharedOps);

  // ─── Block Helper Tools (read-modify-write) ─────────────────

  bindSharedTool(server, addBlockToPageTool, sharedOps);
  bindSharedTool(server, updateBlockContentTool, sharedOps);
  bindSharedTool(server, patchBlockContentTool, sharedOps);
  bindSharedTool(server, removeBlockFromPageTool, sharedOps);

  // ─── Form Tools ──────────────────────────────────────────────

  bindSharedTool(server, listFormsTool, sharedOps);
  bindSharedTool(server, getFormTool, sharedOps);
  bindSharedTool(server, createFormTool, sharedOps);
  bindSharedTool(server, updateFormTool, sharedOps);
  bindSharedTool(server, deleteFormTool, sharedOps);
  bindSharedTool(server, listFormSubmissionsTool, sharedOps);
  bindSharedTool(server, getFormSubmissionTool, sharedOps);
  bindSharedTool(server, updateFormSubmissionStatusTool, sharedOps);
  bindSharedTool(server, deleteFormSubmissionTool, sharedOps);

  // ─── Model Tools (Custom Data Models) ────────────────────────

  bindSharedTool(server, listModelsTool, sharedOps);
  bindSharedTool(server, getModelTool, sharedOps);
  bindSharedTool(server, createModelTool, sharedOps);
  bindSharedTool(server, updateModelTool, sharedOps);
  bindSharedTool(server, deleteModelTool, sharedOps);
  bindSharedTool(server, listRecordsTool, sharedOps);
  bindSharedTool(server, getRecordTool, sharedOps);
  bindSharedTool(server, createRecordTool, sharedOps);
  bindSharedTool(server, updateRecordTool, sharedOps);
  bindSharedTool(server, deleteRecordTool, sharedOps);
  bindSharedTool(server, importRecordsTool, sharedOps);

  // ─── Commerce: Orders ────────────────────────────────────────

  bindSharedTool(server, listOrdersTool, sharedOps);
  bindSharedTool(server, getOrderTool, sharedOps);
  bindSharedTool(server, getOrderPipelineTool, sharedOps);
  bindSharedTool(server, createManualOrderTool, sharedOps);
  bindSharedTool(server, editOrderTool, sharedOps);
  bindSharedTool(server, updateOrderDetailsTool, sharedOps);
  bindSharedTool(server, markOrderPaidTool, sharedOps);
  bindSharedTool(server, recordOrderPaymentTool, sharedOps);
  bindSharedTool(server, refundOrderTool, sharedOps);
  bindSharedTool(server, cancelOrderTool, sharedOps);
  bindSharedTool(server, transitionOrderFulfillmentTool, sharedOps);
  bindSharedTool(server, setOrderPipelineStageTool, sharedOps);
  bindSharedTool(server, recordOrderInvoiceTool, sharedOps);

  // ─── Commerce: Carts ─────────────────────────────────────────

  bindSharedTool(server, listCartsTool, sharedOps);

  // ─── Commerce: Discounts ─────────────────────────────────────

  bindSharedTool(server, listDiscountsTool, sharedOps);
  bindSharedTool(server, getDiscountTool, sharedOps);
  bindSharedTool(server, createDiscountTool, sharedOps);
  bindSharedTool(server, updateDiscountTool, sharedOps);
  bindSharedTool(server, setDiscountEnabledTool, sharedOps);

  // ─── Commerce: Products (catalog over model records) ─────────

  bindSharedTool(server, listProductsTool, sharedOps);
  bindSharedTool(server, bulkUpdateProductsTool, sharedOps);
  bindSharedTool(server, bulkDeleteProductsTool, sharedOps);

  // ─── Webhooks ────────────────────────────────────────────────

  bindSharedTool(server, listWebhooksTool, sharedOps);
  bindSharedTool(server, listWebhookDeliveriesTool, sharedOps);
  bindSharedTool(server, listWebhookEventTypesTool, sharedOps);
  bindSharedTool(server, createWebhookTool, sharedOps);
  bindSharedTool(server, updateWebhookTool, sharedOps);
  bindSharedTool(server, rotateWebhookSecretTool, sharedOps);
  bindSharedTool(server, deleteWebhookTool, sharedOps);

  // ─── Resources ───────────────────────────────────────────────

  server.resource(
    "sitemap",
    "cmssy://sitemap",
    {
      description: "Full page tree as JSON — all pages with hierarchy",
      mimeType: "application/json",
    },
    async (uri) => {
      const data = await client.query<{ page: { list: Page[] } }>(PAGES_QUERY);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(data.page.list, null, 2),
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
