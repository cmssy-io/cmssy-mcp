import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { parse, type FieldNode, type SelectionSetNode } from "graphql";
import * as operations from "../queries.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLIENT_TYPE = "CmssyClient";
const NULLISH = ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void;

function createProgram(): ts.Program {
  const read = ts.readConfigFile(
    resolve(root, "tsconfig.json"),
    ts.sys.readFile,
  );
  if (read.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(read.error.messageText, " "),
    );
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, root);
  return ts.createProgram(parsed.fileNames, parsed.options);
}

const program = createProgram();
const checker = program.getTypeChecker();

function present(type: ts.Type): ts.Type[] {
  const members = type.isUnion() ? type.types : [type];
  return members.filter((member) => (member.flags & NULLISH) === 0);
}

function requiredPaths(
  typeChecker: ts.TypeChecker,
  type: ts.Type,
  seen: ReadonlySet<ts.Type> = new Set(),
): string[][] {
  const members = present(type);
  if (members.length !== 1) return [[]];
  const resolved = members[0];
  if (seen.has(resolved)) return [[]];

  if (typeChecker.isArrayType(resolved)) {
    const element = typeChecker.getTypeArguments(
      resolved as ts.TypeReference,
    )[0];
    return element ? requiredPaths(typeChecker, element, seen) : [[]];
  }
  if ((resolved.flags & ts.TypeFlags.Object) === 0) return [[]];

  const properties = typeChecker
    .getPropertiesOfType(resolved)
    .filter((property) => (property.flags & ts.SymbolFlags.Property) !== 0);

  const next = new Set(seen).add(resolved);
  const paths: string[][] = [];
  for (const property of properties) {
    if (property.flags & ts.SymbolFlags.Optional) continue;
    const name = property.getName();
    for (const tail of requiredPaths(
      typeChecker,
      typeChecker.getTypeOfSymbol(property),
      next,
    )) {
      paths.push([name, ...tail]);
    }
  }
  return paths.length > 0 ? paths : [[]];
}

function responseFields(
  set: SelectionSetNode,
): Map<string, SelectionSetNode[]> {
  const byKey = new Map<string, SelectionSetNode[]>();
  for (const selection of set.selections) {
    if (selection.kind !== "Field") continue;
    const field = selection as FieldNode;
    const key = field.alias?.value ?? field.name.value;
    const nested = byKey.get(key) ?? [];
    if (field.selectionSet) nested.push(field.selectionSet);
    byKey.set(key, nested);
  }
  return byKey;
}

function missingFrom(set: SelectionSetNode, path: readonly string[]): boolean {
  const nested = responseFields(set).get(path[0]);
  if (nested === undefined) return true;
  if (path.length === 1) return false;
  if (nested.length === 0) return true;
  return nested.every((inner) => missingFrom(inner, path.slice(1)));
}

function rootSelectionSet(document: string): SelectionSetNode {
  const definition = parse(document).definitions.find(
    (candidate) => candidate.kind === "OperationDefinition",
  );
  if (!definition || definition.kind !== "OperationDefinition") {
    throw new Error("no operation definition");
  }
  return definition.selectionSet;
}

function unsuppliedPaths(
  typeChecker: ts.TypeChecker,
  document: string,
  type: ts.Type,
): string[] {
  const set = rootSelectionSet(document);
  return requiredPaths(typeChecker, type)
    .filter((path) => path.length > 0 && missingFrom(set, path))
    .map((path) => path.join("."));
}

function literalOf(node: ts.Node): string | null {
  if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isStringLiteral(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node)) {
    let text = node.head.text;
    for (const span of node.templateSpans) {
      const inner = literalOf(span.expression);
      if (inner === null) return null;
      text += inner + span.literal.text;
    }
    return text;
  }
  if (ts.isIdentifier(node)) {
    let symbol = checker.getSymbolAtLocation(node);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
      symbol = checker.getAliasedSymbol(symbol);
    }
    for (const declaration of symbol?.declarations ?? []) {
      if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
        return literalOf(declaration.initializer);
      }
    }
  }
  return null;
}

interface CallSite {
  file: string;
  line: number;
  document: string | null;
  documentName: string;
  type: ts.Type | null;
  resultIsDiscarded: boolean;
}

function isDiscarded(node: ts.CallExpression): boolean {
  const awaited = ts.isAwaitExpression(node.parent) ? node.parent : node;
  return ts.isExpressionStatement(awaited.parent);
}

function collectCallSites(): CallSite[] {
  const sites: CallSite[] = [];
  const sourceRoot = resolve(root, "src");

  for (const source of program.getSourceFiles()) {
    if (!source.fileName.startsWith(sourceRoot)) continue;
    if (source.fileName.includes("__tests__")) continue;

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "query" &&
        checker
          .getTypeAtLocation(node.expression.expression)
          .getSymbol()
          ?.getName() === CLIENT_TYPE
      ) {
        const argument = node.arguments[0];
        const typeNode = node.typeArguments?.[0];
        sites.push({
          file: source.fileName.slice(root.length + 1),
          line:
            source.getLineAndCharacterOfPosition(node.getStart(source)).line +
            1,
          document: argument ? literalOf(argument) : null,
          documentName:
            argument && ts.isIdentifier(argument)
              ? argument.text
              : "<not an identifier>",
          type: typeNode ? checker.getTypeFromTypeNode(typeNode) : null,
          resultIsDiscarded: isDiscarded(node),
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return sites;
}

const FIXTURE_FILE = resolve(root, "src", "response-contract-fixture.ts");

function fixtureCheck(source: string): (document: string) => string[] {
  const options: ts.CompilerOptions = {
    strict: true,
    target: ts.ScriptTarget.ES2022,
    types: [],
    skipLibCheck: true,
  };
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  host.readFile = (fileName) =>
    fileName === FIXTURE_FILE ? source : readFile(fileName);
  host.fileExists = (fileName) =>
    fileName === FIXTURE_FILE || ts.sys.fileExists(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) =>
    fileName === FIXTURE_FILE
      ? ts.createSourceFile(fileName, source, languageVersion, true)
      : getSourceFile(fileName, languageVersion, onError, shouldCreate);

  const fixture = ts.createProgram([FIXTURE_FILE], options, host);
  const broken = [
    ...fixture.getSyntacticDiagnostics(),
    ...fixture.getSemanticDiagnostics(),
  ].map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
  );
  if (broken.length > 0) throw new Error(broken.join("; "));

  const sourceFile = fixture.getSourceFile(FIXTURE_FILE);
  const alias = sourceFile?.statements
    .filter(ts.isTypeAliasDeclaration)
    .find((candidate) => candidate.name.text === "Response");
  if (!alias) throw new Error("fixture declares no Response type");

  const fixtureChecker = fixture.getTypeChecker();
  const type = fixtureChecker.getTypeAtLocation(alias.name);
  return (document) => unsuppliedPaths(fixtureChecker, document, type);
}

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
