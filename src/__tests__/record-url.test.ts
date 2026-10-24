import { describe, expect, it, vi } from "vitest";

import { createMcpWorkspaceOps } from "../ai-tools-ops.js";
import type { CmssyClient } from "../graphql-client.js";

interface Sent {
  document: string;
  variables: Record<string, unknown>;
}

function clientAnswering(answers: unknown[]) {
  const sent: Sent[] = [];
  const query = vi.fn(async (document: string, variables?: unknown) => {
    sent.push({
      document,
      variables: (variables ?? {}) as Record<string, unknown>,
    });
    return answers.shift();
  });
  return { client: { query } as unknown as CmssyClient, sent };
}

const MODEL_ID = "64b1f0c2a3d4e5f60718293a";
const RECORD_ID = "64b1f0c2a3d4e5f60718293b";
const MODEL = {
  id: MODEL_ID,
  name: "Product",
  slug: "product",
  displayField: "title",
  fields: [],
};

describe("record url from the server's publicUrl", () => {
  it("lists records with each url, asking in the tool's locale", async () => {
    const { client, sent } = clientAnswering([
      { model: { get: MODEL } },
      {
        record: {
          list: {
            items: [
              {
                id: RECORD_ID,
                modelId: MODEL_ID,
                published: true,
                data: {},
                publicUrl: "https://shop.test/pl/p/czajnik",
              },
              {
                id: "r2",
                modelId: MODEL_ID,
                published: false,
                data: {},
                publicUrl: null,
              },
            ],
            total: 2,
            hasMore: false,
          },
        },
      },
    ]);

    const list = await createMcpWorkspaceOps(client).models.listRecords(
      MODEL_ID,
      { locale: "pl" },
    );

    expect(list?.items.map((item) => item.url)).toEqual([
      "https://shop.test/pl/p/czajnik",
      null,
    ]);
    const request = sent[sent.length - 1]!;
    expect(request.variables.locale).toBe("pl");
    expect(request.document).toContain("publicUrl(locale: $locale)");
  });

  it("returns url on get_record and create_record", async () => {
    const { client } = clientAnswering([
      {
        record: {
          get: {
            id: RECORD_ID,
            modelId: MODEL_ID,
            published: true,
            data: {},
            publicUrl: "https://shop.test/p/a",
          },
        },
      },
      { model: { get: MODEL } },
      {
        record: {
          create: { id: RECORD_ID, publicUrl: "https://shop.test/p/b" },
        },
      },
    ]);
    const ops = createMcpWorkspaceOps(client);

    expect((await ops.models.getRecord(RECORD_ID))?.url).toBe(
      "https://shop.test/p/a",
    );
    expect((await ops.models.createRecord(MODEL_ID, { title: "B" }))?.url).toBe(
      "https://shop.test/p/b",
    );
  });

  it("returns the url after the last write of update_record", async () => {
    const { client } = clientAnswering([
      {
        record: {
          get: {
            id: RECORD_ID,
            modelId: MODEL_ID,
            data: {},
            publicUrl: "https://shop.test/p/old",
          },
        },
      },
      { model: { get: MODEL } },
      {
        record: {
          patch: {
            id: RECORD_ID,
            data: { title: "New" },
            publicUrl: "https://shop.test/p/new",
          },
        },
      },
      { record: { setPublished: { id: RECORD_ID, publicUrl: null } } },
    ]);

    const result = await createMcpWorkspaceOps(client).models.updateRecord(
      RECORD_ID,
      { data: { title: "New" }, published: false },
    );

    expect(
      result?.url,
      "Unpublishing last means the record has no live page any more",
    ).toBeNull();
  });

  it("maps the catalog's publicUrl to url", async () => {
    const { client } = clientAnswering([
      {
        product: {
          list: {
            items: [{ id: RECORD_ID, publicUrl: "https://shop.test/p/c" }],
            total: 1,
          },
        },
      },
    ]);

    const list = (await createMcpWorkspaceOps(client).products.list(
      MODEL_ID,
    )) as { items: Array<Record<string, unknown>> };

    expect(list.items).toEqual([
      { id: RECORD_ID, url: "https://shop.test/p/c" },
    ]);
  });

  it("returns the model's urlPattern on get_model", async () => {
    const { client } = clientAnswering([
      { model: { get: MODEL } },
      { model: { get: { ...MODEL, urlPattern: "/p/{title}" } } },
    ]);

    expect(
      (await createMcpWorkspaceOps(client).models.get(MODEL_ID))?.urlPattern,
    ).toBe("/p/{title}");
  });
});
