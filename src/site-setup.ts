import { z } from "zod";
import type { AiTool } from "@cmssy/ai-tools";
import type { CmssyApi } from "./graphql-client.js";
import {
  INIT_ASSETS_VERSION,
  NEXT_INIT_FILES,
} from "./init-assets.generated.js";
import { SITE_SETUP_QUERY, UPDATE_PREVIEW_URL_MUTATION } from "./queries.js";

export const SITE_SETUP_INSTRUCTIONS = `cmssy is a headless CMS: the site is your own app, cmssy stores its pages and content, and the cmssy editor edits the app live inside a frame.

To build a website or app on cmssy, follow this order. Do not invent the wiring - every file comes from get_site_setup.

1. Call get_site_setup. It returns every file the app needs (catch-all page, editor route, proxy, config, block registry, layout), the npm packages and the env vars with their values.
2. Write those files exactly, then design the site's own blocks with defineBlock and register each one in cmssy/blocks.ts. A header, footer or sidebar is a layout block: declare layoutRegions on it (e.g. ["header"]) and render it through the layout regions the files already wire - never as a regular page block.
3. Deploy the app, then call set_preview_url with its exact deployed origin (e.g. https://my-site.vercel.app). Create a content.changed webhook with create_webhook pointing at <origin>/api/revalidate, set its signing secret as CMSSY_WEBHOOK_SECRET and redeploy - without it a publish reaches the site only after the page cache expires (up to an hour).
4. The cmssy editor reads your block types when it frames the deployed app. Ask the user to open a page in the cmssy editor once, then call list_block_types: only registered types can be added. New types register at once; a change that removes or reshapes types (such as dropping the sample hero) waits as a proposal - if your types are missing, ask the user to make the proposed manifest active in Settings -> Headless -> Block manifest.
5. Create pages with create_page and fill them with add_block_to_page. Put header and footer blocks into their regions on the home page with add_block_to_page and layoutRegion: "header" or "footer" - without layoutRegion the block lands in the page body. Layout is inherited down the page tree: a page created with parentId set to the home page's id inherits its header and footer, while a top-level page needs its own.
6. Call publish_page for every page. The public site serves published pages only - an unpublished page answers 404.`;

const NEXT_DEPENDENCIES = ["@cmssy/core", "@cmssy/next", "@cmssy/react"];

export const getSiteSetupInputSchema = z.object({
  framework: z
    .enum(["next"])
    .default("next")
    .describe(
      "The app framework. Only Next.js (App Router) is supported here.",
    ),
});

export type GetSiteSetupInput = z.infer<typeof getSiteSetupInputSchema>;

export interface SiteSetupFile {
  path: string;
  content: string;
}

export interface SiteSetupResult {
  framework: "next";
  sdkVersion: string;
  dependencies: string[];
  env: Record<string, string>;
  files: SiteSetupFile[];
  previewUrl: string | null;
  steps: string[];
}

interface SiteSetupData {
  workspace: {
    current: { slug: string; organization: { slug: string } | null } | null;
    draftSecret: string;
  };
  siteConfig: { get: { previewUrl: string | null } | null };
}

export function siteSetupSteps(): string[] {
  return [
    "Start from a Next.js App Router project. Delete app/page.tsx: it would shadow the cmssy page for /.",
    "The cmssy layouts (app/[[...path]]/layout.tsx and app/cmssy-edit/[[...path]]/layout.tsx) render <html> and <body>. Move the global CSS import and the metadata export from app/layout.tsx into both of them, then delete app/layout.tsx.",
    "Write every file in `files` at its path from the project root. When the app lives in src/app, put them under src/ instead (src/proxy.ts, src/cmssy.config.ts, src/cmssy/...) - proxy.ts must sit next to the app directory or Next never runs it.",
    `Add ${NEXT_DEPENDENCIES.map((name) => `${name}@^${INIT_ASSETS_VERSION}`).join(", ")} to dependencies. If a pnpm install then fails with ERR_PNPM_IGNORED_BUILDS, list each package it names under allowBuilds in pnpm-workspace.yaml (allowBuilds:\n  <package>: true).`,
    "Set every variable in `env` on the deployment (all environments). CMSSY_DRAFT_SECRET is server-only - never expose it to the browser or prefix it with NEXT_PUBLIC_.",
    "Replace the sample hero block with the site's own blocks: each one a defineBlock from @cmssy/react, registered in cmssy/blocks.ts. Header and footer blocks declare layoutRegions: ['header'] or ['footer'] - cmssy.config.ts already declares those regions.",
    "Deploy, then call set_preview_url with the deployed origin.",
    "Call create_webhook for the content.changed event with the URL <origin>/api/revalidate, set the signing secret it returns as CMSSY_WEBHOOK_SECRET on the deployment, and redeploy.",
    "Have the user open a page in the cmssy editor once so it reads the block types, then call list_block_types. If your types are missing, the change removed or reshaped a type and waits as a proposal: ask the user to make it active in Settings -> Headless -> Block manifest.",
    "Create the pages, add header and footer blocks to the home page with add_block_to_page and layoutRegion 'header' / 'footer' (pages created with parentId set to the home page inherit them; top-level pages need their own), and call publish_page for each page.",
  ];
}

