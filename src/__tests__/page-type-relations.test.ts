import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";
import {
  CREATE_PAGE_TYPE_MUTATION,
  PAGE_TYPE_QUERY,
  UPDATE_PAGE_TYPE_MUTATION,
} from "../queries.js";

type Sent = { document: string; variables: Record<string, unknown> };

function clientRecording(respond: () => unknown) {
  const sent: Sent[] = [];
  const query = vi.fn(async (document: string, variables?: unknown) => {
    sent.push({
      document,
      variables: (variables ?? {}) as Record<string, unknown>,
    });
    return respond();
  });
  return { client: { query } as unknown as CmssyClient, sent };
}

function sentFields(sent: Sent[]) {
  const input = sent[0]!.variables.input as {
    fields: Array<Record<string, unknown>>;
  };
  return input.fields;
}

const relation = {
  key: "related",
  label: "Related",
  type: "relation" as const,
  required: false,
  relationTo: "pages",
  relationType: "hasMany" as const,
};

const written = { id: "pt1", name: "Post", slug: "post" };

describe("page-type relation fields through the MCP ops (CMS-1686)", () => {
  it("create_page_type sends relationTo exactly as given - a collection is not a model", async () => {
    const { client, sent } = clientRecording(() => ({
      pageType: { create: written },
    }));

    await createMcpWorkspaceOps(client).pages.createType({
      name: "Post",
      slug: "post",
      fields: [relation],
    });

    expect(sent[0]!.document).toBe(CREATE_PAGE_TYPE_MUTATION);
    expect(sentFields(sent)[0]).toMatchObject({
      relationTo: "pages",
      relationType: "hasMany",
    });
  });

  it("update_page_type sends relationTo exactly as given", async () => {
    const { client, sent } = clientRecording(() => ({
      pageType: { update: written },
    }));

    await createMcpWorkspaceOps(client).pages.updateType({
      pageTypeId: "pt1",
      fields: [relation],
    });

    expect(sent[0]!.document).toBe(UPDATE_PAGE_TYPE_MUTATION);
    expect(sentFields(sent)[0]).toMatchObject({
      relationTo: "pages",
      relationType: "hasMany",
    });
  });

  it("get_page_type asks for and returns the relation target and cardinality", async () => {
    const { client, sent } = clientRecording(() => ({
      pageType: {
        get: {
          ...written,
          fields: [
            {
              key: "author",
              label: "Author",
              type: "relation",
              relationTo: "model:author",
              relationType: "manyToMany",
            },
          ],
        },
      },
    }));

    const detail = await createMcpWorkspaceOps(client).pages.getType("pt1");

    expect(sent[0]!.document).toBe(PAGE_TYPE_QUERY);
    expect(PAGE_TYPE_QUERY).toMatch(/relationTo\s+relationType/);
    expect(detail?.fields[0]).toMatchObject({
      relationTo: "model:author",
      relationType: "manyToMany",
    });
  });

  it("get_page_type omits relationTo and relationType on a field that has no relation", async () => {
    const { client } = clientRecording(() => ({
      pageType: {
        get: {
          ...written,
          fields: [{ key: "title", label: "Title", type: "text" }],
        },
      },
    }));

    const detail = await createMcpWorkspaceOps(client).pages.getType("pt1");

    expect(detail?.fields[0]).toStrictEqual({
      key: "title",
      label: "Title",
      type: "text",
      required: false,
    });
  });
});
