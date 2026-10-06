import { describe, expect, it } from "vitest";
import ts from "typescript";
import * as operations from "../queries.js";

import {
  checker,
  collectCallSites,
  fixtureCheck,
  program,
  requiredPaths,
  unsuppliedPaths,
} from "./operation-contract.js";

const SITES = collectCallSites();
const TYPED = SITES.filter((site) => site.type !== null);
const BY_LABEL = new Map(
  TYPED.map((site) => [`${site.file}:${site.line} ${site.documentName}`, site]),
);
const BY_LABEL_NAMES = new Set(TYPED.map((site) => site.documentName));

describe("the response-contract checker reports what it is given", () => {
  it("names a required field the document leaves out", () => {
    const check = fixtureCheck(
      "export type Response = { a: { b: { x: string; y: string } } };",
    );

    expect(check("{ a { b { x } } }")).toEqual(["a.b.y"]);
    expect(check("{ a { b { x y } } }")).toEqual([]);
  });

  it("names the leaf path when the selection stops short of it", () => {
    const check = fixtureCheck(
      "export type Response = { a: { b: { x: string } } };",
    );

    expect(check("{ a { c { x } } }")).toEqual(["a.b.x"]);
    expect(check("{ a { b } }")).toEqual(["a.b.x"]);
    expect(check("{ a { b { x } } }")).toEqual([]);
  });

  it("follows the response key an alias sets, not the field name", () => {
    const check = fixtureCheck("export type Response = { a: { y: string } };");

    expect(check("{ a { y: z } }")).toEqual([]);
    expect(check("{ a { z: y } }")).toEqual(["a.y"]);
  });

  it("counts a field an inline fragment supplies", () => {
    const check = fixtureCheck(
      "export type Response = { a: { x: string; y: string } };",
    );

    expect(check("{ a { x ... on Thing { y } } }")).toEqual([]);
    expect(check("{ a { x ... on Thing { z } } }")).toEqual(["a.y"]);
  });

  it("counts a field a named fragment supplies", () => {
    const check = fixtureCheck(
      "export type Response = { a: { x: string; y: string } };",
    );

    expect(check("{ a { x ...F } } fragment F on Thing { y }")).toEqual([]);
    expect(check("{ a { x ...F } } fragment F on Thing { z }")).toEqual([
      "a.y",
    ]);
  });

  it("follows a fragment into a nested selection", () => {
    const check = fixtureCheck(
      "export type Response = { a: { b: { x: string } } };",
    );

    expect(check("{ a { ...F } } fragment F on Thing { b { x } }")).toEqual([]);
    expect(check("{ a { ...F } } fragment F on Thing { b { y } }")).toEqual([
      "a.b.x",
    ]);
  });

  it("keeps what the field selected when a fragment adds to the same key", () => {
    const check = fixtureCheck(
      "export type Response = { a: { b: { x: string } } };",
    );

    expect(
      check("{ a { b { x } ...F } } fragment F on Thing { b { y } }"),
    ).toEqual([]);
    expect(
      check("{ a { b { w } ...F } } fragment F on Thing { b { y } }"),
    ).toEqual(["a.b.x"]);
  });

  it("refuses a document that spreads a fragment it does not define", () => {
    const check = fixtureCheck("export type Response = { a: { x: string } };");

    expect(() => check("{ a { ...Missing } }")).toThrow(
      "document spreads an undefined fragment: Missing",
    );
  });

  it("stops where a fragment spreads itself", () => {
    const check = fixtureCheck("export type Response = { a: { x: string } };");

    expect(check("{ a { ...F } } fragment F on Thing { x ...F }")).toEqual([]);
    expect(check("{ a { ...F } } fragment F on Thing { y ...F }")).toEqual([
      "a.x",
    ]);
  });

  it("merges two selections of the same response key", () => {
    const check = fixtureCheck("export type Response = { a: { x: string } };");

    expect(check("{ a { y } a { x } }")).toEqual([]);
    expect(check("{ a { y } a { z } }")).toEqual(["a.x"]);
  });

  it("asks nothing of an optional property", () => {
    const check = fixtureCheck(
      "export type Response = { a: { x: string; y?: string } };",
    );

    expect(check("{ a { x } }")).toEqual([]);
  });

  it("looks through a list and through null", () => {
    const check = fixtureCheck(
      "export type Response = { a: Array<{ x: string } | null> | null };",
    );

    expect(check("{ a { x } }")).toEqual([]);
    expect(check("{ a { y } }")).toEqual(["a.x"]);
  });

  it("stops at a value whose keys the type does not name", () => {
    const check = fixtureCheck(
      "export type Response = { a: Record<string, unknown>; b: string };",
    );

    expect(check("{ a b }")).toEqual([]);
    expect(check("{ a }")).toEqual(["b"]);
  });

  it("does not walk into a primitive's own members", () => {
    const check = fixtureCheck("export type Response = { a: string };");

    expect(check("{ a }")).toEqual([]);
  });

  it("asks nothing of a response that names no fields at all", () => {
    const check = fixtureCheck("export type Response = string;");

    expect(check("{ a }")).toEqual([]);
  });

  it("asks nothing of a method the type happens to declare", () => {
    const check = fixtureCheck(
      "export type Response = { a: { x: string; shout(): void } };",
    );

    expect(check("{ a { x } }")).toEqual([]);
  });

  it("stops where a value could be one of two shapes", () => {
    const check = fixtureCheck(
      "export type Response = { a: { x: string } | { y: string } };",
    );

    expect(check("{ a { y } }")).toEqual([]);
    expect(check("{ a }")).toEqual([]);
  });

  it("stops where a type requires itself", () => {
    const check = fixtureCheck(
      "type Node = { key: string; child: Node }; export type Response = { a: Node };",
    );

    expect(check("{ a { key child } }")).toEqual([]);
    expect(check("{ a { key } }")).toEqual(["a.child"]);
  });
});

