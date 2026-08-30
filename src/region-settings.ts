import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CmssyClient } from "./graphql-client.js";
import {
  PAGE_REGION_SETTINGS_QUERY,
  UPDATE_LAYOUT_POSITION_SETTINGS_MUTATION,
} from "./queries.js";
import type { RegionSettingsEntry } from "./types.js";

export const updateRegionSettingsInputSchema = z.object({
  pageId: z.string().min(1).describe("The page id (from list_pages/get_page)"),
  region: z
    .string()
    .min(1)
    .describe(
      "Layout region (position) name declared by the workspace's layout manifest, e.g. 'sidebar' or 'header'",
    ),
  values: z
    .record(z.string(), z.unknown())
    .describe(
      "Settings values for the region, keyed as the manifest's region settings schema declares. Replaces this region's values; other regions keep theirs.",
    ),
  expectedVersion: z
    .number()
    .int()
    .optional()
    .describe(
      "Optimistic-concurrency guard. Defaults to the version read before the write.",
    ),
});

export type UpdateRegionSettingsInput = z.infer<
  typeof updateRegionSettingsInputSchema
>;

export interface UpdateRegionSettingsResult {
  id: string;
  version: number | null;
  region: string;
  regionSettings: RegionSettingsEntry[];
  hasUnpublishedLayoutChanges: boolean;
  updatedAt: string | null;
  blockWarnings?: string[];
}

export function mergeRegionSettings(
  existing: RegionSettingsEntry[],
  region: string,
  values: Record<string, unknown>,
): RegionSettingsEntry[] {
  const others = existing.filter((entry) => entry.position !== region);
  return [...others, { position: region, values }];
}

export async function updateRegionSettings(
  client: CmssyClient,
  input: UpdateRegionSettingsInput,
): Promise<UpdateRegionSettingsResult> {
  const current = await client.query<{
    page: {
      get: {
        id: string;
        version: number | null;
        layoutPositionSettings: RegionSettingsEntry[];
      } | null;
    };
  }>(PAGE_REGION_SETTINGS_QUERY, { pageId: input.pageId });
  if (!current.page.get) throw new Error("Page not found");

  const settings = mergeRegionSettings(
    current.page.get.layoutPositionSettings,
    input.region,
    input.values,
  );
  const expectedVersion = input.expectedVersion ?? current.page.get.version;
  const mutationInput: Record<string, unknown> = {
    pageId: input.pageId,
    settings,
  };
  if (expectedVersion != null) mutationInput.expectedVersion = expectedVersion;

  const res = await client.query<{
    page: {
      updateLayoutPositionSettings: {
        id: string;
        version: number | null;
        blockWarnings: string[] | null;
        hasUnpublishedLayoutChanges: boolean;
        updatedAt: string | null;
        layoutPositionSettings: RegionSettingsEntry[];
      } | null;
    };
  }>(UPDATE_LAYOUT_POSITION_SETTINGS_MUTATION, { input: mutationInput });
  const updated = res.page.updateLayoutPositionSettings;
  if (!updated) throw new Error("Page not found");

  const result: UpdateRegionSettingsResult = {
    id: updated.id,
    version: updated.version,
    region: input.region,
    regionSettings: updated.layoutPositionSettings,
    hasUnpublishedLayoutChanges: updated.hasUnpublishedLayoutChanges,
    updatedAt: updated.updatedAt,
  };
  if (updated.blockWarnings?.length)
    result.blockWarnings = updated.blockWarnings;
  return result;
}

export function registerRegionSettingsTool(
  server: McpServer,
  client: CmssyClient,
): void {
  server.tool(
    "update_region_settings",
    "Set the settings of one layout region (position) on a page, e.g. a sidebar's width or a header's variant. Reads the page's current region settings, replaces only the named region and writes the whole list back (page.updateLayoutPositionSettings). Values are validated against the workspace layout manifest's region settings schema: an unknown key or a region without a schema is rejected with the backend's BAD_USER_INPUT message. Child pages inherit the region's settings unless they set their own (see get_page.resolvedRegions).",
    updateRegionSettingsInputSchema.shape,
    async (input) => {
      try {
        const result = await updateRegionSettings(client, input);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: err instanceof Error ? err.message : String(err),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
