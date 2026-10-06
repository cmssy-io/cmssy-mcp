import { describe, expect, it } from "vitest";

import {
  checker,
  collectCallSites,
  fixtureSelectionCheck,
  readersByDocument,
  unreadableByEveryReader,
} from "./operation-contract.js";

const ALLOWED: Record<string, number> = {
  ORDER_BY_ID_QUERY: 19,
  UPDATE_PAGE_SETTINGS_MUTATION: 13,
  CREATE_DISCOUNT_MUTATION: 11,
  UPDATE_FORM_MUTATION: 11,
  CREATE_FORM_MUTATION: 10,
  SET_DISCOUNT_ENABLED_MUTATION: 10,
  UPDATE_DISCOUNT_MUTATION: 10,
  CREATE_MODEL_RECORD_MUTATION: 8,
  ORDERS_QUERY: 8,
  DISCOUNTS_QUERY: 7,
  FORMS_QUERY: 7,
  PAGE_BY_ID_QUERY: 7,
  PATCH_MODEL_RECORD_MUTATION: 7,
  UPDATE_MODEL_RECORD_STATUS_MUTATION: 7,
  CREATE_PAGE_TYPE_MUTATION: 6,
  PUBLISH_PAGE_LAYOUT_MUTATION: 6,
  TOGGLE_PUBLISH_MUTATION: 6,
  FORM_BY_ID_QUERY: 5,
  MEDIA_ASSETS_QUERY: 4,
  PAGE_TYPES_QUERY: 4,
  MODEL_DEFINITION_BY_ID_QUERY: 3,
  MODEL_DEFINITIONS_QUERY: 3,
  MODEL_RECORD_BY_ID_QUERY: 3,
  MODEL_RECORDS_QUERY: 3,
  AUTHORIZE_MEDIA_UPLOAD_MUTATION: 2,
  DISCOUNT_BY_ID_QUERY: 2,
  CREATE_MODEL_DEFINITION_MUTATION: 1,
  DELETE_FORM_MUTATION: 1,
  DELETE_FORM_SUBMISSION_MUTATION: 1,
  DELETE_MODEL_DEFINITION_MUTATION: 1,
  DELETE_MODEL_RECORD_MUTATION: 1,
  DELETE_WEBHOOK_ENDPOINT_MUTATION: 1,
  INTROSPECT_TYPE_QUERY: 1,
  UPDATE_MODEL_DEFINITION_MUTATION: 1,
};

const MEASURED = (() => {
  const rows = new Map<string, string[]>();
  for (const [document, { name, types }] of readersByDocument(
    collectCallSites(),
  )) {
    const paths = unreadableByEveryReader(checker, document, types);
    if (paths.length > 0) rows.set(name, paths);
  }
  return rows;
})();

