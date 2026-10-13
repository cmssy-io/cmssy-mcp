import { clientHeaders } from "./client-marker.js";
import { PACKAGE_VERSION } from "./package-version.js";

interface TypeRef {
  name: string | null;
  kind: string;
  ofType?: TypeRef | null;
}

interface IntrospectedField {
  name: string;
  type: TypeRef;
}

const INTROSPECT_TYPE_QUERY = `
  query IntrospectType($name: String!) {
    __type(name: $name) {
      name
      fields {
        name
        type {
          name kind
          ofType { name kind ofType { name kind ofType { name kind } } }
        }
      }
    }
  }
`;

function unwrapType(type: TypeRef): { name: string | null; kind: string } {
  let current: TypeRef | null | undefined = type;
  while (current && (current.kind === "NON_NULL" || current.kind === "LIST")) {
    current = current.ofType;
  }
  return current
    ? { name: current.name, kind: current.kind }
    : { name: null, kind: "SCALAR" };
}

export type GraphqlExecute = <T>(
  query: string,
  variables?: Record<string, unknown>,
) => Promise<T>;

export interface CmssyApi {
  readonly workspaceId: string;
  query<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
  buildSelectionSet(typeName: string, depth?: number): Promise<string>;
}

async function selectionSetFor(
  api: CmssyApi,
  cache: Map<string, string>,
  typeName: string,
  depth: number,
): Promise<string> {
  if (depth <= 0) return "";

  const cached = cache.get(typeName);
  if (cached !== undefined) return cached;

  const data = await api.query<{
    __type: { fields: IntrospectedField[] } | null;
  }>(INTROSPECT_TYPE_QUERY, { name: typeName });

  if (!data.__type?.fields) {
    cache.set(typeName, "");
    return "";
  }

  const parts: string[] = [];
  for (const field of data.__type.fields) {
    const resolved = unwrapType(field.type);
    if (resolved.kind === "SCALAR" || resolved.kind === "ENUM") {
      parts.push(field.name);
    } else if (resolved.kind === "OBJECT" && resolved.name) {
      const sub = await selectionSetFor(api, cache, resolved.name, depth - 1);
      if (sub) parts.push(`${field.name} { ${sub} }`);
    }
  }

  const result = parts.join(" ");
  cache.set(typeName, result);
  return result;
}

export class CmssyClient implements CmssyApi {
  private selectionCache = new Map<string, string>();

  constructor(
    private apiUrl: string,
    private token: string,
    public readonly workspaceId: string,
  ) {}

  async query<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetch(`${this.apiUrl}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
        "x-workspace-id": this.workspaceId,
        ...clientHeaders(PACKAGE_VERSION),
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const json = (await res.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };

    if (json.errors?.length) {
      throw new Error(json.errors.map((e) => e.message).join("; "));
    }

    if (!json.data) {
      throw new Error("No data returned from GraphQL");
    }

    return json.data;
  }

  buildSelectionSet(typeName: string, depth = 3): Promise<string> {
    return selectionSetFor(this, this.selectionCache, typeName, depth);
  }
}

const hostedSelectionCache = new Map<string, string>();

export function createCmssyApi(
  execute: GraphqlExecute,
  workspaceId: string,
  selectionCache: Map<string, string> = hostedSelectionCache,
): CmssyApi {
  const api: CmssyApi = {
    workspaceId,
    query: execute,
    buildSelectionSet: (typeName, depth = 3) =>
      selectionSetFor(api, selectionCache, typeName, depth),
  };
  return api;
}
