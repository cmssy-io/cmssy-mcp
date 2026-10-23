import { describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AiTool, WorkspaceOps } from "@cmssy/ai-tools";
import {
  createHostedServer,
  hostedUploadPolicy,
  LIST_WORKSPACES_TOOL,
} from "../hosted-server.js";
import { bindHostedTool } from "../ai-tools-binder.js";
import { createCmssyApi } from "../graphql-client.js";
import { createServer } from "../server.js";
import type { CmssyApi, CmssyClient } from "../graphql-client.js";
import { connectServer, validationRefusal } from "./mcp-harness.js";

function workspaceClient(label: string): CmssyApi {
  return {
    workspaceId: label,
    query: vi.fn(() => Promise.reject(new Error(`queried ${label}`))),
    buildSelectionSet: vi.fn(() =>
      Promise.reject(new Error(`introspected ${label}`)),
    ),
  };
}

function hosted() {
  const clients = {
    "acme/shop": workspaceClient("acme/shop"),
    "acme/blog": workspaceClient("acme/blog"),
  } as Record<string, CmssyApi>;
  const resolveWorkspace = vi.fn(async (workspace: string) => {
    const client = clients[workspace];
    if (!client) throw new Error(`Workspace ${workspace} is not connected`);
    return { client };
  });
  const listWorkspaces = vi.fn(async () => [
    {
      workspace: "acme/shop",
      name: "Shop",
      organization: "Acme",
      role: "admin",
    },
  ]);
  const fetchUrl = vi.fn(() => Promise.reject(new Error("fetch blocked")));
  const server = createHostedServer({
    listWorkspaces,
    resolveWorkspace,
    fetchUrl,
  });
  return { server, clients, resolveWorkspace, listWorkspaces, fetchUrl };
}

function text(result: unknown): string {
  return (result as { content: { text: string }[] }).content[0]!.text;
}

