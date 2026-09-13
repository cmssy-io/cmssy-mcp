import { describe, it, expect, vi } from "vitest";
import {
  boundTools,
  buildCatalogue,
  catalogueOfServer,
  catalogueDrift,
  catalogueFrom,
  type CatalogueRow,
} from "../tool-catalogue.js";
import { boundDeclarations } from "../ai-tools-binder.js";
import { createServer } from "../server.js";
import type { CmssyClient } from "../graphql-client.js";

const client = { query: vi.fn() } as unknown as CmssyClient;

describe("catalogueFrom", () => {
  it("publishes one row per bound tool, ordered by name", () => {
    const rows = catalogueFrom({ publish_page: {}, add_block_to_page: {} }, [
      { name: "publish_page", requiredPermissions: ["pages:publish"] },
      { name: "add_block_to_page", requiredPermissions: ["pages:edit"] },
    ]);

    expect(rows).toEqual([
      {
        name: "add_block_to_page",
        permission: "pages:edit",
        description: "",
      },
      { name: "publish_page", permission: "pages:publish", description: "" },
    ]);
  });

  it("joins every permission a tool needs", () => {
    const rows = catalogueFrom({ edit_order: {} }, [
      {
        name: "edit_order",
        requiredPermissions: ["orders:manage", "models:edit"],
      },
    ]);

    expect(rows[0]?.permission).toBe("orders:manage, models:edit");
  });

  it("leaves the permission empty for a tool that needs none", () => {
    const rows = catalogueFrom({ get_workspace_info: {} }, [
      { name: "get_workspace_info", requiredPermissions: [] },
    ]);

    expect(rows[0]?.permission).toBe("");
  });

  it("collapses the whitespace a multi-line description carries", () => {
    const rows = catalogueFrom(
      { get_page: { description: " One\n  two.  " } },
      [{ name: "get_page", requiredPermissions: ["pages:view"] }],
    );

    expect(rows[0]?.description).toBe("One two.");
  });

  it("falls back to the declared description when the binding carries none", () => {
    const rows = catalogueFrom({ get_page: {} }, [
      { name: "get_page", description: "Reads a page." },
    ]);

    expect(rows[0]?.description).toBe("Reads a page.");
  });
});

describe("boundTools", () => {
  it("refuses to publish an empty catalogue", () => {
    expect(() => boundTools({})).toThrow(/no tools/);
    expect(() => boundTools({ _registeredTools: {} })).toThrow(/no tools/);
  });
});

describe("buildCatalogue", () => {
  const rows = buildCatalogue();

  it("lists every tool the server binds, and no more", () => {
    const server = createServer(client);
    const registered = Object.keys(boundTools(server)).sort();

    expect(rows.map((row) => row.name)).toEqual(registered);
    expect(rows.length).toBeGreaterThan(50);
  });

  it("has a declaration behind every binding, so no permission is guessed", () => {
    const server = createServer(client);

    expect(
      Object.keys(boundTools(server)).filter(
        (name) => !boundDeclarations(server).has(name),
      ),
    ).toEqual([]);
  });

  it("describes every tool it publishes", () => {
    expect(rows.filter((row) => row.description === "")).toEqual([]);
  });

  it("refuses a tool bound past the binder, whose permissions it cannot know", () => {
    const rogue = {
      _registeredTools: { sneak_in: { description: "bound directly" } },
    } as unknown as Parameters<typeof catalogueOfServer>[0];

    expect(() => catalogueOfServer(rogue)).toThrow(/sneak_in/);
  });

  it("names a write tool's permission, not none", () => {
    const write = rows.find((row) => row.name === "update_region_settings");

    expect(write?.permission).toBe("pages:edit");
  });
});

describe("catalogueDrift", () => {
  const built: CatalogueRow[] = [
    { name: "get_page", permission: "pages:view", description: "Reads." },
  ];

  it("stays quiet when the page lists exactly what the server exposes", () => {
    expect(catalogueDrift(built, [...built])).toEqual([]);
  });

  it("reports a tool the page never got", () => {
    expect(catalogueDrift(built, [])).toEqual(["get_page is not on the page"]);
  });

  it("reports a tool the page kept after the server dropped it", () => {
    expect(
      catalogueDrift(built, [
        ...built,
        { name: "old_tool", permission: "", description: "" },
      ]),
    ).toEqual(["old_tool is on the page but the server does not expose it"]);
  });

  it("reports a permission and a description that moved", () => {
    const drift = catalogueDrift(built, [
      { name: "get_page", permission: "pages:edit", description: "Writes." },
    ]);

    expect(drift).toEqual([
      "get_page requires pages:view, the page says pages:edit",
      "get_page is described differently on the page",
    ]);
  });
});
