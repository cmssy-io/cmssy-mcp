import { putObject } from "./put-object.js";
import type { CmssyClient } from "./graphql-client.js";
import { mediaTypeFromMime, resolveUploadSource } from "./media-upload.js";
import type { Workspace } from "./types.js";
import type {
  BlockTypeDefinition,
  ModelDetail,
  ModelSummary,
  ProposedField,
  WorkspaceOps,
} from "@cmssy/ai-tools";
import {
  MODEL_DEFINITION_BY_ID_QUERY,
  MODEL_DEFINITIONS_BY_SLUG_INDEX_QUERY,
  MODEL_DEFINITIONS_QUERY,
  MODEL_RECORDS_QUERY,
  MEDIA_ASSETS_QUERY,
  AUTHORIZE_MEDIA_UPLOAD_MUTATION,
  REGISTER_MEDIA_UPLOAD_MUTATION,
  UPDATE_MEDIA_MUTATION,
  MEDIA_FOLDERS_QUERY,
  CREATE_MEDIA_FOLDER_MUTATION,
  UPDATE_MEDIA_FOLDER_MUTATION,
  DELETE_MEDIA_FOLDER_MUTATION,
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
  PAGE_TYPE_QUERY,
  UPDATE_PAGE_TYPE_MUTATION,
  DELETE_PAGE_TYPE_MUTATION,
  UPDATE_PAGE_SETTINGS_MUTATION,
  UPDATE_PAGE_LAYOUT_MUTATION,
  DEV_DRAFT_QUERY,
  SAVE_DEV_DRAFT_MUTATION,
  PROMOTE_DEV_DRAFT_MUTATION,
  PUBLISH_PAGE_CONTENT_MUTATION,
  PUBLISH_PAGE_LAYOUT_MUTATION,
  TOGGLE_PUBLISH_MUTATION,
  REVERT_CONTENT_TO_PUBLISHED_MUTATION,
  REVERT_LAYOUT_TO_PUBLISHED_MUTATION,
  REMOVE_PAGE_MUTATION,
  PATCH_BLOCK_CONTENT_MUTATION,
  SITE_CONFIG_QUERY,
  BLOCK_MANIFEST_QUERY,
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
  SET_PRODUCT_TIERS_MUTATION,
  UPDATE_CART_CONFIG_MUTATION,
  CLEAR_CART_CONFIG_MUTATION,
} from "./queries.js";

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

interface ProposedFieldLike {
  type: string;
  relationTo?: string;
  fields?: ProposedFieldLike[];
  itemFields?: ProposedFieldLike[];
}

export function toPropertyFields<T extends ProposedFieldLike>(
  fields: T[],
): T[] {
  return fields.map((field) => ({
    ...field,
    ...(field.relationTo
      ? { relationTo: `model:${field.relationTo.replace(/^model:/, "")}` }
      : {}),
    ...(field.fields !== undefined
      ? { fields: toPropertyFields(field.fields) }
      : {}),
    ...(field.itemFields !== undefined
      ? { itemFields: toPropertyFields(field.itemFields) }
      : {}),
  }));
}

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

function withBlockWarnings<T extends object>(
  base: T,
  warnings: string[] | null | undefined,
): T & { blockWarnings?: string[] } {
  return warnings && warnings.length
    ? { ...base, blockWarnings: warnings }
    : base;
}

interface WarnedWrite {
  blockWarnings?: string[] | null;
}

function applyBlockUpdate(
  block: Record<string, unknown> & { id: string },
  content: Record<string, unknown>,
  settings: Record<string, unknown> | undefined,
  mode: "merge" | "replace",
): Record<string, unknown> & { id: string } {
  const updated = { ...block };
  if (mode === "replace") {
    updated.content = content;
  } else {
    const mergedContent = {
      ...((updated.content as Record<string, unknown>) ?? {}),
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
    updated.content = mergedContent;
  }
  if (settings) {
    updated.settings =
      mode === "replace"
        ? settings
        : {
            ...((updated.settings as Record<string, unknown>) ?? {}),
            ...settings,
          };
  }
  const trans = updated.translations as
    Record<string, { status: string }> | undefined;
  if (trans) {
    for (const lang of Object.keys(content)) {
      if (trans[lang]) trans[lang] = { status: "completed" };
    }
  }
  return updated;
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
  displayName?: Record<string, string> | null;
  seoTitle?: Record<string, string> | null;
  seoDescription?: Record<string, string> | null;
  seoKeywords?: string[] | null;
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
  /** Field keys stored per language: { en: "...", pl: "..." }. */
  localizedFields: string[];
}

/**
 * A translatable field's value is a language map. Merging it shallowly - the way
 * every other field is merged - would drop every language the caller did not
 * send: an agent translating one language would delete the rest.
 */
export function mergeRecordData(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
  localizedFields: string[],
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...current, ...patch };
  for (const key of localizedFields) {
    const next = patch[key];
    const prev = current[key];
    if (isLanguageMap(next) && isLanguageMap(prev)) {
      merged[key] = { ...prev, ...next };
    }
  }
  return merged;
}

