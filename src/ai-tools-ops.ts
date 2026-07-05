import type { CmssyClient } from "./graphql-client.js";
import type { WorkspaceOps, ModelSummary, ModelDetail } from "@cmssy/ai-tools";
import {
  MODEL_DEFINITION_BY_ID_QUERY,
  MODEL_DEFINITIONS_BY_SLUG_INDEX_QUERY,
  MODEL_DEFINITIONS_QUERY,
  MODEL_RECORDS_QUERY,
  MEDIA_ASSETS_QUERY,
  MEMBERS_QUERY,
  ROLES_QUERY,
  FORMS_QUERY,
  ORDERS_QUERY,
  DISCOUNTS_QUERY,
  CREATE_MODEL_RECORD_MUTATION,
  CREATE_DISCOUNT_MUTATION,
  SAVE_PAGE_MUTATION,
  CREATE_FORM_MUTATION,
  CREATE_MODEL_DEFINITION_MUTATION,
  UPDATE_MODEL_DEFINITION_MUTATION,
  MODEL_RECORD_BY_ID_QUERY,
  UPDATE_MODEL_RECORD_MUTATION,
  UPDATE_MODEL_RECORD_STATUS_MUTATION,
  DELETE_MODEL_DEFINITION_MUTATION,
  DELETE_MODEL_RECORD_MUTATION,
  IMPORT_MODEL_RECORDS_MUTATION,
  PAGES_QUERY,
  PAGE_BY_ID_QUERY,
  PAGE_VERSION_QUERY,
  PAGE_TYPES_QUERY,
  CREATE_PAGE_TYPE_MUTATION,
  UPDATE_PAGE_SETTINGS_MUTATION,
  UPDATE_PAGE_LAYOUT_MUTATION,
  PUBLISH_PAGE_CONTENT_MUTATION,
  PUBLISH_PAGE_LAYOUT_MUTATION,
  TOGGLE_PUBLISH_MUTATION,
  REVERT_CONTENT_TO_PUBLISHED_MUTATION,
  REVERT_LAYOUT_TO_PUBLISHED_MUTATION,
  REMOVE_PAGE_MUTATION,
  PATCH_BLOCK_CONTENT_MUTATION,
  SITE_CONFIG_QUERY,
  CURRENT_WORKSPACE_QUERY,
  FORM_BY_ID_QUERY,
  UPDATE_FORM_MUTATION,
  DELETE_FORM_MUTATION,
  FORM_SUBMISSIONS_QUERY,
  FORM_SUBMISSION_BY_ID_QUERY,
  UPDATE_FORM_SUBMISSION_STATUS_MUTATION,
  DELETE_FORM_SUBMISSION_MUTATION,
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
  DISCOUNT_BY_ID_QUERY,
  UPDATE_DISCOUNT_MUTATION,
  SET_DISCOUNT_ENABLED_MUTATION,
  WEBHOOK_ENDPOINTS_QUERY,
  WEBHOOK_DELIVERIES_QUERY,
  WEBHOOK_EVENT_TYPES_QUERY,
  CREATE_WEBHOOK_ENDPOINT_MUTATION,
  UPDATE_WEBHOOK_ENDPOINT_MUTATION,
  ROTATE_WEBHOOK_SECRET_MUTATION,
  DELETE_WEBHOOK_ENDPOINT_MUTATION,
  ADMIN_CARTS_QUERY,
  PRODUCT_CATALOG_QUERY,
  BULK_UPDATE_PRODUCT_RECORDS_MUTATION,
  BULK_DELETE_PRODUCT_RECORDS_MUTATION,
} from "./queries.js";

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^[0-9]/, "m$&");
  return slug || "model";
}

const isEmpty = (obj: unknown) =>
  obj == null ||
  (typeof obj === "object" && Object.keys(obj as object).length === 0);

function toRelativeSlug(slug: string): string {
  if (slug === "/") return "/";
  return "/" + slug.split("/").filter(Boolean).pop();
}

function expectedVersionOf(page: {
  version?: string | number | null;
}): number | undefined {
  return page?.version != null ? Number(page.version) : undefined;
}

interface PageDoc {
  id: string;
  name: string;
  slug: string;
  published?: boolean;
  pageType?: string | null;
  parentId?: string | null;
  blocks?: Array<Record<string, unknown> & { id: string }>;
  layoutBlocks?: Array<Record<string, unknown> & { id: string }>;
  customFields?: unknown;
  version?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

async function loadPage(
  client: CmssyClient,
  pageId: string,
): Promise<PageDoc | null> {
  const data = await client.query<{ page: { get: PageDoc | null } }>(
    PAGE_BY_ID_QUERY,
    { pageId },
  );
  return data.page.get;
}

// Lightweight read for version-only guards - skips the full blocks/layout
// payload PAGE_BY_ID_QUERY pulls in.
async function loadPageVersion(
  client: CmssyClient,
  pageId: string,
): Promise<{ id: string; version?: number | null } | null> {
  const data = await client.query<{
    page: { get: { id: string; version?: number | null } | null };
  }>(PAGE_VERSION_QUERY, { pageId });
  return data.page.get;
}

interface ResolvedModel {
  id: string;
  name: string;
  displayField: string | null;
}

async function fetchModelById(
  client: CmssyClient,
  id: string,
): Promise<ResolvedModel | null> {
  const data = await client.query<{
    modelDefinition: {
      id: string;
      name: string;
      displayField?: string | null;
    } | null;
  }>(MODEL_DEFINITION_BY_ID_QUERY, { id });
  if (!data.modelDefinition) return null;
  return {
    id: data.modelDefinition.id,
    name: data.modelDefinition.name,
    displayField: data.modelDefinition.displayField ?? null,
  };
}

async function resolveModel(
  client: CmssyClient,
  idOrSlug: string,
): Promise<ResolvedModel | null> {
  if (OBJECT_ID_RE.test(idOrSlug)) {
    const byId = await fetchModelById(client, idOrSlug);
    if (byId) return byId;
  }
  const index = await client.query<{
    modelDefinitions: Array<{ id: string; slug: string }>;
  }>(MODEL_DEFINITIONS_BY_SLUG_INDEX_QUERY);
  const match = index.modelDefinitions.find((m) => m.slug === idOrSlug);
  if (!match) return null;
  return fetchModelById(client, match.id);
}

interface RawModelDefinition {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  displayField?: string | null;
  recordCount?: number | null;
  defaultSort?: { field: string; direction: "asc" | "desc" } | null;
  statusField?: {
    enabled?: boolean;
    values?: string[];
    defaultValue?: string | null;
    transitions?: Array<{ from: string; to: string[] }>;
  } | null;
  fields?: Array<{
    key: string;
    label: string;
    type: string;
    required?: boolean | null;
  }> | null;
}

function toModelSummary(m: RawModelDefinition): ModelSummary {
  return {
    id: m.id,
    name: m.name,
    slug: m.slug,
    description: m.description ?? null,
    fieldCount: m.fields?.length ?? 0,
  };
}

function toModelDetail(m: RawModelDefinition): ModelDetail {
  return {
    id: m.id,
    name: m.name,
    slug: m.slug,
    description: m.description ?? null,
    displayField: m.displayField ?? null,
    icon: m.icon ?? null,
    color: m.color ?? null,
    recordCount: m.recordCount ?? null,
    defaultSort: m.defaultSort ?? null,
    statusField: m.statusField
      ? {
          enabled: m.statusField.enabled,
          values: m.statusField.values,
          defaultValue: m.statusField.defaultValue ?? undefined,
          transitions: m.statusField.transitions,
        }
      : null,
    fields: (m.fields ?? []).map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required ?? false,
    })),
  };
}

