import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CmssyApi } from "./graphql-client.js";
import { PACKAGE_VERSION } from "./package-version.js";
import {
  listPagesTool,
  getPageTool,
  getSiteConfigTool,
  listBlockTypesTool,
  listBlockUsageTool,
  getWorkspaceInfoTool,
  listMediaTool,
  uploadMediaTool,
  listMediaFoldersTool,
  createMediaFolderTool,
  updateMediaFolderTool,
  deleteMediaFolderTool,
  moveMediaTool,
  createPageTool,
  updatePageBlocksTool,
  promoteDevDraftTool,
  updatePageSettingsTool,
  listPageTypesTool,
  createPageTypeTool,
  getPageTypeTool,
  updatePageTypeTool,
  deletePageTypeTool,
  publishPageTool,
  unpublishPageTool,
  takeOverPageLockTool,
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
  bulkUpdateRecordsTool,
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
  closeOrderTool,
  createReturnTool,
  approveReturnTool,
  rejectReturnTool,
  cancelReturnTool,
  receiveReturnTool,
  refundReturnTool,
  completeReturnTool,
  updateReturnTrackingTool,
  reopenOrderTool,
  createShipmentTool,
  updateShipmentTool,
  setOrderPipelineStageTool,
  recordOrderInvoiceTool,
  listCartsTool,
  deleteCartsTool,
  listDiscountsTool,
  getDiscountTool,
  createDiscountTool,
  updateDiscountTool,
  setDiscountEnabledTool,
  listProductsTool,
  bulkUpdateProductsTool,
  bulkDeleteProductsTool,
  setProductTiersTool,
  setProductVariantsTool,
  updateCartConfigTool,
  clearCartConfigTool,
  listWebhooksTool,
  listWebhookDeliveriesTool,
  listWebhookEventTypesTool,
  createWebhookTool,
  updateWebhookTool,
  rotateWebhookSecretTool,
  redeliverWebhookDeliveryTool,
  deleteWebhookTool,
  listTeamTool,
  listRolesTool,
  listCustomersTool,
  getCustomerTool,
  suspendCustomerTool,
  unsuspendCustomerTool,
  sendCustomerPasswordResetTool,
  resendCustomerVerificationTool,
  unlockCustomerTool,
  setCustomerCompanyRoleTool,
  listPriceListsTool,
  getPriceListTool,
  createPriceListTool,
  updatePriceListTool,
  deletePriceListTool,
  setPriceListEntryTool,
  setPriceListEntriesTool,
  removePriceListEntriesTool,
  setCustomerPriceListTool,
  setCompanyPriceListTool,
  type AiTool,
} from "@cmssy/ai-tools";
import { createMcpWorkspaceOps } from "./ai-tools-ops.js";
import { bindSharedTool } from "./ai-tools-binder.js";
import { createUpdateRegionSettingsTool } from "./region-settings.js";
import {
  PAGES_QUERY,
  SITE_CONFIG_QUERY,
  CURRENT_WORKSPACE_QUERY,
} from "./queries.js";
import type { PageListEntry, SiteConfig, Workspace } from "./types.js";