describe("the checker sees every call site it claims to grade", () => {
  it("grades a program that compiled", () => {
    const errors = program
      .getSemanticDiagnostics()
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
      );

    expect(errors).toEqual([]);
  });

  it("finds every CmssyClient.query call site in src", () => {
    expect(SITES.length).toBe(123);
    expect(TYPED.length).toBe(117);
  });

  it("resolves the document text of every call site", () => {
    const unresolved = SITES.filter((site) => site.document === null).map(
      (site) => `${site.file}:${site.line} ${site.documentName}`,
    );

    expect(unresolved).toEqual([]);
  });

  it("evaluates an operation to the text the module exports", () => {
    const mismatched = (
      Object.entries(operations).filter(
        ([, value]) => typeof value === "string",
      ) as Array<[string, string]>
    )
      .filter(([name]) => BY_LABEL_NAMES.has(name))
      .filter(
        ([name, text]) =>
          SITES.find((site) => site.documentName === name)?.document !== text,
      )
      .map(([name]) => name);

    expect(mismatched).toEqual([]);
    expect(BY_LABEL_NAMES.size).toBeGreaterThanOrEqual(90);
  });

  it("leaves a result unread only where no type is declared", () => {
    const used = SITES.filter(
      (site) => site.type === null && !site.resultIsDiscarded,
    ).map((site) => `${site.file}:${site.line} ${site.documentName}`);

    expect(used).toEqual([]);
  });

  it("reads a real call site down to the leaves of its port types", () => {
    const site = TYPED.find(
      (candidate) => candidate.documentName === "MODEL_DEFINITIONS_QUERY",
    );
    if (!site?.type)
      throw new Error("MODEL_DEFINITIONS_QUERY has no call site");

    const paths = requiredPaths(checker, site.type).map((path) =>
      path.join("."),
    );
    const promised = [
      ...new Set(paths.map((path) => path.split(".")[2])),
    ].sort();

    expect(promised).toEqual([
      "auth",
      "color",
      "defaultSort",
      "description",
      "displayField",
      "fields",
      "icon",
      "id",
      "name",
      "product",
      "recordCount",
      "slug",
      "statusField",
      "updatedAt",
    ]);
    expect(paths).toContain("model.list.auth.lockout.lockMinutes");
    expect(paths).toContain("model.list.fields.key");
    expect(paths).toContain("model.list.statusField");
    expect(paths.filter((path) => path.endsWith(".length"))).toEqual([]);
  });
});

describe("every operation supplies the response type its call site declares", () => {
  it.each(Array.from(BY_LABEL.keys()))("%s", (label) => {
    const site = BY_LABEL.get(label);
    if (!site?.document || !site.type) {
      throw new Error(`no call site for ${label}`);
    }

    expect(unsuppliedPaths(checker, site.document, site.type)).toEqual([]);
  });
});