function localizedFieldKeys(
  fields: Array<{ key: string; localized?: boolean | null }> | null | undefined,
): string[] {
  return (fields ?? []).filter((f) => f.localized).map((f) => f.key);
}

function isLanguageMap(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

async function fetchModelById(
  client: CmssyClient,
  id: string,
): Promise<ResolvedModel | null> {
  const data = await client.query<{
    model: {
      get: {
        id: string;
        name: string;
        displayField?: string | null;
        fields?: RawPropertyField[] | null;
      } | null;
    };
  }>(MODEL_DEFINITION_BY_ID_QUERY, { id });
  if (!data.model.get) return null;
  return {
    id: data.model.get.id,
    name: data.model.get.name,
    displayField: data.model.get.displayField ?? null,
    localizedFields: localizedFieldKeys(data.model.get.fields),
  };
}

// Discounts are addressed by CODE far more often than by id - a code is what
// the shopper types and what every tool description promises. The backend only
// takes an id, so resolve the code here rather than returning "not found" for
// a discount that plainly exists.
async function resolveDiscountId(
  client: CmssyClient,
  idOrSlug: string,
): Promise<string | null> {
  if (OBJECT_ID_RE.test(idOrSlug)) return idOrSlug;
  const res = await client.query<{
    discount: { list: { items: Array<{ id: string; code: string }> } };
  }>(DISCOUNTS_QUERY, { search: idOrSlug, limit: 50, offset: 0 });
  const match = res.discount.list.items.find(
    (d) => d.code.toLowerCase() === idOrSlug.toLowerCase(),
  );
  return match?.id ?? null;
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
    model: { list: Array<{ id: string; slug: string }> };
  }>(MODEL_DEFINITIONS_BY_SLUG_INDEX_QUERY);
  const match = index.model.list.find((m) => m.slug === idOrSlug);
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
  fields?: RawPropertyField[] | null;
  product?: {
    enabled: boolean;
    variantAxes: string[];
    skuField: string;
    priceField: string;
    inventoryField: string;
  } | null;
  updatedAt?: string | null;
}

interface RawPropertyField {
  key: string;
  label: string;
  type: string;
  required?: boolean | null;
  hidden?: boolean | null;
  localized?: boolean | null;
  description?: string | null;
  defaultValue?: string | null;
  options?: string[] | null;
  fields?: RawPropertyField[] | null;
  itemType?: string | null;
  itemFields?: RawPropertyField[] | null;
  relationTo?: string | null;
  relationType?: string | null;
  acceptedTypes?: string[] | null;
  multiple?: boolean | null;
  schemaProperty?: string | null;
  minLength?: number | null;
  maxLength?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  pattern?: string | null;
}

export function toProposedFields(fields: RawPropertyField[]): ProposedField[] {
  return fields.map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type as ProposedField["type"],
    required: f.required ?? false,
    ...(f.hidden != null ? { hidden: f.hidden } : {}),
    ...(f.description != null ? { description: f.description } : {}),
    ...(f.defaultValue != null ? { defaultValue: f.defaultValue } : {}),
    ...(f.options && f.options.length > 0 ? { options: f.options } : {}),
    ...(f.itemType != null
      ? { itemType: f.itemType as ProposedField["type"] }
      : {}),
    ...(f.relationTo != null
      ? { relationTo: f.relationTo.replace(/^model:/, "") }
      : {}),
    ...(f.relationType != null
      ? { relationType: f.relationType as ProposedField["relationType"] }
      : {}),
    ...(f.acceptedTypes && f.acceptedTypes.length > 0
      ? { acceptedTypes: f.acceptedTypes }
      : {}),
    ...(f.multiple != null ? { multiple: f.multiple } : {}),
    ...(f.localized ? { localized: true } : {}),
    ...(f.schemaProperty != null ? { schemaProperty: f.schemaProperty } : {}),
    ...(f.minLength != null ? { minLength: f.minLength } : {}),
    ...(f.maxLength != null ? { maxLength: f.maxLength } : {}),
    ...(f.minValue != null ? { minValue: f.minValue } : {}),
    ...(f.maxValue != null ? { maxValue: f.maxValue } : {}),
    ...(f.pattern != null ? { pattern: f.pattern } : {}),
    ...(Array.isArray(f.fields) && f.fields.length > 0
      ? { fields: toProposedFields(f.fields) }
      : {}),
    ...(Array.isArray(f.itemFields) && f.itemFields.length > 0
      ? { itemFields: toProposedFields(f.itemFields) }
      : {}),
  }));
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
    product: m.product ?? null,
    fields: toProposedFields(m.fields ?? []),
    updatedAt: m.updatedAt ?? null,
  };
}

