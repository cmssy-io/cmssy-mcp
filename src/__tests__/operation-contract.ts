import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  parse,
  type FieldNode,
  type FragmentDefinitionNode,
  type SelectionSetNode,
} from "graphql";
import * as operations from "../queries.js";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
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

export const program = createProgram();
export const checker = program.getTypeChecker();

function present(type: ts.Type): ts.Type[] {
  const members = type.isUnion() ? type.types : [type];
  return members.filter((member) => (member.flags & NULLISH) === 0);
}

export function requiredPaths(
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

export type Fragments = ReadonlyMap<string, FragmentDefinitionNode>;

export function responseFields(
  set: SelectionSetNode,
  fragments: Fragments,
  expanded: ReadonlySet<string> = new Set(),
): Map<string, SelectionSetNode[]> {
  const byKey = new Map<string, SelectionSetNode[]>();

  const take = (from: Map<string, SelectionSetNode[]>): void => {
    for (const [key, sets] of from) {
      byKey.set(key, [...(byKey.get(key) ?? []), ...sets]);
    }
  };

  for (const selection of set.selections) {
    if (selection.kind === "Field") {
      const field = selection as FieldNode;
      const key = field.alias?.value ?? field.name.value;
      const nested = byKey.get(key) ?? [];
      if (field.selectionSet) nested.push(field.selectionSet);
      byKey.set(key, nested);
      continue;
    }
    if (selection.kind === "InlineFragment") {
      take(responseFields(selection.selectionSet, fragments, expanded));
      continue;
    }
    const name = selection.name.value;
    if (expanded.has(name)) continue;
    const definition = fragments.get(name);
    if (!definition) {
      throw new Error(`document spreads an undefined fragment: ${name}`);
    }
    take(
      responseFields(
        definition.selectionSet,
        fragments,
        new Set(expanded).add(name),
      ),
    );
  }
  return byKey;
}

export function missingFrom(
  set: SelectionSetNode,
  fragments: Fragments,
  path: readonly string[],
): boolean {
  const nested = responseFields(set, fragments).get(path[0]);
  if (nested === undefined) return true;
  if (path.length === 1) return false;
  if (nested.length === 0) return true;
  return nested.every((inner) => missingFrom(inner, fragments, path.slice(1)));
}

export function responseOf(document: string): {
  root: SelectionSetNode;
  fragments: Fragments;
} {
  const parsed = parse(document);
  const definition = parsed.definitions.find(
    (candidate) => candidate.kind === "OperationDefinition",
  );
  if (!definition || definition.kind !== "OperationDefinition") {
    throw new Error("no operation definition");
  }
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const candidate of parsed.definitions) {
    if (candidate.kind === "FragmentDefinition") {
      fragments.set(candidate.name.value, candidate);
    }
  }
  return { root: definition.selectionSet, fragments };
}

export function unsuppliedPaths(
  typeChecker: ts.TypeChecker,
  document: string,
  type: ts.Type,
): string[] {
  const { root, fragments } = responseOf(document);
  return requiredPaths(typeChecker, type)
    .filter((path) => path.length > 0 && missingFrom(root, fragments, path))
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

export interface CallSite {
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

export function collectCallSites(): CallSite[] {
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

function fixtureProgram(source: string): {
  typeChecker: ts.TypeChecker;
  type: ts.Type;
} {
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
  return {
    typeChecker: fixtureChecker,
    type: fixtureChecker.getTypeAtLocation(alias.name),
  };
}

export function fixtureCheck(
  source: string,
): (document: string) => string[] {
  const { typeChecker, type } = fixtureProgram(source);
  return (document) => unsuppliedPaths(typeChecker, document, type);
}

export function fixtureSelectionCheck(
  source: string,
): (document: string) => string[] {
  const { typeChecker, type } = fixtureProgram(source);
  return (document) => unreadablePaths(typeChecker, document, type);
}


export function selectedPaths(
  set: SelectionSetNode,
  fragments: Fragments,
  expanded: ReadonlySet<string> = new Set(),
): string[][] {
  const paths: string[][] = [];
  for (const [key, nested] of responseFields(set, fragments, expanded)) {
    if (nested.length === 0) {
      paths.push([key]);
      continue;
    }
    for (const inner of nested) {
      for (const tail of selectedPaths(inner, fragments, expanded)) {
        paths.push([key, ...tail]);
      }
    }
  }
  return paths;
}

function namesAll(typeChecker: ts.TypeChecker, type: ts.Type): boolean {
  const members = present(type);
  if (members.length !== 1) return true;
  const resolved = members[0];
  if (typeChecker.isArrayType(resolved)) return false;
  if ((resolved.flags & ts.TypeFlags.Object) === 0) return true;
  return (
    typeChecker.getIndexInfoOfType(resolved, ts.IndexKind.String) !== undefined
  );
}

function propertyType(
  typeChecker: ts.TypeChecker,
  type: ts.Type,
  name: string,
): ts.Type | null {
  const members = present(type);
  if (members.length !== 1) return null;
  let resolved = members[0];
  if (typeChecker.isArrayType(resolved)) {
    const element = typeChecker.getTypeArguments(
      resolved as ts.TypeReference,
    )[0];
    if (!element) return null;
    const inner = present(element);
    if (inner.length !== 1) return null;
    resolved = inner[0];
  }
  const property = typeChecker
    .getPropertiesOfType(resolved)
    .find((candidate) => candidate.getName() === name);
  return property ? typeChecker.getTypeOfSymbol(property) : null;
}

export function unreadablePaths(
  typeChecker: ts.TypeChecker,
  document: string,
  type: ts.Type,
): string[] {
  const { root: selection, fragments } = responseOf(document);
  const unreadable = new Set<string>();

  for (const path of selectedPaths(selection, fragments)) {
    let current: ts.Type | null = type;
    for (const [index, segment] of path.entries()) {
      if (current === null) break;
      if (namesAll(typeChecker, current)) break;
      const next = propertyType(typeChecker, current, segment);
      if (next === null) {
        unreadable.add(path.slice(0, index + 1).join("."));
        break;
      }
      current = next;
    }
  }
  return [...unreadable].sort();
}

export function unreadableByEveryReader(
  typeChecker: ts.TypeChecker,
  document: string,
  types: readonly ts.Type[],
): string[] {
  if (types.length === 0) return [];
  const [first, ...rest] = types;
  let shared = new Set(unreadablePaths(typeChecker, document, first));
  for (const type of rest) {
    const next = new Set(unreadablePaths(typeChecker, document, type));
    shared = new Set([...shared].filter((path) => next.has(path)));
  }
  return [...shared].sort();
}

export function readersByDocument(
  sites: readonly CallSite[],
): Map<string, { name: string; types: ts.Type[] }> {
  const byDocument = new Map<string, { name: string; types: ts.Type[] }>();
  for (const site of sites) {
    if (!site.document || !site.type) continue;
    const entry = byDocument.get(site.document) ?? {
      name: site.documentName,
      types: [],
    };
    entry.types.push(site.type);
    byDocument.set(site.document, entry);
  }
  return byDocument;
}
