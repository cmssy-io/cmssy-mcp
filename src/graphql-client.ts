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

export class CmssyClient {
  private selectionCache = new Map<string, string>();

  constructor(
    private apiUrl: string,
    private token: string,
    private workspaceId: string,
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

  /**
   * Introspect a GraphQL type and build a selection set string dynamically.
   * Recurses into OBJECT fields up to `depth` levels. Results are cached.
   */
  async buildSelectionSet(typeName: string, depth = 3): Promise<string> {
    if (depth <= 0) return "";

    const cached = this.selectionCache.get(typeName);
    if (cached !== undefined) return cached;

    const data = await this.query<{
      __type: { fields: IntrospectedField[] } | null;
    }>(INTROSPECT_TYPE_QUERY, { name: typeName });

    if (!data.__type?.fields) {
      this.selectionCache.set(typeName, "");
      return "";
    }

    const parts: string[] = [];
    for (const field of data.__type.fields) {
      const resolved = unwrapType(field.type);
      if (resolved.kind === "SCALAR" || resolved.kind === "ENUM") {
        parts.push(field.name);
      } else if (resolved.kind === "OBJECT" && resolved.name) {
        const sub = await this.buildSelectionSet(resolved.name, depth - 1);
        if (sub) parts.push(`${field.name} { ${sub} }`);
      }
    }

    const result = parts.join(" ");
    this.selectionCache.set(typeName, result);
    return result;
  }
}