describe("the selection checker reports what it is given", () => {
  it("names a selected field the response type does not declare", () => {
    const check = fixtureSelectionCheck(
      "export type Response = { a: { x: string } };",
    );

    expect(check("{ a { x } }")).toEqual([]);
    expect(check("{ a { x y } }")).toEqual(["a.y"]);
  });

  it("names the shallowest unnamed node, not every leaf under it", () => {
    const check = fixtureSelectionCheck(
      "export type Response = { a: { x: string } };",
    );

    expect(check("{ a { x b { c d e } } }")).toEqual(["a.b"]);
  });

  it("follows the response key an alias sets", () => {
    const check = fixtureSelectionCheck(
      "export type Response = { a: { x: string } };",
    );

    expect(check("{ a { x: y } }")).toEqual([]);
    expect(check("{ a { y: x } }")).toEqual(["a.y"]);
  });

  it("counts what a fragment and an inline fragment select", () => {
    const check = fixtureSelectionCheck(
      "export type Response = { a: { x: string } };",
    );

    expect(check("{ a { ...F } } fragment F on Thing { x }")).toEqual([]);
    expect(check("{ a { ...F } } fragment F on Thing { x z } ")).toEqual([
      "a.z",
    ]);
    expect(check("{ a { ... on Thing { q } } }")).toEqual(["a.q"]);
  });

  it("asks nothing where the type names the whole bag", () => {
    const check = fixtureSelectionCheck(
      "export type Response = { a: Record<string, unknown> };",
    );

    expect(check("{ a { anything { deeper } } }")).toEqual([]);
  });

  it("asks nothing where the value could be one of two shapes", () => {
    const check = fixtureSelectionCheck(
      "export type Response = { a: { x: string } | { y: string } };",
    );

    expect(check("{ a { z } }")).toEqual([]);
  });

  it("looks through a list and through null", () => {
    const check = fixtureSelectionCheck(
      "export type Response = { a: Array<{ x: string } | null> | null };",
    );

    expect(check("{ a { x } }")).toEqual([]);
    expect(check("{ a { y } }")).toEqual(["a.y"]);
  });

  it("counts an optional property as declared", () => {
    const check = fixtureSelectionCheck(
      "export type Response = { a: { x?: string } };",
    );

    expect(check("{ a { x } }")).toEqual([]);
  });

  it("reports each unnamed field once, however many times it is selected", () => {
    const check = fixtureSelectionCheck(
      "export type Response = { a: { x: string } };",
    );

    expect(check("{ a { y } a { y } }")).toEqual(["a.y"]);
  });
});

describe("a document shared by two readers is graded by what both of them leave unread", () => {
  it("clears a field either reader declares", () => {
    const document = "{ a { x y } }";
    const one = fixtureSelectionCheck(
      "export type Response = { a: { x: string } };",
    );
    const both = fixtureSelectionCheck(
      "export type Response = { a: { x: string; y: string } };",
    );

    expect(one(document)).toEqual(["a.y"]);
    expect(both(document)).toEqual([]);
  });

  it("holds every page document to the union of its call sites", () => {
    const shared = [...readersByDocument(collectCallSites()).values()].filter(
      (entry) => entry.types.length > 1,
    );

    expect(shared.length).toBeGreaterThan(0);
  });
});

describe("no operation selects more than its readers can read (CMS-2056)", () => {
  it.each(Object.keys(ALLOWED))("%s stays at its pinned count", (name) => {
    const paths = MEASURED.get(name) ?? [];

    expect(
      paths.length,
      `${name} selects ${paths.length} path(s) no reader declares; the pin is ${ALLOWED[name]}. This number may only go down - lower the pin when you narrow the document, never raise it. Paths: ${paths.join(", ")}`,
    ).toBeLessThanOrEqual(ALLOWED[name]);
  });

  it("names no document the pins do not list", () => {
    const unpinned = [...MEASURED.entries()]
      .filter(([name]) => ALLOWED[name] === undefined)
      .map(([name, paths]) => `${name}: ${paths.join(", ")}`);

    expect(unpinned).toEqual([]);
  });

  it("holds the ten order mutations at nothing unread", () => {
    const mutations = [
      "CANCEL_ORDER_MUTATION",
      "CREATE_MANUAL_ORDER_MUTATION",
      "EDIT_ORDER_MUTATION",
      "MARK_ORDER_PAID_MUTATION",
      "RECORD_ORDER_INVOICE_MUTATION",
      "RECORD_ORDER_PAYMENT_MUTATION",
      "REFUND_ORDER_MUTATION",
      "SET_ORDER_PIPELINE_STAGE_MUTATION",
      "TRANSITION_ORDER_FULFILLMENT_MUTATION",
      "UPDATE_ORDER_DETAILS_MUTATION",
    ];

    expect(
      mutations.filter((name) => (MEASURED.get(name) ?? []).length > 0),
      "each of these returns an id and an order number; selecting the whole order again would make the backend resolve a cart's worth of fields to answer with two",
    ).toEqual([]);
  });

  it("keeps the whole figure under what it was when the pins were written", () => {
    const total = [...MEASURED.values()].reduce(
      (sum, paths) => sum + paths.length,
      0,
    );

    expect(total).toBeLessThanOrEqual(190);
  });
});