export function toolCatalogue(client: CmssyApi, uploadTool: AiTool): AiTool[] {
  return [
    // ─── Read Tools ──────────────────────────────────────────────

    listPagesTool,
    getPageTool,
    getSiteConfigTool,
    listBlockTypesTool,
    listBlockUsageTool,
    getWorkspaceInfoTool,
    listMediaTool,
    uploadTool,
    listMediaFoldersTool,
    createMediaFolderTool,
    updateMediaFolderTool,
    deleteMediaFolderTool,
    moveMediaTool,
    listTeamTool,
    listRolesTool,
    listCustomersTool,
    getCustomerTool,
    suspendCustomerTool,
    unsuspendCustomerTool,
    sendCustomerPasswordResetTool,
    resendCustomerVerificationTool,
    unlockCustomerTool,
    setCustomerCompanyRoleTool,
    listPriceListsTool,
    getPriceListTool,
    createPriceListTool,
    updatePriceListTool,
    deletePriceListTool,
    setPriceListEntryTool,
    setPriceListEntriesTool,
    removePriceListEntriesTool,
    setCustomerPriceListTool,
    setCompanyPriceListTool,

    // ─── Write Tools ─────────────────────────────────────────────

    createPageTool,
    updatePageBlocksTool,
    promoteDevDraftTool,
    updatePageSettingsTool,
    listPageTypesTool,
    createPageTypeTool,
    getPageTypeTool,
    updatePageTypeTool,
    deletePageTypeTool,
    publishPageTool,
    unpublishPageTool,
    takeOverPageLockTool,
    revertToPublishedTool,
    deletePageTool,

    // ─── Layout Tools ──────────────────────────────────────────

    updatePageLayoutTool,
    createUpdateRegionSettingsTool(client),

    // ─── Block Helper Tools (read-modify-write) ─────────────────

    addBlockToPageTool,
    updateBlockContentTool,
    patchBlockContentTool,
    removeBlockFromPageTool,

    // ─── Form Tools ──────────────────────────────────────────────

    listFormsTool,
    getFormTool,
    createFormTool,
    updateFormTool,
    deleteFormTool,
    listFormSubmissionsTool,
    getFormSubmissionTool,
    updateFormSubmissionStatusTool,
    deleteFormSubmissionTool,

    // ─── Model Tools (Custom Data Models) ────────────────────────

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
    bulkUpdateRecordsTool,

    // ─── Commerce: Orders ────────────────────────────────────────

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
    closeOrderTool,
    reopenOrderTool,
    createShipmentTool,
    updateShipmentTool,
    createReturnTool,
    approveReturnTool,
    rejectReturnTool,
    cancelReturnTool,
    receiveReturnTool,
    refundReturnTool,
    completeReturnTool,
    updateReturnTrackingTool,
    setOrderPipelineStageTool,
    recordOrderInvoiceTool,

    // ─── Commerce: Carts ─────────────────────────────────────────

    listCartsTool,
    deleteCartsTool,

    // ─── Commerce: Discounts ─────────────────────────────────────

    listDiscountsTool,
    getDiscountTool,
    createDiscountTool,
    updateDiscountTool,
    setDiscountEnabledTool,

    // ─── Commerce: Products (catalog over model records) ─────────

    listProductsTool,
    bulkUpdateProductsTool,
    bulkDeleteProductsTool,
    setProductTiersTool,
    setProductVariantsTool,
    updateCartConfigTool,
    clearCartConfigTool,

    // ─── Webhooks ────────────────────────────────────────────────

    listWebhooksTool,
    listWebhookDeliveriesTool,
    listWebhookEventTypesTool,
    createWebhookTool,
    updateWebhookTool,
    rotateWebhookSecretTool,
    redeliverWebhookDeliveryTool,
    deleteWebhookTool,
  ];
}

export function createServer(client: CmssyApi) {
  const server = new McpServer({
    name: "cmssy",
    version: PACKAGE_VERSION,
  });

  const sharedOps = createMcpWorkspaceOps(client);
  for (const tool of toolCatalogue(client, uploadMediaTool)) {
    bindSharedTool(server, tool, sharedOps);
  }

  // ─── Resources ───────────────────────────────────────────────

  server.resource(
    "sitemap",
    "cmssy://sitemap",
    {
      description: "Full page tree as JSON — all pages with hierarchy",
      mimeType: "application/json",
    },
    async (uri) => {
      const data = await client.query<{ page: { list: PageListEntry[] } }>(
        PAGES_QUERY,
      );
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
        client.query<{ workspace: { current: Workspace | null } }>(
          CURRENT_WORKSPACE_QUERY,
        ),
        client.query<{ siteConfig: { get: SiteConfig | null } }>(
          SITE_CONFIG_QUERY,
        ),
      ]);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                workspace: workspaceData.workspace.current,
                siteConfig: configData.siteConfig.get,
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
