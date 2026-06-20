import type { CmssyClient } from "./graphql-client.js";
import type { WorkspaceOps } from "@cmssy/ai-tools";
import {
  MODEL_DEFINITION_BY_ID_QUERY,
  MODEL_DEFINITIONS_BY_SLUG_INDEX_QUERY,
  CREATE_MODEL_RECORD_MUTATION,
  CREATE_DISCOUNT_MUTATION,
  SAVE_PAGE_MUTATION,
  CREATE_FORM_MUTATION,
  CREATE_MODEL_DEFINITION_MUTATION,
  UPDATE_MODEL_DEFINITION_MUTATION,
  MODEL_RECORD_BY_ID_QUERY,
  UPDATE_MODEL_RECORD_MUTATION,
  UPDATE_MODEL_RECORD_STATUS_MUTATION,
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

function notBound(name: string): never {
  throw new Error(
    `@cmssy/ai-tools op "${name}" is not bound on the MCP server yet`,
  );
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

export function createMcpWorkspaceOps(client: CmssyClient): WorkspaceOps {
  return {
    models: {
      list: () => notBound("models.list"),
      get: () => notBound("models.get"),
      listRecords: () => notBound("models.listRecords"),
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
    },
    pages: {
      search: () => notBound("pages.search"),
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
          savePage: { id: string; name: string };
        }>(SAVE_PAGE_MUTATION, { input: mutationInput });
        return { id: res.savePage.id, name: res.savePage.name };
      },
    },
    media: { list: () => notBound("media.list") },
    forms: {
      list: () => notBound("forms.list"),
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
    },
    orders: { list: () => notBound("orders.list") },
    discounts: {
      list: () => notBound("discounts.list"),
      create: async (input) => {
        const res = await client.query<{
          createDiscount: { id: string; code: string };
        }>(CREATE_DISCOUNT_MUTATION, {
          workspaceId: client.workspaceId,
          input,
        });
        return { id: res.createDiscount.id, code: res.createDiscount.code };
      },
    },
  };
}
