import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";
import { PAGE_TYPE_QUERY, UPDATE_PAGE_TYPE_MUTATION } from "../queries.js";

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

const storedFields = [
  {
    key: "seo",
    label: "SEO",
    type: "object",
    required: false,
    hidden: true,
    localized: null,
    description: null,
    defaultValue: null,
    options: [],
    fields: [
      {
        key: "title",
        label: "Title",
        type: "text",
        required: true,
        localized: true,
        minLength: 3,
        maxLength: 60,
      },
      { key: "noindex", label: "No index", type: "boolean", required: false },
    ],
    itemType: null,
    itemFields: null,
    relationTo: null,
    relationType: null,
    acceptedTypes: [],
    multiple: null,
    schemaProperty: null,
    minLength: null,
    maxLength: null,
    minValue: null,
    maxValue: null,
    pattern: null,
  },
  {
    key: "slugPart",
    label: "Slug part",
    type: "text",
    required: false,
    pattern: "^[a-z0-9-]+$",
    schemaProperty: "identifier",
  },
  {
    key: "gallery",
    label: "Gallery",
    type: "media",
    required: false,
    acceptedTypes: ["image", "video"],
    multiple: true,
  },
  {
    key: "faq",
    label: "FAQ",
    type: "list",
    required: false,
    itemType: "object",
    itemFields: [
      { key: "q", label: "Question", type: "text", required: true },
      {
        key: "author",
        label: "Author",
        type: "relation",
        required: false,
        relationTo: "model:author",
        relationType: "hasOne",
      },
    ],
  },
  {
    key: "related",
    label: "Related",
    type: "relation",
    required: false,
    relationTo: "pages",
    relationType: "hasMany",
    minValue: 0,
    maxValue: 10,
  },
];

const roundTripped = [
  {
    key: "seo",
    label: "SEO",
    type: "object",
    required: false,
    hidden: true,
    fields: [
      {
        key: "title",
        label: "Title",
        type: "text",
        required: true,
        localized: true,
        minLength: 3,
        maxLength: 60,
      },
      { key: "noindex", label: "No index", type: "boolean", required: false },
    ],
  },
  {
    key: "slugPart",
    label: "Slug part",
    type: "text",
    required: false,
    schemaProperty: "identifier",
    pattern: "^[a-z0-9-]+$",
  },
  {
    key: "gallery",
    label: "Gallery",
    type: "media",
    required: false,
    acceptedTypes: ["image", "video"],
    multiple: true,
  },
  {
    key: "faq",
    label: "FAQ",
    type: "list",
    required: false,
    itemType: "object",
    itemFields: [
      { key: "q", label: "Question", type: "text", required: true },
      {
        key: "author",
        label: "Author",
        type: "relation",
        required: false,
        relationTo: "model:author",
        relationType: "hasOne",
      },
    ],
  },
  {
    key: "related",
    label: "Related",
    type: "relation",
    required: false,
    relationTo: "pages",
    relationType: "hasMany",
    minValue: 0,
    maxValue: 10,
  },
];

const written = { id: "pt1", name: "Post", slug: "post" };

describe("page-type field schema survives a get_page_type -> update_page_type cycle (CMS-1742)", () => {
  it("asks the backend for every PropertyField key, the same selection the model query uses", () => {
    for (const key of [
      "hidden",
      "fields",
      "itemType",
      "itemFields",
      "acceptedTypes",
      "schemaProperty",
      "minLength",
      "maxLength",
      "minValue",
      "maxValue",
      "pattern",
    ]) {
      expect(
        PAGE_TYPE_QUERY,
        `PAGE_TYPE_QUERY no longer selects "${key}", so get_page_type cannot hand it back and the next update_page_type drops it.`,
      ).toMatch(new RegExp(`\\b${key}\\b`));
    }
  });

  it("returns the full vocabulary from get_page_type and sends it back unchanged through update_page_type", async () => {
    const { client, sent } = clientRecording((document) =>
      document === PAGE_TYPE_QUERY
        ? { pageType: { get: { ...written, fields: storedFields } } }
        : { pageType: { update: written } },
    );
    const ops = createMcpWorkspaceOps(client);

    const detail = await ops.pages.getType("pt1");
    expect(
      detail?.fields,
      "get_page_type must surface nested fields, itemFields, hidden, acceptedTypes, schemaProperty and validation, with backend nulls dropped rather than echoed.",
    ).toStrictEqual(roundTripped);

    await ops.pages.updateType({ pageTypeId: "pt1", fields: detail!.fields });

    expect(sent[1]!.document).toBe(UPDATE_PAGE_TYPE_MUTATION);
    expect(
      (sent[1]!.variables.input as { fields: unknown }).fields,
      "The documented edit cycle sends get_page_type's output straight back; anything lost between the two calls is a silent schema downgrade on the page type.",
    ).toStrictEqual(roundTripped);
  });

  it("keeps a page-type relation target verbatim, because 'pages' is a collection and 'model:author' is a model", async () => {
    const { client } = clientRecording(() => ({
      pageType: { get: { ...written, fields: storedFields } },
    }));

    const detail = await createMcpWorkspaceOps(client).pages.getType("pt1");
    const targets = detail!.fields
      .flatMap((field) => [field, ...(field.itemFields ?? [])])
      .filter((field) => field.type === "relation")
      .map((field) => field.relationTo);

    expect(targets).toStrictEqual(["model:author", "pages"]);
  });
});