export function createMcpWorkspaceOps(client: CmssyClient): WorkspaceOps {
  const ws = client.workspaceId;
  return {
    models: {
      list: async () => {
        const res = await client.query<{
          modelDefinitions: RawModelDefinition[];
        }>(MODEL_DEFINITIONS_QUERY);
        return res.modelDefinitions.map(toModelSummary);
      },
      get: async (idOrSlug) => {
        const resolved = await resolveModel(client, idOrSlug);
        if (!resolved) return null;
        const res = await client.query<{
          modelDefinition: RawModelDefinition | null;
        }>(MODEL_DEFINITION_BY_ID_QUERY, { id: resolved.id });
        if (!res.modelDefinition) return null;
        return toModelDetail(res.modelDefinition);
      },
      listRecords: async (modelIdOrSlug, options) => {
        const model = await resolveModel(client, modelIdOrSlug);
        if (!model) return null;
        const res = await client.query<{
          modelRecords: {
            items: Array<{
              id: string;
              modelId: string;
              status?: string | null;
              data?: Record<string, unknown> | null;
              createdAt?: string | null;
              updatedAt?: string | null;
            }>;
            total: number;
            hasMore: boolean;
          };
        }>(MODEL_RECORDS_QUERY, {
          modelId: model.id,
          filter: options?.filter,
          sort: options?.sort,
          limit: options?.limit,
          offset: options?.offset,
          populate: options?.populate,
        });
        return {
          modelId: model.id,
          items: res.modelRecords.items.map((r) => ({
            id: r.id,
            modelId: r.modelId,
            status: r.status ?? null,
            data: r.data ?? {},
            createdAt: r.createdAt ?? null,
            updatedAt: r.updatedAt ?? null,
          })),
          total: res.modelRecords.total,
          hasMore: res.modelRecords.hasMore,
        };
      },
      create: async (input) => {
        const mutationInput: Record<string, unknown> = {
          name: input.name,
          slug: input.slug ?? slugify(input.name),
          fields: input.fields,
        };
        if (input.description !== undefined)
          mutationInput.description = input.description;
        if (input.icon !== undefined) mutationInput.icon = input.icon;
        if (input.color !== undefined) mutationInput.color = input.color;
        if (input.displayField !== undefined)
          mutationInput.displayField = input.displayField;
        if (input.defaultSort !== undefined)
          mutationInput.defaultSort = input.defaultSort;
        if (input.statusField !== undefined)
          mutationInput.statusField = input.statusField;
        const res = await client.query<{
          createModelDefinition: {
            id: string;
            name: string;
            slug: string;
            fields?: unknown[] | null;
          };
        }>(CREATE_MODEL_DEFINITION_MUTATION, { input: mutationInput });
        const m = res.createModelDefinition;
        return {
          id: m.id,
          name: m.name,
          slug: m.slug,
          fieldCount: m.fields?.length ?? 0,
        };
      },
      update: async (idOrSlug, patch) => {
        const model = await resolveModel(client, idOrSlug);
        if (!model) return null;
        const input: Record<string, unknown> = { id: model.id };
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
          if (patch[key] !== undefined) input[key] = patch[key];
        }
        const res = await client.query<{
          updateModelDefinition: {
            id: string;
            name: string;
            slug: string;
            fields?: unknown[] | null;
          } | null;
        }>(UPDATE_MODEL_DEFINITION_MUTATION, { input });
        if (!res.updateModelDefinition) return null;
        const m = res.updateModelDefinition;
        return {
          id: m.id,
          name: m.name,
          slug: m.slug,
          fieldCount: m.fields?.length ?? 0,
        };
      },
      updateRecord: async (recordId, { data, status }) => {
        const recRes = await client.query<{
          modelRecord: {
            id: string;
            modelId: string;
            data?: Record<string, unknown> | null;
          } | null;
        }>(MODEL_RECORD_BY_ID_QUERY, { id: recordId });
        if (!recRes.modelRecord) return null;
        const rec = recRes.modelRecord;
        const model = await resolveModel(client, rec.modelId);
        let currentData: Record<string, unknown> = rec.data ?? {};
        if (status !== undefined) {
          const res = await client.query<{
            updateModelRecordStatus: {
              id: string;
              data?: Record<string, unknown> | null;
            } | null;
          }>(UPDATE_MODEL_RECORD_STATUS_MUTATION, {
            input: { id: recordId, status },
          });
          if (!res.updateModelRecordStatus) return null;
          currentData = res.updateModelRecordStatus.data ?? currentData;
        }
        if (data !== undefined) {
          const merged = { ...currentData, ...data };
          const res = await client.query<{
            updateModelRecord: {
              id: string;
              data?: Record<string, unknown> | null;
            } | null;
          }>(UPDATE_MODEL_RECORD_MUTATION, {
            input: { id: recordId, data: merged },
          });
          if (!res.updateModelRecord) return null;
          currentData = res.updateModelRecord.data ?? merged;
        }
        const display = model?.displayField;
        const label =
          display && typeof currentData[display] === "string"
            ? (currentData[display] as string)
            : (model?.name ?? "Record");
        return {
          id: recordId,
          label,
          modelName: model?.name ?? "Record",
          modelId: rec.modelId,
        };
      },
      createRecord: async (modelIdOrSlug, data) => {
        const model = await resolveModel(client, modelIdOrSlug);
        if (!model) return null;
        const res = await client.query<{ createModelRecord: { id: string } }>(
          CREATE_MODEL_RECORD_MUTATION,
          { input: { modelId: model.id, data } },
        );
        const display = model.displayField;
        const label =
          display && typeof data[display] === "string"
            ? (data[display] as string)
            : model.name;
        return {
          id: res.createModelRecord.id,
          label,
          modelName: model.name,
          modelId: model.id,
        };
      },
      getRecord: async (recordId) => {
        const res = await client.query<{
          modelRecord: {
            id: string;
            modelId: string;
            status?: string | null;
            data?: Record<string, unknown> | null;
            createdAt?: string | null;
            updatedAt?: string | null;
          } | null;
        }>(MODEL_RECORD_BY_ID_QUERY, { id: recordId });
        const r = res.modelRecord;
        if (!r) return null;
        return {
          id: r.id,
          modelId: r.modelId,
          status: r.status ?? null,
          data: r.data ?? {},
          createdAt: r.createdAt ?? null,
          updatedAt: r.updatedAt ?? null,
        };
      },
      delete: async (idOrSlug) => {
        const model = await resolveModel(client, idOrSlug);
        if (!model) return { deleted: false };
        const res = await client.query<{ deleteModelDefinition: boolean }>(
          DELETE_MODEL_DEFINITION_MUTATION,
          { id: model.id },
        );
        return { deleted: Boolean(res.deleteModelDefinition) };
      },
      deleteRecord: async (recordId) => {
        const res = await client.query<{ deleteModelRecord: boolean }>(
          DELETE_MODEL_RECORD_MUTATION,
          { id: recordId },
        );
        return { deleted: Boolean(res.deleteModelRecord) };
      },
      importRecords: async (modelIdOrSlug, rows) => {
        const model = await resolveModel(client, modelIdOrSlug);
        if (!model) throw new Error(`Model "${modelIdOrSlug}" not found`);
        const res = await client.query<{
          importModelRecords: {
            importedCount: number;
            errors: Array<{ row: number; message: string }>;
          };
        }>(IMPORT_MODEL_RECORDS_MUTATION, {
          input: { modelId: model.id, rows },
        });
        return res.importModelRecords;
      },
    },
    pages: {
      search: async (query) => {
        const res = await client.query<{
          page: {
            list: Array<{
              id: string;
              name: string;
              slug: string;
              published: boolean;
            }>;
          };
        }>(PAGES_QUERY, { search: query });
        return res.page.list.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          published: p.published,
        }));
      },
      create: async (input) => {
        const mutationInput: Record<string, unknown> = {
          name: input.name,
          slug: input.slug,
        };
        if (input.description !== undefined)
          mutationInput.description = input.description;
        if (input.parentId !== undefined)
          mutationInput.parentId = input.parentId;
        if (input.pageType !== undefined)
          mutationInput.pageType = input.pageType;
        if (input.displayName !== undefined)
          mutationInput.displayName = input.displayName;
        if (input.seoTitle !== undefined)
          mutationInput.seoTitle = input.seoTitle;
        if (input.seoDescription !== undefined)
          mutationInput.seoDescription = input.seoDescription;
        if (input.customFields !== undefined)
          mutationInput.customFields = input.customFields;
        const res = await client.query<{
          page: { save: { id: string; name: string } };
        }>(SAVE_PAGE_MUTATION, { input: mutationInput });
        return { id: res.page.save.id, name: res.page.save.name };
      },
      get: async (idOrSlug) => {
        const page = await loadPage(client, idOrSlug);
        if (!page) return null;
        return {
          id: page.id,
          name: page.name,
          slug: page.slug,
          published: Boolean(page.published),
          pageType: page.pageType ?? null,
          parentId: page.parentId ?? null,
          blocks: page.blocks ?? null,
          layoutBlocks: page.layoutBlocks ?? null,
          customFields: page.customFields ?? null,
          createdAt: page.createdAt ?? null,
          updatedAt: page.updatedAt ?? null,
        };
      },
      list: async (search) => {
        const res = await client.query<{
          page: {
            list: Array<{
              id: string;
              name: string;
              slug: string;
              published?: boolean;
            }>;
          };
        }>(PAGES_QUERY, search ? { search } : {});
        return res.page.list.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          published: Boolean(p.published),
        }));
      },
      listTypes: async () => {
        const res = await client.query<{
          pageType: {
            list: Array<{
              id: string;
              name: string;
              slug: string;
              urlPrefix?: string | null;
              allowChildren?: boolean;
            }>;
          };
        }>(PAGE_TYPES_QUERY);
        return res.pageType.list.map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          urlPrefix: t.urlPrefix ?? null,
          allowChildren: Boolean(t.allowChildren),
        }));
      },
      updateBlocks: async (pageId, blocks) => {
        const page = await loadPage(client, pageId);
        if (!page) throw new Error("Page not found");
        const existing = page.blocks ?? [];
        const merged = (
          blocks as Array<Record<string, unknown> & { id: string }>
        ).map((block) => {
          const prev = existing.find((b) => b.id === block.id);
          if (!prev) return block;
          return {
            ...block,
            content: isEmpty(block.content) ? prev.content : block.content,
            settings: isEmpty(block.settings) ? prev.settings : block.settings,
            style: block.style ?? prev.style,
            advanced: block.advanced ?? prev.advanced,
            translations: isEmpty(block.translations)
              ? prev.translations
              : block.translations,
            defaultLanguage: block.defaultLanguage ?? prev.defaultLanguage,
            metadata: block.metadata ?? prev.metadata,
            blockVersion: block.blockVersion ?? prev.blockVersion,
          };
        });
        const res = await client.query<{ page: { save: { id: string } } }>(
          SAVE_PAGE_MUTATION,
          {
            input: {
              id: pageId,
              name: page.name,
              slug: toRelativeSlug(page.slug),
              parentId: page.parentId ?? undefined,
              blocks: merged,
              expectedVersion: expectedVersionOf(page),
            },
          },
        );
        return { id: res.page.save.id };
      },
      updateSettings: async (pageId, settings) => {
        // Read-modify-write: carry the current version as expectedVersion so the
        // write honors the optimistic-concurrency guard (required once the
        // backend's ENFORCE_PAGE_VERSION_GUARD is on). Version-only read.
        const page = await loadPageVersion(client, pageId);
        if (!page) throw new Error("Page not found");
        const input: Record<string, unknown> = { id: pageId };
        for (const key of [
          "name",
          "slug",
          "displayName",
          "seoTitle",
          "seoDescription",
          "seoKeywords",
          "customFields",
        ] as const) {
          if (settings[key] !== undefined) input[key] = settings[key];
        }
        const ev = expectedVersionOf(page);
        if (ev !== undefined) input.expectedVersion = ev;
        const res = await client.query<{
          page: { updateSettings: { id: string } | null };
        }>(UPDATE_PAGE_SETTINGS_MUTATION, { input });
        if (!res.page.updateSettings) throw new Error("Page not found");
        return { id: res.page.updateSettings.id };
      },
      createType: async (input) => {
        const mutationInput: Record<string, unknown> = {
          name: input.name,
          slug: input.slug,
        };
        if (input.description !== undefined)
          mutationInput.description = input.description;
        if (input.icon !== undefined) mutationInput.icon = input.icon;
        if (input.urlPrefix !== undefined)
          mutationInput.urlPrefix = input.urlPrefix;
        if (input.allowChildren !== undefined)
          mutationInput.allowChildren = input.allowChildren;
        if (input.fields !== undefined) mutationInput.fields = input.fields;
        const res = await client.query<{
          pageType: { create: { id: string; name: string; slug: string } };
        }>(CREATE_PAGE_TYPE_MUTATION, { input: mutationInput });
        return {
          id: res.pageType.create.id,
          name: res.pageType.create.name,
          slug: res.pageType.create.slug,
        };
      },
      publish: async (pageId) => {
        const page = await client.query<{
          page: {
            get: {
              id: string;
              published?: boolean;
              hasUnpublishedContentChanges?: boolean;
              hasUnpublishedLayoutChanges?: boolean;
            } | null;
          };
        }>(PAGE_BY_ID_QUERY, { pageId });
        if (!page.page.get) throw new Error("Page not found");
        if (
          page.page.get.published &&
          !page.page.get.hasUnpublishedContentChanges &&
          !page.page.get.hasUnpublishedLayoutChanges
        ) {
          return { id: pageId };
        }
        await client.query(PUBLISH_PAGE_CONTENT_MUTATION, { id: pageId });
        let res: { page: { publishLayout: { id: string } | null } };
        try {
          res = await client.query<{
            page: { publishLayout: { id: string } | null };
          }>(PUBLISH_PAGE_LAYOUT_MUTATION, { id: pageId });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(
            `Content published, but the layout axis failed and is still unpublished: ${message}. Note: re-running publish also re-publishes the current content draft, so publish any pending content edits first.`,
          );
        }
        if (!res.page.publishLayout) {
          throw new Error(
            "Content published, but the layout axis returned no result and is still unpublished. Note: re-running publish also re-publishes the current content draft, so publish any pending content edits first.",
          );
        }
        return { id: res.page.publishLayout.id };
      },
      unpublish: async (pageId) => {
        const res = await client.query<{
          page: { togglePublish: { id: string } | null };
        }>(TOGGLE_PUBLISH_MUTATION, { id: pageId });
        if (!res.page.togglePublish) throw new Error("Page not found");
        return { id: res.page.togglePublish.id };
      },
      revert: async (pageId) => {
        await client.query(REVERT_CONTENT_TO_PUBLISHED_MUTATION, {
          id: pageId,
        });
        await client.query(REVERT_LAYOUT_TO_PUBLISHED_MUTATION, { id: pageId });
        return { id: pageId };
      },
      deletePage: async (pageId) => {
        const res = await client.query<{
          page: { delete: { deleted: boolean } };
        }>(REMOVE_PAGE_MUTATION, { id: pageId });
        return { deleted: Boolean(res.page.delete.deleted) };
      },
      updateLayout: async (pageId, layout) => {
        // Need the version for the guard either way; only pull the full page
        // (heavy) when there are layoutBlocks to merge against the draft. An
        // empty array still clears the layout but needs no merge/full fetch.
        const hasBlocksToMerge = (layout.layoutBlocks?.length ?? 0) > 0;
        const page = hasBlocksToMerge
          ? await loadPage(client, pageId)
          : await loadPageVersion(client, pageId);
        if (!page) throw new Error("Page not found");
        let mergedLayoutBlocks = layout.layoutBlocks;
        if (hasBlocksToMerge && layout.layoutBlocks) {
          const existing = (page as PageDoc).layoutBlocks ?? [];
          mergedLayoutBlocks = layout.layoutBlocks.map((block) => {
            const prev = existing.find(
              (b) => b.id === (block as { id?: string }).id,
            );
            if (!prev) return block;
            return {
              ...block,
              content: isEmpty(block.content) ? prev.content : block.content,
              settings: isEmpty(block.settings)
                ? prev.settings
                : block.settings,
              translations: isEmpty(block.translations)
                ? prev.translations
                : block.translations,
            };
          });
        }
        const input: Record<string, unknown> = { pageId };
        if (mergedLayoutBlocks !== undefined)
          input.layoutBlocks = mergedLayoutBlocks;
        if (layout.layoutOverrides !== undefined)
          input.layoutOverrides = layout.layoutOverrides;
        if (layout.inheritsLayout !== undefined)
          input.inheritsLayout = layout.inheritsLayout;
        const ev = expectedVersionOf(page);
        if (ev !== undefined) input.expectedVersion = ev;
        const res = await client.query<{
          page: { updateLayout: { id: string } | null };
        }>(UPDATE_PAGE_LAYOUT_MUTATION, { input });
        if (!res.page.updateLayout) throw new Error("Page not found");
        return { id: res.page.updateLayout.id };
      },
      addBlock: async (pageId, block, layoutPosition, position) => {
        const page = await loadPage(client, pageId);
        if (!page) throw new Error("Page not found");
        const ev = expectedVersionOf(page);
        const configData = await client.query<{
          siteConfig: {
            defaultLanguage?: string;
            enabledLanguages?: string[];
          } | null;
        }>(SITE_CONFIG_QUERY);
        const defaultLanguage = configData.siteConfig?.defaultLanguage ?? "en";
        const enabledLanguages = configData.siteConfig?.enabledLanguages ?? [
          defaultLanguage,
        ];
        const content = block.content as Record<string, unknown>;
        const translations: Record<string, { status: string }> = {};
        for (const lang of enabledLanguages) {
          translations[lang] = {
            status: content[lang] ? "completed" : "pending",
          };
        }
        const newBlockId = crypto.randomUUID();
        if (layoutPosition) {
          const existingLayout = page.layoutBlocks ?? [];
          const maxOrder = existingLayout
            .filter(
              (b) => (b as { position?: string }).position === layoutPosition,
            )
            .reduce(
              (max, b) => Math.max(max, (b as { order?: number }).order ?? -1),
              -1,
            );
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
          const res = await client.query<{
            page: { updateLayout: { id: string } | null };
          }>(UPDATE_PAGE_LAYOUT_MUTATION, {
            input: {
              pageId,
              layoutBlocks: [...existingLayout, newLayoutBlock],
              ...(ev !== undefined ? { expectedVersion: ev } : {}),
            },
          });
          if (!res.page.updateLayout) throw new Error("Failed to add block");
          return { pageId, blockId: newBlockId };
        }
        const newBlock = {
          id: newBlockId,
          type: block.type,
          content: block.content,
          settings: block.settings,
          style: block.style,
          translations,
          defaultLanguage,
        };
        const blocks = [...(page.blocks ?? [])];
        if (
          position !== undefined &&
          position >= 0 &&
          position < blocks.length
        ) {
          blocks.splice(position, 0, newBlock);
        } else {
          blocks.push(newBlock);
        }
        await client.query(SAVE_PAGE_MUTATION, {
          input: {
            id: pageId,
            name: page.name,
            slug: toRelativeSlug(page.slug),
            parentId: page.parentId ?? undefined,
            blocks,
            expectedVersion: ev,
          },
        });
        return { pageId, blockId: newBlockId };
      },
      updateBlock: async (
        pageId,
        blockId,
        content,
        settings,
        mode = "merge",
      ) => {
        const page = await loadPage(client, pageId);
        if (!page) throw new Error("Page not found");
        const ev = expectedVersionOf(page);
        const contentIdx = (page.blocks ?? []).findIndex(
          (b) => b.id === blockId,
        );
        const layoutIdx =
          contentIdx === -1
            ? (page.layoutBlocks ?? []).findIndex((b) => b.id === blockId)
            : -1;
        if (contentIdx === -1 && layoutIdx === -1) {
          throw new Error("Block not found on page");
        }
        const isLayout = layoutIdx !== -1;
        const targetArray = isLayout
          ? [...(page.layoutBlocks ?? [])]
          : [...(page.blocks ?? [])];
        const targetIndex = isLayout ? layoutIdx : contentIdx;
        const existingBlock = {
          ...targetArray[targetIndex],
        } as Record<string, unknown> & { id: string };
        if (mode === "replace") {
          existingBlock.content = content;
        } else {
          const mergedContent = {
            ...((existingBlock.content as Record<string, unknown>) ?? {}),
          };
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
        }
        if (settings) {
          existingBlock.settings =
            mode === "replace"
              ? settings
              : {
                  ...((existingBlock.settings as Record<string, unknown>) ??
                    {}),
                  ...settings,
                };
        }
        const trans = existingBlock.translations as
          Record<string, { status: string }> | undefined;
        if (trans) {
          for (const lang of Object.keys(content)) {
            if (trans[lang]) trans[lang] = { status: "completed" };
          }
        }
        targetArray[targetIndex] = existingBlock;
        if (isLayout) {
          const res = await client.query<{
            page: { updateLayout: { id: string } | null };
          }>(UPDATE_PAGE_LAYOUT_MUTATION, {
            input: {
              pageId,
              layoutBlocks: targetArray,
              ...(ev !== undefined ? { expectedVersion: ev } : {}),
            },
          });
          if (!res.page.updateLayout) throw new Error("Failed to update block");
        } else {
          await client.query(SAVE_PAGE_MUTATION, {
            input: {
              id: pageId,
              name: page.name,
              slug: toRelativeSlug(page.slug),
              parentId: page.parentId ?? undefined,
              blocks: targetArray,
              expectedVersion: ev,
            },
          });
        }
        return { pageId, blockId };
      },
      patchBlock: async (
        pageId,
        blockId,
        locale,
        operations,
        fieldPath,
        expectedVersion,
      ) => {
        // Read-modify-write fallback: when the caller didn't pin a version,
        // load the current one so the guarded patch still lands (required once
        // the backend's ENFORCE_PAGE_VERSION_GUARD is on).
        let ev = expectedVersion;
        if (ev === undefined) {
          const page = await loadPageVersion(client, pageId);
          if (!page) throw new Error("Page not found");
          ev = expectedVersionOf(page);
        }
        const res = await client.query<{
          page: { patchBlockContent: { id: string } | null };
        }>(PATCH_BLOCK_CONTENT_MUTATION, {
          input: {
            pageId,
            blockId,
            locale,
            ...(fieldPath ? { fieldPath } : {}),
            ...(ev !== undefined ? { expectedVersion: ev } : {}),
            operations,
          },
        });
        if (!res.page.patchBlockContent) {
          throw new Error("Page not found or patch failed");
        }
        return { pageId, blockId };
      },
      removeBlock: async (pageId, blockId) => {
        const page = await loadPage(client, pageId);
        if (!page) throw new Error("Page not found");
        const ev = expectedVersionOf(page);
        const contentBlocks = (page.blocks ?? []).filter(
          (b) => b.id !== blockId,
        );
        if (contentBlocks.length < (page.blocks ?? []).length) {
          await client.query(SAVE_PAGE_MUTATION, {
            input: {
              id: pageId,
              name: page.name,
              slug: toRelativeSlug(page.slug),
              parentId: page.parentId ?? undefined,
              blocks: contentBlocks,
              expectedVersion: ev,
            },
          });
          return { pageId, blockId };
        }
        const layoutBlocks = (page.layoutBlocks ?? []).filter(
          (b) => b.id !== blockId,
        );
        if (layoutBlocks.length < (page.layoutBlocks ?? []).length) {
          const res = await client.query<{
            page: { updateLayout: { id: string } | null };
          }>(UPDATE_PAGE_LAYOUT_MUTATION, {
            input: {
              pageId,
              layoutBlocks,
              ...(ev !== undefined ? { expectedVersion: ev } : {}),
            },
          });
          if (!res.page.updateLayout) throw new Error("Failed to remove block");
          return { pageId, blockId };
        }
        throw new Error("Block not found on page");
      },
    },
    media: {
      list: async (limit, offset) => {
        const res = await client.query<{
          mediaAssets: {
            items: Array<{
              id: string;
              filename: string;
              type: string;
              url?: string | null;
              mimeType?: string | null;
              size?: number | null;
            }>;
            total: number;
            hasMore: boolean;
          };
        }>(MEDIA_ASSETS_QUERY, { limit, offset });
        return {
          items: res.mediaAssets.items.map((m) => ({
            id: m.id,
            filename: m.filename,
            type: m.type,
            url: m.url ?? null,
            mimeType: m.mimeType ?? null,
            size: m.size ?? null,
          })),
          total: res.mediaAssets.total,
          hasMore: res.mediaAssets.hasMore,
        };
      },
    },
    forms: {
      list: async (options) => {
        const res = await client.query<{
          forms: {
            forms: Array<{
              id: string;
              name: string;
              slug?: string | null;
              status: string;
              submissionCount?: number | null;
            }>;
            total: number;
            hasMore: boolean;
          };
        }>(FORMS_QUERY, {
          status: options?.status,
          skip: options?.skip,
          limit: options?.limit,
        });
        return {
          items: res.forms.forms.map((f) => ({
            id: f.id,
            name: f.name,
            slug: f.slug ?? null,
            status: f.status,
            submissionCount: f.submissionCount ?? null,
          })),
          total: res.forms.total,
          hasMore: res.forms.hasMore,
        };
      },
      create: async (input) => {
        const mutationInput: Record<string, unknown> = {
          name: input.name,
          slug: input.slug,
        };
        if (input.description !== undefined)
          mutationInput.description = input.description;
        if (input.fields !== undefined) mutationInput.fields = input.fields;
        if (input.settings !== undefined)
          mutationInput.settings = input.settings;
        const res = await client.query<{
          createForm: { id: string; name: string };
        }>(CREATE_FORM_MUTATION, { input: mutationInput });
        return { id: res.createForm.id, name: res.createForm.name };
      },
      get: async (idOrSlug) => {
        const res = await client.query<{
          form: {
            id: string;
            name: string;
            slug: string;
            status?: string | null;
            fields?: unknown;
            settings?: unknown;
            submissionCount?: number | null;
          } | null;
        }>(FORM_BY_ID_QUERY, { formId: idOrSlug });
        const f = res.form;
        if (!f) return null;
        return {
          id: f.id,
          name: f.name,
          slug: f.slug,
          status: f.status ?? null,
          fields: f.fields ?? null,
          settings: f.settings ?? null,
          submissionCount: f.submissionCount ?? null,
        };
      },
      update: async (idOrSlug, patch) => {
        const input: Record<string, unknown> = {};
        for (const key of [
          "name",
          "slug",
          "description",
          "status",
          "fields",
          "settings",
        ] as const) {
          if (patch[key] !== undefined) input[key] = patch[key];
        }
        const res = await client.query<{
          updateForm: { id: string } | null;
        }>(UPDATE_FORM_MUTATION, { formId: idOrSlug, input });
        return res.updateForm ? { id: res.updateForm.id } : null;
      },
      delete: async (idOrSlug) => {
        const res = await client.query<{ deleteForm: boolean }>(
          DELETE_FORM_MUTATION,
          { formId: idOrSlug },
        );
        return { deleted: Boolean(res.deleteForm) };
      },
      listSubmissions: async (options) => {
        const res = await client.query<{ formSubmissions: unknown }>(
          FORM_SUBMISSIONS_QUERY,
          {
            ...(options?.formIdOrSlug ? { formId: options.formIdOrSlug } : {}),
            ...(options?.status ? { status: options.status } : {}),
            skip: options?.skip ?? 0,
            limit: options?.limit ?? 50,
          },
        );
        return res.formSubmissions;
      },
      getSubmission: async (submissionId) => {
        const res = await client.query<{ formSubmission: unknown }>(
          FORM_SUBMISSION_BY_ID_QUERY,
          { submissionId },
        );
        return res.formSubmission;
      },
      updateSubmissionStatus: async (submissionId, status) => {
        const res = await client.query<{
          updateFormSubmissionStatus: boolean;
        }>(UPDATE_FORM_SUBMISSION_STATUS_MUTATION, { submissionId, status });
        return { ok: Boolean(res.updateFormSubmissionStatus) };
      },
      deleteSubmission: async (submissionId) => {
        const res = await client.query<{ deleteFormSubmission: boolean }>(
          DELETE_FORM_SUBMISSION_MUTATION,
          { submissionId },
        );
        return { deleted: Boolean(res.deleteFormSubmission) };
      },
    },
    orders: {
      list: async (options) => {
        const res = await client.query<{
          order: {
            list: {
              items: Array<{
                id: string;
                orderNumber?: number | null;
                customerEmail?: string | null;
                status?: string | null;
                paymentStatus?: string | null;
                fulfillmentStatus?: string | null;
                total?: number | null;
                currency?: string | null;
                createdAt?: string | null;
              }>;
              total: number;
              hasMore: boolean;
            };
          };
        }>(ORDERS_QUERY, {
          paymentStatus: options?.paymentStatus,
          fulfillmentStatus: options?.fulfillmentStatus,
          customerId: options?.customerId,
          search: options?.search,
          pipelineStageId: options?.pipelineStageId,
          dateFrom: options?.dateFrom,
          dateTo: options?.dateTo,
          skip: options?.skip,
          limit: options?.limit,
        });
        return {
          items: res.order.list.items.map((o) => ({
            id: o.id,
            orderNumber: o.orderNumber ?? null,
            customerEmail: o.customerEmail ?? null,
            status: o.status ?? null,
            paymentStatus: o.paymentStatus ?? null,
            fulfillmentStatus: o.fulfillmentStatus ?? null,
            total: o.total ?? null,
            currency: o.currency ?? null,
            createdAt: o.createdAt ?? null,
          })),
          total: res.order.list.total,
          hasMore: res.order.list.hasMore,
        };
      },
      get: async (id) => {
        const res = await client.query<{
          order: {
            get: {
              id: string;
              orderNumber?: number | null;
              paymentStatus?: string | null;
              fulfillmentStatus?: string | null;
              customerEmail?: string | null;
              total?: number | null;
              currency?: string | null;
              items?: unknown;
              payments?: unknown;
              createdAt?: string | null;
            } | null;
          };
        }>(ORDER_BY_ID_QUERY, { id });
        const o = res.order.get;
        if (!o) return null;
        return {
          id: o.id,
          orderNumber: o.orderNumber ?? null,
          paymentStatus: o.paymentStatus ?? null,
          fulfillmentStatus: o.fulfillmentStatus ?? null,
          customerEmail: o.customerEmail ?? null,
          total: o.total ?? null,
          currency: o.currency ?? null,
          items: o.items ?? null,
          payments: o.payments ?? null,
          createdAt: o.createdAt ?? null,
        };
      },
      getPipeline: async () => {
        const res = await client.query<{ order: { pipeline: unknown } }>(
          ORDER_PIPELINE_QUERY,
          {},
        );
        return res.order.pipeline;
      },
      createManual: async (customerEmail, items, customerId) => {
        const res = await client.query<{
          order: { create: { id: string; orderNumber?: number | null } };
        }>(CREATE_MANUAL_ORDER_MUTATION, {
          input: { customerEmail, customerId, items },
        });
        const o = res.order.create;
        return { id: o.id, orderNumber: o.orderNumber ?? null };
      },
      edit: async (orderId, items) => {
        const res = await client.query<{
          order: { updateItems: { id: string; orderNumber?: number | null } };
        }>(EDIT_ORDER_MUTATION, {
          input: { orderId, items },
        });
        const o = res.order.updateItems;
        return { id: o.id, orderNumber: o.orderNumber ?? null };
      },
      updateDetails: async (orderId, details) => {
        const res = await client.query<{
          order: { updateDetails: { id: string; orderNumber?: number | null } };
        }>(UPDATE_ORDER_DETAILS_MUTATION, {
          input: { orderId, ...details },
        });
        const o = res.order.updateDetails;
        return { id: o.id, orderNumber: o.orderNumber ?? null };
      },
      markPaid: async (orderId, payment) => {
        const res = await client.query<{
          order: { markPaid: { id: string; orderNumber?: number | null } };
        }>(MARK_ORDER_PAID_MUTATION, {
          input: {
            orderId,
            amount: payment.amount,
            reference: payment.reference,
            provider: payment.provider ?? "manual",
          },
        });
        const o = res.order.markPaid;
        return { id: o.id, orderNumber: o.orderNumber ?? null };
      },
      recordPayment: async (orderId, payment) => {
        const res = await client.query<{
          order: {
            recordPayment: { id: string; orderNumber?: number | null };
          };
        }>(RECORD_ORDER_PAYMENT_MUTATION, {
          input: {
            orderId,
            amount: payment.amount,
            reference: payment.reference,
            provider: payment.provider,
          },
        });
        const o = res.order.recordPayment;
        return { id: o.id, orderNumber: o.orderNumber ?? null };
      },
      refund: async (orderId, reference, amount) => {
        const res = await client.query<{
          order: { refund: { id: string; orderNumber?: number | null } };
        }>(REFUND_ORDER_MUTATION, {
          input: { orderId, reference, amount },
        });
        const o = res.order.refund;
        return { id: o.id, orderNumber: o.orderNumber ?? null };
      },
      cancel: async (orderId) => {
        const res = await client.query<{
          order: { cancel: { id: string; orderNumber?: number | null } };
        }>(CANCEL_ORDER_MUTATION, {
          input: { orderId },
        });
        const o = res.order.cancel;
        return { id: o.id, orderNumber: o.orderNumber ?? null };
      },
      transitionFulfillment: async (
        orderId,
        status,
        trackingNumber,
        trackingCarrier,
      ) => {
        const res = await client.query<{
          order: {
            transitionFulfillment: {
              id: string;
              orderNumber?: number | null;
            };
          };
        }>(TRANSITION_ORDER_FULFILLMENT_MUTATION, {
          input: {
            orderId,
            status,
            trackingNumber,
            trackingCarrier,
          },
        });
        const o = res.order.transitionFulfillment;
        return { id: o.id, orderNumber: o.orderNumber ?? null };
      },
      setPipelineStage: async (orderId, stageId) => {
        const res = await client.query<{
          order: {
            setPipelineStage: { id: string; orderNumber?: number | null };
          };
        }>(SET_ORDER_PIPELINE_STAGE_MUTATION, {
          input: { orderId, stageId },
        });
        const o = res.order.setPipelineStage;
        return { id: o.id, orderNumber: o.orderNumber ?? null };
      },
      recordInvoice: async (orderId, invoice) => {
        const res = await client.query<{
          order: {
            recordInvoice: { id: string; orderNumber?: number | null };
          };
        }>(RECORD_ORDER_INVOICE_MUTATION, {
          input: {
            orderId,
            number: invoice.number,
            url: invoice.url,
            provider: invoice.provider,
          },
        });
        const o = res.order.recordInvoice;
        return { id: o.id, orderNumber: o.orderNumber ?? null };
      },
    },
    discounts: {
      list: async (options) => {
        const res = await client.query<{
          discount: {
            list: {
              items: Array<{
                id: string;
                code: string;
                type: string;
                value?: number | null;
                enabled: boolean;
                currentUses?: number | null;
              }>;
              total: number;
              hasMore: boolean;
            };
          };
        }>(DISCOUNTS_QUERY, {
          enabled: options?.enabled,
          type: options?.type,
          search: options?.search,
          limit: options?.limit,
          offset: options?.offset,
        });
        return {
          items: res.discount.list.items.map((d) => ({
            id: d.id,
            code: d.code,
            type: d.type,
            value: d.value ?? null,
            enabled: d.enabled,
            currentUses: d.currentUses ?? null,
          })),
          total: res.discount.list.total,
          hasMore: res.discount.list.hasMore,
        };
      },
      create: async (input) => {
        const res = await client.query<{
          discount: { create: { id: string; code: string } };
        }>(CREATE_DISCOUNT_MUTATION, { input });
        return {
          id: res.discount.create.id,
          code: res.discount.create.code,
        };
      },
      get: async (idOrSlug) => {
        const res = await client.query<{
          discount: {
            get: {
              id: string;
              code: string;
              type: string;
              value: number;
              enabled: boolean;
              currency?: string | null;
              minSubtotal?: number | null;
              maxUses?: number | null;
              currentUses?: number | null;
              startsAt?: string | null;
              endsAt?: string | null;
            } | null;
          };
        }>(DISCOUNT_BY_ID_QUERY, { id: idOrSlug });
        const d = res.discount.get;
        if (!d) return null;
        return {
          id: d.id,
          code: d.code,
          type: d.type,
          value: d.value,
          enabled: d.enabled,
          currency: d.currency ?? null,
          minSubtotal: d.minSubtotal ?? null,
          maxUses: d.maxUses ?? null,
          currentUses: d.currentUses ?? null,
          startsAt: d.startsAt ?? null,
          endsAt: d.endsAt ?? null,
        };
      },
      update: async (idOrSlug, patch) => {
        const input: Record<string, unknown> = {};
        for (const key of [
          "code",
          "type",
          "value",
          "currency",
          "minSubtotal",
          "maxUses",
          "startsAt",
          "endsAt",
          "enabled",
        ] as const) {
          if (patch[key] !== undefined) input[key] = patch[key];
        }
        const res = await client.query<{
          discount: {
            update: {
              id: string;
              code: string;
              enabled: boolean;
            } | null;
          };
        }>(UPDATE_DISCOUNT_MUTATION, { id: idOrSlug, input });
        if (!res.discount.update) return null;
        return {
          id: res.discount.update.id,
          code: res.discount.update.code,
          enabled: res.discount.update.enabled,
        };
      },
      setEnabled: async (idOrSlug, enabled) => {
        const res = await client.query<{
          discount: {
            setEnabled: {
              id: string;
              code: string;
              enabled: boolean;
            } | null;
          };
        }>(SET_DISCOUNT_ENABLED_MUTATION, {
          id: idOrSlug,
          enabled,
        });
        if (!res.discount.setEnabled) return null;
        return {
          id: res.discount.setEnabled.id,
          code: res.discount.setEnabled.code,
          enabled: res.discount.setEnabled.enabled,
        };
      },
    },
    workspace: {
      info: async () => {
        const res = await client.query<{
          currentWorkspace: {
            id: string;
            name: string;
            slug: string;
            plan?: string | null;
            limits?: Record<string, unknown> | null;
          } | null;
        }>(CURRENT_WORKSPACE_QUERY);
        const w = res.currentWorkspace;
        if (!w) throw new Error("Workspace not found");
        return {
          id: w.id,
          name: w.name,
          slug: w.slug,
          plan: w.plan ?? null,
          limits: w.limits ?? null,
        };
      },
      siteConfig: async () => {
        const res = await client.query<{
          siteConfig: {
            id?: string | null;
            defaultLanguage?: string | null;
            enabledLanguages?: string[];
            siteName?: string | null;
            enabledFeatures?: string[];
            header?: unknown;
            footer?: unknown;
          } | null;
        }>(SITE_CONFIG_QUERY);
        const c = res.siteConfig;
        if (!c) return null;
        return {
          id: c.id ?? null,
          defaultLanguage: c.defaultLanguage ?? null,
          enabledLanguages: c.enabledLanguages ?? [],
          siteName: c.siteName ?? null,
          enabledFeatures: c.enabledFeatures ?? [],
          header: c.header ?? null,
          footer: c.footer ?? null,
        };
      },
    },
    webhooks: {
      list: async () => {
        const res = await client.query<{ webhook: { list: unknown } }>(
          WEBHOOK_ENDPOINTS_QUERY,
        );
        return res.webhook.list;
      },
      listDeliveries: async (limit) => {
        const res = await client.query<{ webhook: { deliveries: unknown } }>(
          WEBHOOK_DELIVERIES_QUERY,
          { limit: limit ?? 50 },
        );
        return res.webhook.deliveries;
      },
      listEventTypes: async () => {
        const res = await client.query<{ webhook: { eventTypes: string[] } }>(
          WEBHOOK_EVENT_TYPES_QUERY,
        );
        return res.webhook.eventTypes;
      },
      create: async (input) => {
        const res = await client.query<{ webhook: { create: unknown } }>(
          CREATE_WEBHOOK_ENDPOINT_MUTATION,
          {
            input: {
              url: input.url,
              events: input.events,
              description: input.description,
            },
          },
        );
        return res.webhook.create;
      },
      update: async (id, patch) => {
        const res = await client.query<{ webhook: { update: unknown } }>(
          UPDATE_WEBHOOK_ENDPOINT_MUTATION,
          { input: { id, ...patch } },
        );
        return res.webhook.update;
      },
      rotateSecret: async (id) => {
        const res = await client.query<{ webhook: { rotateSecret: unknown } }>(
          ROTATE_WEBHOOK_SECRET_MUTATION,
          { id },
        );
        return res.webhook.rotateSecret;
      },
      delete: async (id) => {
        const res = await client.query<{
          webhook: { delete: { deleted: boolean } };
        }>(DELETE_WEBHOOK_ENDPOINT_MUTATION, { id });
        return { deleted: Boolean(res.webhook.delete.deleted) };
      },
    },
    carts: {
      list: async (status, skip, limit) => {
        const res = await client.query<{ adminCart: { list: unknown } }>(
          ADMIN_CARTS_QUERY,
          {
            ...(status ? { status } : {}),
            skip: skip ?? 0,
            limit: limit ?? 20,
          },
        );
        return res.adminCart.list;
      },
    },
    products: {
      list: async (modelId, filter, limit, offset, sort) => {
        const res = await client.query<{ productCatalog: unknown }>(
          PRODUCT_CATALOG_QUERY,
          { modelId, filter, limit, offset, sort },
        );
        return res.productCatalog;
      },
      bulkUpdate: async (modelId, selection, patch) => {
        const res = await client.query<{ bulkUpdateProductRecords: number }>(
          BULK_UPDATE_PRODUCT_RECORDS_MUTATION,
          { modelId, selection, patch },
        );
        return { count: res.bulkUpdateProductRecords };
      },
      bulkDelete: async (modelId, selection) => {
        const res = await client.query<{ bulkDeleteProductRecords: number }>(
          BULK_DELETE_PRODUCT_RECORDS_MUTATION,
          { modelId, selection },
        );
        return { count: res.bulkDeleteProductRecords };
      },
    },
    members: {
      list: async (options) => {
        const res = await client.query<{
          users: Array<{
            id: string;
            email?: string | null;
            username?: string | null;
            profile?: { displayName?: string | null } | null;
            membershipStatus?: string | null;
            isWorkspaceOwner?: boolean | null;
            invitedAt?: string | null;
            joinedAt?: string | null;
            workspaceRole?: { id: string; name: string } | null;
          }>;
        }>(MEMBERS_QUERY);
        let items = res.users.map((u) => ({
          userId: u.id,
          email: u.email ?? null,
          name: u.profile?.displayName ?? u.username ?? null,
          roleId: u.workspaceRole?.id ?? "",
          roleName: u.workspaceRole?.name ?? null,
          status: u.membershipStatus ?? "",
          isOwner: u.isWorkspaceOwner ?? false,
          invitedAt: u.invitedAt ?? null,
          joinedAt: u.joinedAt ?? null,
        }));
        const status = options?.status;
        const search = options?.search?.toLowerCase();
        if (status) items = items.filter((m) => m.status === status);
        if (search)
          items = items.filter(
            (m) =>
              m.email?.toLowerCase().includes(search) ||
              m.name?.toLowerCase().includes(search),
          );
        const total = items.length;
        const skip = options?.skip ?? 0;
        const paged = items.slice(skip, skip + (options?.limit ?? 50));
        return { items: paged, total, hasMore: skip + paged.length < total };
      },
    },
    roles: {
      list: async () => {
        const res = await client.query<{
          workspaceRoles: Array<{
            id: string;
            name: string;
            slug: string;
            permissions: string[];
            isDefault: boolean;
            isSystem: boolean;
          }>;
        }>(ROLES_QUERY);
        return res.workspaceRoles.map((r) => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          permissions: r.permissions,
          isDefault: r.isDefault,
          isSystem: r.isSystem,
        }));
      },
    },
  };
}
