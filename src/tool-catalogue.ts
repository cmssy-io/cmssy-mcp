import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createServer } from "./server.js";
import { boundDeclarations } from "./ai-tools-binder.js";
import type { CmssyClient } from "./graphql-client.js";

export interface CatalogueRow {
  name: string;
  permission: string;
  description: string;
}

export interface BoundTool {
  description?: string;
}

export interface DeclaredTool {
  name: string;
  description?: string;
  requiredPermissions?: readonly string[];
}

export function catalogueFrom(
  bound: Record<string, BoundTool>,
  declared: readonly DeclaredTool[],
): CatalogueRow[] {
  const byName = new Map(declared.map((tool) => [tool.name, tool]));
  return Object.entries(bound)
    .map(([name, tool]) => {
      const declaration = byName.get(name);
      const description = tool.description ?? declaration?.description ?? "";
      return {
        name,
        permission: (declaration?.requiredPermissions ?? []).join(", "),
        description: description.replace(/\s+/g, " ").trim(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function boundTools(server: unknown): Record<string, BoundTool> {
  const registered = (
    server as { _registeredTools?: Record<string, BoundTool> }
  )._registeredTools;
  if (!registered || Object.keys(registered).length === 0) {
    throw new Error(
      "the server exposes no tools - the MCP SDK no longer keeps them on _registeredTools",
    );
  }
  return registered;
}

export function catalogueOfServer(server: McpServer): CatalogueRow[] {
  const registered = boundTools(server);
  const declared = boundDeclarations(server);

  const undeclared = Object.keys(registered).filter(
    (name) => !declared.has(name),
  );
  if (undeclared.length > 0) {
    throw new Error(
      `bound without a declaration, so their permissions cannot be published: ${undeclared.join(", ")}`,
    );
  }

  return catalogueFrom(registered, [...declared.values()]);
}

export function buildCatalogue(): CatalogueRow[] {
  return catalogueOfServer(createServer({} as CmssyClient));
}

export function catalogueDrift(
  built: readonly CatalogueRow[],
  published: readonly CatalogueRow[],
): string[] {
  const drift: string[] = [];
  const live = new Map(published.map((row) => [row.name, row]));

  for (const row of built) {
    const onPage = live.get(row.name);
    if (!onPage) {
      drift.push(`${row.name} is not on the page`);
      continue;
    }
    if (onPage.permission !== row.permission) {
      drift.push(
        `${row.name} requires ${row.permission || "no permission"}, the page says ${onPage.permission || "none"}`,
      );
    }
    if (onPage.description !== row.description) {
      drift.push(`${row.name} is described differently on the page`);
    }
  }

  const exposed = new Set(built.map((row) => row.name));
  for (const row of published) {
    if (!exposed.has(row.name)) {
      drift.push(
        `${row.name} is on the page but the server does not expose it`,
      );
    }
  }

  return drift;
}
