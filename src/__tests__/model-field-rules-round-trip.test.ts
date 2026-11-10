import { describe, expect, it, vi } from "vitest";
import { getModelTool, updateModelTool } from "@cmssy/ai-tools";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";
import {
  MODEL_DEFINITION_BY_ID_QUERY,
  MODEL_DEFINITIONS_QUERY,
  PAGE_TYPE_QUERY,
  UPDATE_MODEL_DEFINITION_MUTATION,
  UPDATE_PAGE_TYPE_MUTATION,
} from "../queries.js";

const RULE_KEYS = [
  "minItems",
  "maxItems",
  "maxDecimals",
  "maxSize",
  "validationMessage",
] as const;

type Sent = { document: string; variables: Record<string, unknown> };

function clientRecording(respond: (document: string) => unknown) {
  const sent: Sent[] = [];
  const query = vi.fn(async (document: string, variables?: unknown) => {
    sent.push({
      document,
      variables: (variables ?? {}) as Record<string, unknown>,
    });
    return respond(document);
  });
  return { client: { query } as unknown as CmssyClient, sent };
}

const MODEL_ID = "64b000000000000000000001";

const storedFields = [
  {
    key: "price",
    label: { en: "Price" },
    type: "number",
    required: true,
    maxDecimals: 2,
    validationMessage: "Price takes at most two decimals",
  },
  {
    key: "photos",
    label: { en: "Photos" },
    type: "media",
    required: false,
    multiple: true,
    minItems: 1,
    maxItems: 6,
    maxSize: 2.5,
  },
  {
    key: "variants",
    label: { en: "Variants" },
    type: "list",
    required: false,
    itemType: "object",
    minItems: 0,
    maxItems: 10,
    itemFields: [
      {
        key: "weight",
        label: { en: "Weight" },
        type: "number",
        required: false,
        maxDecimals: 3,
        validationMessage: "Weight in kg",
      },
    ],
  },
  {
    key: "specs",
    label: { en: "Specs" },
    type: "object",
    required: false,
    fields: [
      {
        key: "manuals",
        label: { en: "Manuals" },
        type: "file",
        required: false,
        multiple: true,
        maxItems: 3,
        maxSize: 10,
        validationMessage: "Up to three manuals",
      },
    ],
  },
];

const nullRules = {
  minItems: null,
  maxItems: null,
  maxDecimals: null,
  maxSize: null,
  validationMessage: null,
};

const storedWithBackendNulls = storedFields.map((field) => ({
  ...nullRules,
  ...field,
}));

const modelRow = {
  id: MODEL_ID,
  name: "Product",
  slug: "product",
  description: null,
  icon: null,
  color: null,
  displayField: null,
  recordCount: 0,
  defaultSort: null,
  statusField: null,
  fields: storedWithBackendNulls,
};

function modelClient() {
  return clientRecording(() => ({
    model: {
      get: modelRow,
      update: { id: MODEL_ID, name: "Product", slug: "product", fields: [] },
    },
  }));
}

function sentFields(sent: Sent[]) {
  const update = sent.find(
    (s) => s.document === UPDATE_MODEL_DEFINITION_MUTATION,
  );
  return (update!.variables.input as { fields: unknown }).fields;
}

describe("field validation rules survive get_model -> update_model (CMS-2219)", () => {
  it("selects the five rule keys in model and page-type field selections", () => {
    for (const document of [
      MODEL_DEFINITION_BY_ID_QUERY,
      MODEL_DEFINITIONS_QUERY,
      PAGE_TYPE_QUERY,
    ]) {
      for (const key of RULE_KEYS) {
        expect(
          document,
          `A field selection no longer reads "${key}", so the next edit sends the field back without it.`,
        ).toMatch(new RegExp(`\\b${key}\\b`));
      }
    }
  });

  it("returns the rules from get_model, nested ones included, with backend nulls dropped", async () => {
    const { client } = modelClient();
    const ops = createMcpWorkspaceOps(client);

    const model = (await getModelTool.execute({ idOrSlug: MODEL_ID }, ops)) as {
      fields: unknown;
    };

    expect(model.fields).toStrictEqual(storedFields);
  });

  it("keeps every unlisted field's rules when update_model adds another field", async () => {
    const { client, sent } = modelClient();
    const ops = createMcpWorkspaceOps(client);

    await updateModelTool.execute(
      {
        idOrSlug: MODEL_ID,
        fields: [
          { key: "sku", label: { en: "SKU" }, type: "text", required: false },
        ],
      },
      ops,
    );

    expect(
      sentFields(sent),
      "update_model merges unlisted fields from get_model; a rule lost on read is a rule deleted on write.",
    ).toStrictEqual([
      ...storedFields,
      { key: "sku", label: { en: "SKU" }, type: "text", required: false },
    ]);
  });

  it("sends a field copied from get_model back with its rules unchanged", async () => {
    const { client, sent } = modelClient();
    const ops = createMcpWorkspaceOps(client);

    const model = (await getModelTool.execute({ idOrSlug: MODEL_ID }, ops)) as {
      fields: Array<{ key: string }>;
    };
    const variants = model.fields.find((f) => f.key === "variants")!;

    await updateModelTool.execute(
      {
        idOrSlug: MODEL_ID,
        fields: [{ ...variants, label: { en: "Options" } }] as never,
      },
      ops,
    );

    expect(sentFields(sent)).toStrictEqual([
      storedFields[0],
      storedFields[1],
      { ...storedFields[2], label: { en: "Options" } },
      storedFields[3],
    ]);
  });

  it("keeps the rules through get_page_type -> update_page_type", async () => {
    const written = { id: "pt1", name: "Post", slug: "post" };
    const { client, sent } = clientRecording((document) =>
      document === PAGE_TYPE_QUERY
        ? { pageType: { get: { ...written, fields: storedWithBackendNulls } } }
        : { pageType: { update: written } },
    );
    const ops = createMcpWorkspaceOps(client);

    const detail = await ops.pages.getType("pt1");
    expect(detail?.fields).toStrictEqual(storedFields);

    await ops.pages.updateType({ pageTypeId: "pt1", fields: detail!.fields });

    const update = sent.find((s) => s.document === UPDATE_PAGE_TYPE_MUTATION);
    expect(
      (update!.variables.input as { fields: unknown }).fields,
    ).toStrictEqual(storedFields);
  });
});