export function createMcpWorkspaceOps(client: CmssyClient): WorkspaceOps {
  const ws = client.workspaceId;
  return {
    models: {
      list: async () => {
        const res = await client.query<{
          model: { list: RawModelDefinition[] };
        }>(MODEL_DEFINITIONS_QUERY);
        return res.model.list.map(toModelSummary);
      },
      get: async (idOrSlug) => {
        const resolved = await resolveModel(client, idOrSlug);
        if (!resolved) return null;
        const res = await client.query<{
          model: { get: RawModelDefinition | null };
        }>(MODEL_DEFINITION_BY_ID_QUERY, { id: resolved.id });
        if (!res.model.get) return null;
        return toModelDetail(res.model.get);
      },
      listRecords: async (modelIdOrSlug, options) => {
        const model = await resolveModel(client, modelIdOrSlug);
        if (!model) return null;
        const res = await client.query<{
          record: {
            list: {
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
          items: res.record.list.items.map((r) => ({
            id: r.id,
            modelId: r.modelId,
            status: r.status ?? null,
            data: r.data ?? {},
            createdAt: r.createdAt ?? null,
            updatedAt: r.updatedAt ?? null,
          })),
          total: res.record.list.total,
          hasMore: res.record.list.hasMore,
        };
      },
      create: async (input) => {
        const mutationInput: Record<string, unknown> = {
          name: input.name,
          slug: input.slug ?? slugify(input.name),
          fields: toPropertyFields(input.fields),
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
        if (input.product !== undefined) mutationInput.product = input.product;
        const res = await client.query<{
          model: {
            create: {
              id: string;
              name: string;
              slug: string;
              fields?: unknown[] | null;
            };
          };
        }>(CREATE_MODEL_DEFINITION_MUTATION, { input: mutationInput });
        const m = res.model.create;
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
          "product",
        ] as const) {
          if (patch[key] !== undefined) input[key] = patch[key];
        }
        if (patch.expectedUpdatedAt != null) {
          input.expectedUpdatedAt = patch.expectedUpdatedAt;
        }
        if (patch.fields !== undefined) {
          input.fields = toPropertyFields(patch.fields);
        }
        const res = await client.query<{
          model: {
            update: {
              id: string;
              name: string;
              slug: string;
              fields?: unknown[] | null;
            } | null;
          };
        }>(UPDATE_MODEL_DEFINITION_MUTATION, { input });
        if (!res.model.update) return null;
        const m = res.model.update;
        return {
          id: m.id,
          name: m.name,
          slug: m.slug,
          fieldCount: m.fields?.length ?? 0,
        };
      },
      updateRecord: async (recordId, { data, status }) => {
        const recRes = await client.query<{
          record: {
            get: {
              id: string;
              modelId: string;
              data?: Record<string, unknown> | null;
            } | null;
          };
        }>(MODEL_RECORD_BY_ID_QUERY, { id: recordId });
        if (!recRes.record.get) return null;
        const rec = recRes.record.get;
        const model = await resolveModel(client, rec.modelId);
        let currentData: Record<string, unknown> = rec.data ?? {};
        if (status !== undefined) {
          const res = await client.query<{
            record: {
              setStatus: {
                id: string;
                data?: Record<string, unknown> | null;
              } | null;
            };
          }>(UPDATE_MODEL_RECORD_STATUS_MUTATION, {
            input: { id: recordId, status },
          });
          if (!res.record.setStatus) return null;
          currentData = res.record.setStatus.data ?? currentData;
        }
        if (data !== undefined) {
          const merged = mergeRecordData(
            currentData,
            data,
            model?.localizedFields ?? [],
          );
          const res = await client.query<{
            record: {
              update: {
                id: string;
                data?: Record<string, unknown> | null;
              } | null;
            };
          }>(UPDATE_MODEL_RECORD_MUTATION, {
            input: { id: recordId, data: merged },
          });
          if (!res.record.update) return null;
          currentData = res.record.update.data ?? merged;
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
        const res = await client.query<{
          record: { create: { id: string } };
        }>(CREATE_MODEL_RECORD_MUTATION, {
          input: { modelId: model.id, data },
        });
        const display = model.displayField;
        const label =
          display && typeof data[display] === "string"
            ? (data[display] as string)
            : model.name;
        return {
          id: res.record.create.id,
          label,
          modelName: model.name,
          modelId: model.id,
        };
      },
      getRecord: async (recordId) => {
        const res = await client.query<{
          record: {
            get: {
              id: string;
              modelId: string;
              status?: string | null;
              data?: Record<string, unknown> | null;
              createdAt?: string | null;
              updatedAt?: string | null;
            } | null;
          };
        }>(MODEL_RECORD_BY_ID_QUERY, { id: recordId });
        const r = res.record.get;
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
        const res = await client.query<{
          model: { delete: { deleted: boolean } };
        }>(DELETE_MODEL_DEFINITION_MUTATION, { id: model.id });
        return { deleted: Boolean(res.model.delete.deleted) };
      },
      deleteRecord: async (recordId, options) => {
        const res = await client.query<{
          record: { delete: { deleted: boolean } };
        }>(DELETE_MODEL_RECORD_MUTATION, {
          id: recordId,
          force: options?.force ?? false,
        });
        return { deleted: Boolean(res.record.delete.deleted) };
      },
      importRecords: async (modelIdOrSlug, rows) => {
        const model = await resolveModel(client, modelIdOrSlug);
        if (!model) throw new Error(`Model "${modelIdOrSlug}" not found`);
        const res = await client.query<{
          record: {
            import: {
              importedCount: number;
              errors: Array<{ row: number; message: string }>;
            };
          };
        }>(IMPORT_MODEL_RECORDS_MUTATION, {
          input: { modelId: model.id, rows },
        });
        return res.record.import;
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
          page: { save: { id: string; name: string } & WarnedWrite };
        }>(SAVE_PAGE_MUTATION, { input: mutationInput });
        return withBlockWarnings(
          { id: res.page.save.id, name: res.page.save.name },
          res.page.save.blockWarnings,
        );
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
          displayName: page.displayName ?? null,
          seoTitle: page.seoTitle ?? null,
          seoDescription: page.seoDescription ?? null,
          seoKeywords: page.seoKeywords ?? null,
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
        const res = await client.query<{
          page: { save: { id: string } & WarnedWrite };
        }>(SAVE_PAGE_MUTATION, {
          input: {
            id: pageId,
            name: page.name,
            slug: toRelativeSlug(page.slug),
            parentId: page.parentId ?? undefined,
            blocks: merged,
            expectedVersion: expectedVersionOf(page),
          },
        });
        return withBlockWarnings(
          { id: res.page.save.id },
          res.page.save.blockWarnings,
        );
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
          "parentId",
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
        if (input.fields !== undefined)
          mutationInput.fields = toPropertyFields(input.fields);
        const res = await client.query<{
          pageType: { create: { id: string; name: string; slug: string } };
        }>(CREATE_PAGE_TYPE_MUTATION, { input: mutationInput });
        return {
          id: res.pageType.create.id,
          name: res.pageType.create.name,
          slug: res.pageType.create.slug,
        };
      },
      getType: async (pageTypeId) => {
        const res = await client.query<{
          pageType: {
            get: {
              id: string;
              name: string;
              slug: string;
              description?: string | null;
              icon?: string | null;
              schemaType?: string | null;
              urlPrefix?: string | null;
              allowChildren?: boolean | null;
              allowedChildTypes?: string[] | null;
              defaultPublished?: boolean | null;
              isSystem?: boolean | null;
              fields?: Array<{
                key: string;
                label: string;
                type: string;
                required?: boolean | null;
                description?: string | null;
                options?: string[] | null;
                defaultValue?: string | null;
                multiple?: boolean | null;
                localized?: boolean | null;
              }> | null;
            } | null;
          };
        }>(PAGE_TYPE_QUERY, { pageTypeId });
        const type = res.pageType.get;
        if (!type) return null;
        return {
          id: type.id,
          name: type.name,
          slug: type.slug,
          description: type.description ?? null,
          icon: type.icon ?? null,
          urlPrefix: type.urlPrefix ?? null,
          allowChildren: Boolean(type.allowChildren),
          allowedChildTypes: type.allowedChildTypes ?? [],
          defaultPublished: Boolean(type.defaultPublished),
          schemaType: type.schemaType ?? null,
          isSystem: Boolean(type.isSystem),
          fields: (type.fields ?? []).map((field) => ({
            key: field.key,
            label: field.label,
            type: field.type,
            required: Boolean(field.required),
            description: field.description ?? null,
            options: field.options ?? [],
            defaultValue: field.defaultValue ?? null,
            multiple: field.multiple ?? null,
            localized: field.localized ?? null,
          })),
        };
      },
      updateType: async (input) => {
        const mutationInput: Record<string, unknown> = { id: input.pageTypeId };
        if (input.name !== undefined) mutationInput.name = input.name;
        if (input.slug !== undefined) mutationInput.slug = input.slug;
        if (input.description !== undefined)
          mutationInput.description = input.description;
        if (input.icon !== undefined) mutationInput.icon = input.icon;
        if (input.urlPrefix !== undefined)
          mutationInput.urlPrefix = input.urlPrefix;
        if (input.allowChildren !== undefined)
          mutationInput.allowChildren = input.allowChildren;
        if (input.fields !== undefined)
          mutationInput.fields = toPropertyFields(input.fields);
        const res = await client.query<{
          pageType: {
            update: { id: string; name: string; slug: string } | null;
          };
        }>(UPDATE_PAGE_TYPE_MUTATION, { input: mutationInput });
        const updated = res.pageType.update;
        if (!updated) throw new Error("Page type not found");
        return {
          id: updated.id,
          name: updated.name,
          slug: updated.slug,
        };
      },
      deleteType: async (pageTypeId) => {
        const res = await client.query<{
          pageType: { delete: { id: string; deleted: boolean } };
        }>(DELETE_PAGE_TYPE_MUTATION, { id: pageTypeId });
        return {
          id: res.pageType.delete.id,
          deleted: res.pageType.delete.deleted,
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
          page: { updateLayout: ({ id: string } & WarnedWrite) | null };
        }>(UPDATE_PAGE_LAYOUT_MUTATION, { input });
        if (!res.page.updateLayout) throw new Error("Page not found");
        return withBlockWarnings(
          { id: res.page.updateLayout.id },
          res.page.updateLayout.blockWarnings,
        );
      },
      addBlock: async (pageId, block, layoutPosition, position) => {
        const page = await loadPage(client, pageId);
        if (!page) throw new Error("Page not found");
        const ev = expectedVersionOf(page);
        const configData = await client.query<{
          siteConfig: {
            get: {
              defaultLanguage?: string;
              enabledLanguages?: string[];
            } | null;
          };
        }>(SITE_CONFIG_QUERY);
        const defaultLanguage =
          configData.siteConfig.get?.defaultLanguage ?? "en";
        const enabledLanguages = configData.siteConfig.get
          ?.enabledLanguages ?? [defaultLanguage];
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
            page: { updateLayout: ({ id: string } & WarnedWrite) | null };
          }>(UPDATE_PAGE_LAYOUT_MUTATION, {
            input: {
              pageId,
              layoutBlocks: [...existingLayout, newLayoutBlock],
              ...(ev !== undefined ? { expectedVersion: ev } : {}),
            },
          });
          if (!res.page.updateLayout) throw new Error("Failed to add block");
          return withBlockWarnings(
            { pageId, blockId: newBlockId },
            res.page.updateLayout.blockWarnings,
          );
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
        const saved = await client.query<{
          page: { save: WarnedWrite };
        }>(SAVE_PAGE_MUTATION, {
          input: {
            id: pageId,
            name: page.name,
            slug: toRelativeSlug(page.slug),
            parentId: page.parentId ?? undefined,
            blocks,
            expectedVersion: ev,
          },
        });
        return withBlockWarnings(
          { pageId, blockId: newBlockId },
          saved.page.save.blockWarnings,
        );
      },
      getDevDraft: async (pageId) => {
        const page = await loadPageVersion(client, pageId);
        if (!page) throw new Error("Page not found");
        const res = await client.query<{
          page: {
            devDraft: {
              pageId: string;
              updatedAt: string | null;
              blocks: unknown;
            } | null;
          };
        }>(DEV_DRAFT_QUERY, { pageId: page.id });
        const draft = res.page.devDraft;
        if (!draft) return null;
        return {
          pageId: page.id,
          blocks: draft.blocks,
          updatedAt: draft.updatedAt ?? null,
        };
      },
      saveDevDraft: async (pageId, blocks) => {
        const page = await loadPageVersion(client, pageId);
        if (!page) throw new Error("Page not found");
        await client.query(SAVE_DEV_DRAFT_MUTATION, {
          input: { pageId: page.id, blocks },
        });
        return { id: page.id };
      },
      promoteDevDraft: async (pageId) => {
        const page = await loadPageVersion(client, pageId);
        if (!page) throw new Error("Page not found");
        const res = await client.query<{
          page: { promoteDevDraft: ({ id: string } & WarnedWrite) | null };
        }>(PROMOTE_DEV_DRAFT_MUTATION, {
          input: {
            pageId: page.id,
            ...(expectedVersionOf(page) !== undefined
              ? { expectedVersion: expectedVersionOf(page) }
              : {}),
          },
        });
        if (!res.page.promoteDevDraft) {
          throw new Error("No dev draft to promote");
        }
        return withBlockWarnings(
          { id: res.page.promoteDevDraft.id },
          res.page.promoteDevDraft.blockWarnings,
        );
      },
      updateBlock: async (
        pageId,
        blockId,
        content,
        settings,
        mode = "merge",
        target,
      ) => {
        const page = await loadPage(client, pageId);
        if (!page) throw new Error("Page not found");
        if (target === "devDraft") {
          const overlay = await client.query<{
            page: {
              devDraft: {
                blocks: Array<Record<string, unknown> & { id: string }>;
              } | null;
            };
          }>(DEV_DRAFT_QUERY, { pageId: page.id });
          const base = overlay.page.devDraft?.blocks ?? page.blocks ?? [];
          const idx = base.findIndex((b) => b.id === blockId);
          if (idx === -1) {
            throw new Error("Block not found in the dev draft");
          }
          const blocks = [...base];
          blocks[idx] = applyBlockUpdate(
            { ...blocks[idx]! },
            content,
            settings,
            mode,
          );
          await client.query(SAVE_DEV_DRAFT_MUTATION, {
            input: { pageId: page.id, blocks },
          });
          return { pageId: page.id, blockId };
        }
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
        targetArray[targetIndex] = applyBlockUpdate(
          { ...targetArray[targetIndex] } as Record<string, unknown> & {
            id: string;
          },
          content,
          settings,
          mode,
        );
        let blockWarnings: string[] | null | undefined;
        if (isLayout) {
          const res = await client.query<{
            page: { updateLayout: ({ id: string } & WarnedWrite) | null };
          }>(UPDATE_PAGE_LAYOUT_MUTATION, {
            input: {
              pageId,
              layoutBlocks: targetArray,
              ...(ev !== undefined ? { expectedVersion: ev } : {}),
            },
          });
          if (!res.page.updateLayout) throw new Error("Failed to update block");
          blockWarnings = res.page.updateLayout.blockWarnings;
        } else {
          const res = await client.query<{
            page: { save: WarnedWrite };
          }>(SAVE_PAGE_MUTATION, {
            input: {
              id: pageId,
              name: page.name,
              slug: toRelativeSlug(page.slug),
              parentId: page.parentId ?? undefined,
              blocks: targetArray,
              expectedVersion: ev,
            },
          });
          blockWarnings = res.page.save.blockWarnings;
        }
        return withBlockWarnings({ pageId, blockId }, blockWarnings);
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
          page: { patchBlockContent: ({ id: string } & WarnedWrite) | null };
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
        return withBlockWarnings(
          { pageId, blockId },
          res.page.patchBlockContent.blockWarnings,
        );
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
          media: {
            list: {
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
          };
        }>(MEDIA_ASSETS_QUERY, { limit, offset });
        return {
          items: res.media.list.items.map((m) => ({
            id: m.id,
            filename: m.filename,
            type: m.type,
            url: m.url ?? null,
            mimeType: m.mimeType ?? null,
            size: m.size ?? null,
          })),
          total: res.media.list.total,
          hasMore: res.media.list.hasMore,
        };
      },
      upload: async (input) => {
        const { bytes, filename, mimeType } = await resolveUploadSource(input);
        const auth = await client.query<{
          media: {
            authorizeUpload: { pathname: string; uploadUrl: string };
          };
        }>(AUTHORIZE_MEDIA_UPLOAD_MUTATION, {
          filename,
          mimeType,
          size: bytes.byteLength,
        });
        const { pathname, uploadUrl } = auth.media.authorizeUpload;

        await putObject(uploadUrl, bytes, mimeType);

        const registered = await client.query<{
          media: {
            upload: {
              id: string;
              url: string | null;
              filename: string;
              type: string;
              mimeType: string | null;
              size: number | null;
            };
          };
        }>(REGISTER_MEDIA_UPLOAD_MUTATION, {
          input: {
            pathname,
            filename,
            type: mediaTypeFromMime(mimeType),
            mimeType,
            size: bytes.byteLength,
            ...(input.folderId ? { folderId: input.folderId } : {}),
            ...(input.tags?.length ? { tags: input.tags } : {}),
          },
        });
        const asset = registered.media.upload;

        if (input.alt) {
          const configData = await client.query<{
            siteConfig: { get: { defaultLanguage?: string } | null };
          }>(SITE_CONFIG_QUERY);
          const locale =
            configData.siteConfig.get?.defaultLanguage ?? "en";
          await client.query<{ media: { update: { id: string } | null } }>(
            UPDATE_MEDIA_MUTATION,
            { id: asset.id, input: { alt: { [locale]: input.alt } } },
          );
        }

        return {
          id: asset.id,
          filename: asset.filename,
          type: asset.type,
          url: asset.url ?? null,
          mimeType: asset.mimeType ?? null,
          size: asset.size ?? null,
        };
      },
      listFolders: async (parentId) => {
        const res = await client.query<{
          media: {
            folders: {
              items: Array<{
                id: string;
                name: string;
                parentId?: string | null;
              }>;
              total: number;
            };
          };
        }>(MEDIA_FOLDERS_QUERY, { parentId: parentId ?? null });
        return {
          items: res.media.folders.items.map((f) => ({
            id: f.id,
            name: f.name,
            parentId: f.parentId ?? null,
          })),
          total: res.media.folders.total,
        };
      },
      createFolder: async (input) => {
        const res = await client.query<{
          media: {
            createFolder: {
              id: string;
              name: string;
              parentId?: string | null;
            };
          };
        }>(CREATE_MEDIA_FOLDER_MUTATION, {
          input: {
            name: input.name,
            ...(input.parentId ? { parentId: input.parentId } : {}),
          },
        });
        const f = res.media.createFolder;
        return { id: f.id, name: f.name, parentId: f.parentId ?? null };
      },
      updateFolder: async (id, input) => {
        const res = await client.query<{
          media: {
            updateFolder: {
              id: string;
              name: string;
              parentId?: string | null;
            };
          };
        }>(UPDATE_MEDIA_FOLDER_MUTATION, {
          id,
          input: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.parentId !== undefined
              ? { parentId: input.parentId }
              : {}),
          },
        });
        const f = res.media.updateFolder;
        return { id: f.id, name: f.name, parentId: f.parentId ?? null };
      },
      deleteFolder: async (id, deleteContents) => {
        const res = await client.query<{
          media: { deleteFolder: { id: string; deleted: boolean } };
        }>(DELETE_MEDIA_FOLDER_MUTATION, {
          id,
          deleteContents: deleteContents ?? false,
        });
        return {
          id: res.media.deleteFolder.id,
          deleted: res.media.deleteFolder.deleted,
        };
      },
      move: async (ids, folderId) => {
        // The backend moves one asset per update(id, {folderId}); loop the ids.
        for (const id of ids) {
          await client.query<{ media: { update: { id: string } | null } }>(
            UPDATE_MEDIA_MUTATION,
            { id, input: { folderId } },
          );
        }
        return { moved: ids.length, folderId };
      },
    },
    forms: {
      list: async (options) => {
        const res = await client.query<{
          form: {
            list: {
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
          };
        }>(FORMS_QUERY, {
          status: options?.status,
          skip: options?.skip,
          limit: options?.limit,
        });
        return {
          items: res.form.list.forms.map((f) => ({
            id: f.id,
            name: f.name,
            slug: f.slug ?? null,
            status: f.status,
            submissionCount: f.submissionCount ?? null,
          })),
          total: res.form.list.total,
          hasMore: res.form.list.hasMore,
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
          form: { create: { id: string; name: string } };
        }>(CREATE_FORM_MUTATION, { input: mutationInput });
        return { id: res.form.create.id, name: res.form.create.name };
      },
      get: async (idOrSlug) => {
        const res = await client.query<{
          form: {
            get: {
              id: string;
              name: string;
              slug: string;
              status?: string | null;
              fields?: unknown;
              settings?: unknown;
              submissionCount?: number | null;
            } | null;
          };
        }>(FORM_BY_ID_QUERY, { formId: idOrSlug });
        const f = res.form.get;
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
          form: { update: { id: string } | null };
        }>(UPDATE_FORM_MUTATION, { formId: idOrSlug, input });
        return res.form.update ? { id: res.form.update.id } : null;
      },
      delete: async (idOrSlug) => {
        const res = await client.query<{
          form: { delete: { deleted: boolean } };
        }>(DELETE_FORM_MUTATION, { formId: idOrSlug });
        return { deleted: Boolean(res.form.delete.deleted) };
      },
      listSubmissions: async (options) => {
        const res = await client.query<{ form: { submissions: unknown } }>(
          FORM_SUBMISSIONS_QUERY,
          {
            ...(options?.formIdOrSlug ? { formId: options.formIdOrSlug } : {}),
            ...(options?.status ? { status: options.status } : {}),
            skip: options?.skip ?? 0,
            limit: options?.limit ?? 50,
          },
        );
        return res.form.submissions;
      },
      getSubmission: async (submissionId) => {
        const res = await client.query<{ form: { submission: unknown } }>(
          FORM_SUBMISSION_BY_ID_QUERY,
          { submissionId },
        );
        return res.form.submission;
      },
      updateSubmissionStatus: async (submissionId, status) => {
        const res = await client.query<{
          form: { setSubmissionStatus: boolean };
        }>(UPDATE_FORM_SUBMISSION_STATUS_MUTATION, { submissionId, status });
        return { ok: Boolean(res.form.setSubmissionStatus) };
      },
      deleteSubmission: async (submissionId) => {
        const res = await client.query<{
          form: { deleteSubmission: { deleted: boolean } };
        }>(DELETE_FORM_SUBMISSION_MUTATION, { submissionId });
        return { deleted: Boolean(res.form.deleteSubmission.deleted) };
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
                poNumber?: string | null;
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
            poNumber: o.poNumber ?? null,
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
              subtotal?: number | null;
              discount?: number | null;
              appliedDiscount?: {
                code: string;
                type: string;
                value: number;
                amount: number;
              } | null;
              shippingTotal?: number | null;
              shippingMethod?: unknown;
              tax?: number | null;
              total?: number | null;
              currency?: string | null;
              poNumber?: string | null;
              customerNote?: string | null;
              shippingAddress?: unknown;
              amountPaid?: number | null;
              balanceDue?: number | null;
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
          subtotal: o.subtotal ?? null,
          discount: o.discount ?? null,
          appliedDiscount: o.appliedDiscount ?? null,
          shippingTotal: o.shippingTotal ?? null,
          shippingMethod: o.shippingMethod ?? null,
          tax: o.tax ?? null,
          total: o.total ?? null,
          currency: o.currency ?? null,
          poNumber: o.poNumber ?? null,
          customerNote: o.customerNote ?? null,
          shippingAddress: o.shippingAddress ?? null,
          amountPaid: o.amountPaid ?? null,
          balanceDue: o.balanceDue ?? null,
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
        const id = await resolveDiscountId(client, idOrSlug);
        if (!id) return null;
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
        }>(DISCOUNT_BY_ID_QUERY, { id });
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
        const id = await resolveDiscountId(client, idOrSlug);
        if (!id) return null;
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
        }>(UPDATE_DISCOUNT_MUTATION, { id, input });
        if (!res.discount.update) return null;
        return {
          id: res.discount.update.id,
          code: res.discount.update.code,
          enabled: res.discount.update.enabled,
        };
      },
      setEnabled: async (idOrSlug, enabled) => {
        const id = await resolveDiscountId(client, idOrSlug);
        if (!id) return null;
        const res = await client.query<{
          discount: {
            setEnabled: {
              id: string;
              code: string;
              enabled: boolean;
            } | null;
          };
        }>(SET_DISCOUNT_ENABLED_MUTATION, {
          id,
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
          workspace: { current: Workspace | null };
        }>(CURRENT_WORKSPACE_QUERY);
        const w = res.workspace.current;
        if (!w) throw new Error("Workspace not found");
        return {
          id: w.id,
          name: w.name,
          slug: w.slug,
          plan: w.organization?.plan ?? null,
          limits: w.organization?.limits ?? null,
        };
      },
      siteConfig: async () => {
        const res = await client.query<{
          siteConfig: {
            get: {
              id?: string | null;
              defaultLanguage?: string | null;
              enabledLanguages?: string[];
              siteName?: string | null;
              enabledFeatures?: string[];
              cart?: unknown;
            } | null;
          };
        }>(SITE_CONFIG_QUERY);
        const c = res.siteConfig.get;
        if (!c) return null;
        return {
          id: c.id ?? null,
          defaultLanguage: c.defaultLanguage ?? null,
          enabledLanguages: c.enabledLanguages ?? [],
          siteName: c.siteName ?? null,
          enabledFeatures: c.enabledFeatures ?? [],
          cart: c.cart ?? null,
        };
      },
      blockManifest: async () => {
        const res = await client.query<{
          blockManifest: {
            get: {
              blocks?: unknown;
              hash: string;
              updatedAt: string;
            } | null;
          };
        }>(BLOCK_MANIFEST_QUERY);
        const m = res.blockManifest.get;
        if (!m) return null;
        const blocks = (Array.isArray(m.blocks) ? m.blocks : []).filter(
          (entry): entry is BlockTypeDefinition =>
            typeof entry === "object" &&
            entry !== null &&
            !Array.isArray(entry),
        );
        return { blocks, hash: m.hash, updatedAt: m.updatedAt };
      },
      updateCartConfig: async (input) => {
        const res = await client.query<{
          siteConfig: { updateCart: unknown };
        }>(UPDATE_CART_CONFIG_MUTATION, { input });
        return res.siteConfig.updateCart;
      },
      clearCartConfig: async (options) => {
        const res = await client.query<{
          siteConfig: { clearCart: unknown };
        }>(CLEAR_CART_CONFIG_MUTATION, { force: options?.force ?? false });
        return res.siteConfig.clearCart;
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
        const res = await client.query<{ product: { list: unknown } }>(
          PRODUCT_CATALOG_QUERY,
          { modelId, filter, limit, offset, sort },
        );
        return res.product.list;
      },
      bulkUpdate: async (modelId, selection, patch) => {
        const res = await client.query<{ product: { bulkUpdate: number } }>(
          BULK_UPDATE_PRODUCT_RECORDS_MUTATION,
          { modelId, selection, patch },
        );
        return { count: res.product.bulkUpdate };
      },
      bulkDelete: async (modelId, selection) => {
        const res = await client.query<{ product: { bulkDelete: number } }>(
          BULK_DELETE_PRODUCT_RECORDS_MUTATION,
          { modelId, selection },
        );
        return { count: res.product.bulkDelete };
      },
      setTiers: async (recordId, tiers) => {
        const res = await client.query<{ product: { setTiers: unknown } }>(
          SET_PRODUCT_TIERS_MUTATION,
          { input: { recordId, tiers } },
        );
        return res.product.setTiers;
      },
    },
    members: {
      list: async (options) => {
        const res = await client.query<{
          user: {
            list: Array<{
              id: string;
              email?: string | null;
              username?: string | null;
              profile?: { displayName?: string | null } | null;
              membershipStatus?: string | null;
              isOrganizationOwner?: boolean | null;
              joinedAt?: string | null;
              workspaceRole?: { id: string; name: string } | null;
            }>;
          };
        }>(MEMBERS_QUERY);
        let items = res.user.list.map((u) => ({
          userId: u.id,
          email: u.email ?? null,
          name: u.profile?.displayName ?? u.username ?? null,
          roleId: u.workspaceRole?.id ?? "",
          roleName: u.workspaceRole?.name ?? null,
          status: u.membershipStatus ?? "",
          isOwner: u.isOrganizationOwner ?? false,
          invitedAt: null,
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
          role: {
            list: Array<{
              id: string;
              name: string;
              slug: string;
              permissions: string[];
              isDefault: boolean;
              isSystem: boolean;
            }>;
          };
        }>(ROLES_QUERY);
        return res.role.list.map((r) => ({
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