export async function getSiteSetup(
  client: CmssyApi,
  _input: GetSiteSetupInput,
): Promise<SiteSetupResult> {
  const data = await client.query<SiteSetupData>(SITE_SETUP_QUERY);
  const workspace = data.workspace.current;
  if (!workspace?.organization) throw new Error("Workspace not found");

  return {
    framework: "next",
    sdkVersion: INIT_ASSETS_VERSION,
    dependencies: NEXT_DEPENDENCIES.map(
      (name) => `${name}@^${INIT_ASSETS_VERSION}`,
    ),
    env: {
      CMSSY_ORG_SLUG: workspace.organization.slug,
      CMSSY_WORKSPACE_SLUG: workspace.slug,
      CMSSY_DRAFT_SECRET: data.workspace.draftSecret,
    },
    files: NEXT_INIT_FILES.map(({ path, content }) => ({ path, content })),
    previewUrl: data.siteConfig.get?.previewUrl ?? null,
    steps: siteSetupSteps(),
  };
}

export function createGetSiteSetupTool(
  client: CmssyApi,
): AiTool<GetSiteSetupInput, SiteSetupResult> {
  return {
    name: "get_site_setup",
    description:
      "Everything needed to build a website or app on this cmssy workspace: the exact files to write (catch-all page, editor route, proxy, config, block registry, header/footer layout regions), the npm packages, the env vars filled in for this workspace (CMSSY_DRAFT_SECRET included - server-only), and the steps in order. Call it first whenever you build or wire a site, instead of reconstructing the setup from documentation.",
    inputSchema: getSiteSetupInputSchema,
    requiredPermissions: ["pages:edit"],
    execute: (input) => getSiteSetup(client, input),
  };
}

export const setPreviewUrlInputSchema = z.object({
  url: z
    .string()
    .min(1)
    .describe(
      "The deployed app's URL, e.g. https://my-site.vercel.app. Only its origin is stored.",
    ),
});

export type SetPreviewUrlInput = z.infer<typeof setPreviewUrlInputSchema>;

export function previewOrigin(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Not a URL: ${url}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`The preview URL must be http(s): ${url}`);
  }
  return parsed.origin;
}

export async function setPreviewUrl(
  client: CmssyApi,
  input: SetPreviewUrlInput,
): Promise<{ previewUrl: string | null }> {
  const previewUrl = previewOrigin(input.url);
  const res = await client.query<{
    siteConfig: { update: { previewUrl: string | null } };
  }>(UPDATE_PREVIEW_URL_MUTATION, { input: { previewUrl } });
  return { previewUrl: res.siteConfig.update.previewUrl };
}

export function createSetPreviewUrlTool(
  client: CmssyApi,
): AiTool<SetPreviewUrlInput, { previewUrl: string | null }> {
  return {
    name: "set_preview_url",
    description:
      "Point the cmssy editor at the deployed app: stores the origin of `url` as the workspace preview URL, the address the editor frames. Use the exact deployed origin (https://my-site.vercel.app) - a wrong host, such as an added www., leaves the editor reporting that the preview did not respond.",
    inputSchema: setPreviewUrlInputSchema,
    requiredPermissions: ["site:config:edit"],
    execute: (input) => setPreviewUrl(client, input),
  };
}
