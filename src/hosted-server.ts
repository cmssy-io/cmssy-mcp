import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { uploadMediaFromUrlTool, type AiTool } from "@cmssy/ai-tools";
import { createMcpWorkspaceOps } from "./ai-tools-ops.js";
import {
  bindHostedTool,
  toolAnnotations,
  toolTitle,
  type HostedTarget,
} from "./ai-tools-binder.js";
import type { CmssyApi } from "./graphql-client.js";
import type { FetchUrl, UploadSourcePolicy } from "./media-upload.js";
import { PACKAGE_VERSION } from "./package-version.js";
import { createUpdateRegionSettingsTool } from "./region-settings.js";
import {
  createGetSiteSetupTool,
  createSetPreviewUrlTool,
  SITE_SETUP_INSTRUCTIONS,
} from "./site-setup.js";
import { toolCatalogue } from "./server.js";

export interface HostedWorkspace {
  workspace: string;
  name: string;
  organization: string;
  role: string;
}

export interface HostedWorkspaceAccess {
  client: CmssyApi;
}

export interface HostedServerOptions {
  listWorkspaces(): Promise<HostedWorkspace[]>;
  resolveWorkspace(workspace: string): Promise<HostedWorkspaceAccess>;
  fetchUrl: FetchUrl;
}

export const LIST_WORKSPACES_TOOL = "list_workspaces";

const unresolvedClient: CmssyApi = {
  workspaceId: "",
  query: () => Promise.reject(new Error("No workspace resolved")),
  buildSelectionSet: () => Promise.reject(new Error("No workspace resolved")),
};

export function hostedUploadPolicy(fetchUrl: FetchUrl): UploadSourcePolicy {
  return { allowFilePath: false, fetchUrl };
}

const CLIENT_BOUND_TOOLS: Record<string, (client: CmssyApi) => AiTool> = {
  update_region_settings: (client) =>
    createUpdateRegionSettingsTool(client) as AiTool,
  get_site_setup: (client) => createGetSiteSetupTool(client) as AiTool,
  set_preview_url: (client) => createSetPreviewUrlTool(client) as AiTool,
};

function toolForClient(template: AiTool, client: CmssyApi): AiTool {
  return CLIENT_BOUND_TOOLS[template.name]?.(client) ?? template;
}

export function createHostedServer(options: HostedServerOptions): McpServer {
  const server = new McpServer(
    { name: "cmssy", version: PACKAGE_VERSION },
    { instructions: SITE_SETUP_INSTRUCTIONS },
  );
  const uploadPolicy = hostedUploadPolicy(options.fetchUrl);

  server.registerTool(
    LIST_WORKSPACES_TOOL,
    {
      title: toolTitle(LIST_WORKSPACES_TOOL),
      description:
        "List the workspaces this connection may act in, each as <orgSlug>/<workspaceSlug> with its name, organization and your role there. Every other tool takes one of these as its `workspace` argument; what it may do there follows that role.",
      inputSchema: z.object({}).strict(),
      annotations: toolAnnotations({
        name: LIST_WORKSPACES_TOOL,
        requiredPermissions: [],
      }),
    },
    async () => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(await options.listWorkspaces(), null, 2),
        },
      ],
    }),
  );

  for (const template of toolCatalogue(
    unresolvedClient,
    uploadMediaFromUrlTool as AiTool,
  )) {
    bindHostedTool(
      server,
      template,
      async (workspace, tool): Promise<HostedTarget> => {
        const { client } = await options.resolveWorkspace(workspace);
        return {
          tool: toolForClient(tool, client),
          ops: createMcpWorkspaceOps(client, uploadPolicy),
        };
      },
    );
  }

  return server;
}
