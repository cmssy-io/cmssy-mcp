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
import type { ConfirmStore } from "./confirm-gate.js";
import type { CmssyApi } from "./graphql-client.js";
import type { FetchUrl } from "./media-upload.js";
import { PACKAGE_VERSION } from "./package-version.js";
import { createUpdateRegionSettingsTool } from "./region-settings.js";
import { toolCatalogue } from "./server.js";

export interface HostedWorkspace {
  workspace: string;
  name: string;
  organization: string;
  role: string;
}

export interface HostedWorkspaceAccess {
  client: CmssyApi;
  confirm: ConfirmStore;
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

function toolForClient(template: AiTool, client: CmssyApi): AiTool {
  return template.name === "update_region_settings"
    ? (createUpdateRegionSettingsTool(client) as AiTool)
    : template;
}

export function createHostedServer(options: HostedServerOptions): McpServer {
  const server = new McpServer({ name: "cmssy", version: PACKAGE_VERSION });
  const uploadPolicy = { allowFilePath: false, fetchUrl: options.fetchUrl };

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
        const { client, confirm } = await options.resolveWorkspace(workspace);
        return {
          tool: toolForClient(tool, client),
          ops: createMcpWorkspaceOps(client, uploadPolicy),
          confirm,
        };
      },
    );
  }

  return server;
}
