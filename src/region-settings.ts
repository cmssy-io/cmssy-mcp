import { z } from "zod";
import type { AiTool } from "@cmssy/ai-tools";
import type { CmssyClient } from "./graphql-client.js";
import {
  LAYOUT_REGIONS_QUERY,
  PAGE_REGION_SETTINGS_QUERY,
  UPDATE_LAYOUT_REGION_SETTINGS_MUTATION,
} from "./queries.js";
import type { RegionSettingsEntry } from "./types.js";

export const updateRegionSettingsInputSchema = z.object({
  pageId: z.string().min(1).describe("The page id (from list_pages/get_page)"),
  region: z
    .string()
    .min(1)
    .describe(
      "Layout region name declared by the workspace's layout manifest, e.g. 'sidebar' or 'header'",
    ),
  values: z
    .record(z.string(), z.unknown())
    .describe(
      "Settings values for the region, keyed as the manifest's region settings schema declares. Replaces this region's values; other regions keep theirs. A region that declares no settings accepts {} only.",
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

export interface LayoutRegion {
  id: string;
  settings?: Record<string, unknown>;
}

export const DEFAULT_LAYOUT_REGIONS: LayoutRegion[] = [
  { id: "header" },
  { id: "footer" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseLayoutRegions(value: unknown): LayoutRegion[] {
  if (!Array.isArray(value)) return DEFAULT_LAYOUT_REGIONS;
  const regions: LayoutRegion[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const { id, settings } = entry;
    if (typeof id !== "string" || id.length === 0) continue;
    regions.push(isRecord(settings) ? { id, settings } : { id });
  }
  return regions.length > 0 ? regions : DEFAULT_LAYOUT_REGIONS;
}

export function pruneRegionSettings(
  regions: LayoutRegion[],
  entries: RegionSettingsEntry[],
): RegionSettingsEntry[] {
  const byId = new Map(regions.map((region) => [region.id, region]));
  return entries.flatMap((entry) => {
    const region = byId.get(entry.region);
    if (!region) return [];
    const schema = region.settings;
    if (!schema) return [{ ...entry, values: {} }];
    const values = Object.fromEntries(
      Object.entries(entry.values).filter(([key]) =>
        Object.hasOwn(schema, key),
      ),
    );
    return [{ ...entry, values }];
  });
}

export function mergeRegionSettings(
  existing: RegionSettingsEntry[],
  region: string,
  values: Record<string, unknown>,
): RegionSettingsEntry[] {
  const others = existing.filter((entry) => entry.region !== region);
  return [...others, { region, values }];
}

async function loadLayoutRegions(client: CmssyClient): Promise<LayoutRegion[]> {
  const res = await client.query<{
    blockManifest: { get: { regions?: unknown } | null };
  }>(LAYOUT_REGIONS_QUERY);
  return parseLayoutRegions(res.blockManifest.get?.regions);
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

  const regions = await loadLayoutRegions(client);
  const settings = mergeRegionSettings(
    pruneRegionSettings(regions, current.page.get.layoutPositionSettings),
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
  }>(UPDATE_LAYOUT_REGION_SETTINGS_MUTATION, { input: mutationInput });
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

export function createUpdateRegionSettingsTool(
  client: CmssyClient,
): AiTool<UpdateRegionSettingsInput, UpdateRegionSettingsResult> {
  return {
    name: "update_region_settings",
    description:
      "Set the settings of one layout region on a page, e.g. a sidebar's width or a header's variant. Reads the page's current region settings, replaces only the named region and writes the whole list back (page.updateLayoutPositionSettings); entries for regions or keys the manifest no longer declares are pruned on the way. Values are validated against the workspace layout manifest's region settings schema: an unknown region, an unknown key, or non-empty values on a region that declares no settings (such a region accepts {} only) is rejected with the backend's BAD_USER_INPUT message. Child pages inherit the region's settings unless they set their own (see get_page.resolvedRegions).",
    inputSchema: updateRegionSettingsInputSchema,
    requiredPermissions: ["pages:edit"],
    execute: (input) => updateRegionSettings(client, input),
  };
}