describe("hosted server (CMS-2095)", () => {
  it("serves the stdio catalogue plus list_workspaces, and every catalogue tool requires a workspace", async () => {
    const stdio = await connectServer(
      createServer({ query: vi.fn() } as unknown as CmssyClient),
    );
    const remote = await connectServer(hosted().server);
    const stdioNames = (await stdio.listTools()).tools.map((t) => t.name);
    const remoteTools = (await remote.listTools()).tools;

    expect(remoteTools.map((t) => t.name).sort()).toStrictEqual(
      [...stdioNames, LIST_WORKSPACES_TOOL].sort(),
    );
    const withoutWorkspace = remoteTools
      .filter((t) => t.name !== LIST_WORKSPACES_TOOL)
      .filter((t) => !t.inputSchema.required?.includes("workspace"))
      .map((t) => t.name);
    expect(withoutWorkspace).toStrictEqual([]);
  });

  it("runs a tool against the workspace the call names, and only that one", async () => {
    const { server, clients, resolveWorkspace } = hosted();
    const client = await connectServer(server);

    const result = await client.callTool({
      name: "list_pages",
      arguments: { workspace: "acme/blog" },
    });

    expect(text(result)).toContain("queried acme/blog");
    expect(resolveWorkspace).toHaveBeenCalledWith("acme/blog");
    expect(clients["acme/shop"]!.query).not.toHaveBeenCalled();
  });

  it("returns the host's refusal for a workspace outside the connection, without querying anything", async () => {
    const { server, clients } = hosted();
    const client = await connectServer(server);

    const result = await client.callTool({
      name: "list_pages",
      arguments: { workspace: "other/site" },
    });

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("Workspace other/site is not connected");
    for (const api of Object.values(clients)) {
      expect(api.query).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["missing", {}],
    ["a bare workspace slug", { workspace: "shop" }],
    ["an id", { workspace: "6abd61e1a51c17ea3525336a" }],
    ["three segments", { workspace: "acme/shop/x" }],
    ["an empty workspace slug", { workspace: "acme/" }],
    ["whitespace", { workspace: "acme/my shop" }],
  ])(
    "refuses a call whose workspace is %s before resolving it",
    async (_label, args) => {
      const { server, resolveWorkspace } = hosted();
      const client = await connectServer(server);

      const result = await client.callTool({
        name: "list_pages",
        arguments: args,
      });

      expect(validationRefusal(result)).toMatch(/workspace/);
      expect(resolveWorkspace).not.toHaveBeenCalled();
    },
  );

  it("offers upload_media from a URL only and fetches it through the host's fetch", async () => {
    const { server, fetchUrl } = hosted();
    const client = await connectServer(server);
    const upload = (await client.listTools()).tools.find(
      (t) => t.name === "upload_media",
    )!;

    expect(Object.keys(upload.inputSchema.properties ?? {})).not.toContain(
      "filePath",
    );

    const refused = await client.callTool({
      name: "upload_media",
      arguments: { workspace: "acme/shop", filePath: "/etc/passwd" },
    });
    expect(validationRefusal(refused)).toBeTruthy();

    const fetched = await client.callTool({
      name: "upload_media",
      arguments: { workspace: "acme/shop", url: "http://169.254.169.254/x" },
    });
    expect(text(fetched)).toBe("fetch blocked");
    expect(fetchUrl).toHaveBeenCalledWith("http://169.254.169.254/x");
  });

  it("runs a destructive tool at once, in the workspace the call named", async () => {
    const { server, clients } = hosted();
    const client = await connectServer(server);

    const result = await client.callTool({
      name: "delete_page",
      arguments: { workspace: "acme/shop", pageId: "6abd61e1a51c17ea3525336a" },
    });

    expect(
      text(result),
      "delete_page answered without reaching the workspace client - a confirmation step is back in the way",
    ).toContain("queried acme/shop");
    expect(clients["acme/blog"]!.query).not.toHaveBeenCalled();
  });

  it("binds update_region_settings to the resolved workspace's client", async () => {
    const { server } = hosted();
    const client = await connectServer(server);

    const result = await client.callTool({
      name: "update_region_settings",
      arguments: {
        workspace: "acme/blog",
        pageId: "6abd61e1a51c17ea3525336a",
        region: "sidebar",
        values: {},
      },
    });

    expect(text(result)).toContain("acme/blog");
  });

  it("lists the connection's workspaces as a read-only tool", async () => {
    const { server, listWorkspaces } = hosted();
    const client = await connectServer(server);
    const tool = (await client.listTools()).tools.find(
      (t) => t.name === LIST_WORKSPACES_TOOL,
    )!;

    expect(tool.annotations?.readOnlyHint).toBe(true);
    const result = await client.callTool({
      name: LIST_WORKSPACES_TOOL,
      arguments: {},
    });
    expect(JSON.parse(text(result))).toStrictEqual(
      await listWorkspaces.mock.results[0]!.value,
    );
  });

  it("enforces a tool's cross-field rule on the hosted path too", async () => {
    const { server, resolveWorkspace } = hosted();
    const client = await connectServer(server);

    const result = await client.callTool({
      name: "update_media_folder",
      arguments: { workspace: "acme/shop", id: "6abd61e1a51c17ea3525336a" },
    });

    expect(validationRefusal(result)).toBeTruthy();
    expect(resolveWorkspace).not.toHaveBeenCalled();
  });
});

describe("bindHostedTool (CMS-2095)", () => {
  function echoTool(confirmGated?: true): AiTool {
    return {
      name: "echo_input",
      description: "Echo",
      inputSchema: z.object({ value: z.string() }) as AiTool["inputSchema"],
      requiredPermissions: ["pages:edit"],
      ...(confirmGated ? { confirmGated } : {}),
      execute: async (input: unknown) => input,
    } as AiTool;
  }

  async function connectEcho(tool: AiTool) {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    bindHostedTool(server, tool, async () => ({
      tool,
      ops: {} as WorkspaceOps,
    }));
    return connectServer(server);
  }

  it("hands the tool its own arguments, without the workspace", async () => {
    const client = await connectEcho(echoTool());

    const result = await client.callTool({
      name: "echo_input",
      arguments: { workspace: "acme/shop", value: "x" },
    });

    expect(JSON.parse(text(result))).toStrictEqual({ value: "x" });
  });

  it("runs a destructive tool on its first call and advertises no confirmation argument", async () => {
    const client = await connectEcho(echoTool(true));

    const listed = (await client.listTools()).tools.find(
      (t) => t.name === "echo_input",
    )!;
    expect(Object.keys(listed.inputSchema.properties ?? {}).sort()).toEqual([
      "value",
      "workspace",
    ]);

    const result = await client.callTool({
      name: "echo_input",
      arguments: { workspace: "acme/shop", value: "x" },
    });
    expect(JSON.parse(text(result))).toStrictEqual({ value: "x" });
  });
});

describe("hosted helpers (CMS-2095)", () => {
  it("never lets the hosted upload policy read local files", () => {
    const fetchUrl = vi.fn();
    expect(hostedUploadPolicy(fetchUrl)).toStrictEqual({
      allowFilePath: false,
      fetchUrl,
    });
  });

  it("createCmssyApi forwards the document and its variables to the executor", async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const api = createCmssyApi(execute as never, "ws1", new Map());

    await api.query("query Q($id: ID!) { x }", { id: "p1" });

    expect(api.workspaceId).toBe("ws1");
    expect(execute).toHaveBeenCalledWith("query Q($id: ID!) { x }", {
      id: "p1",
    });
  });

  it("createCmssyApi introspects a type once per cache", async () => {
    const execute = vi.fn(async () => ({
      __type: {
        fields: [{ name: "title", type: { name: "String", kind: "SCALAR" } }],
      },
    }));
    const api = createCmssyApi(execute as never, "ws1", new Map());

    expect(await api.buildSelectionSet("SiteHeader")).toBe("title");
    expect(await api.buildSelectionSet("SiteHeader")).toBe("title");
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
