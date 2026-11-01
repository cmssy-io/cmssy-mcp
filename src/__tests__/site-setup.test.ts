import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createHostedServer } from "../hosted-server.js";
import type { CmssyApi, CmssyClient } from "../graphql-client.js";
import { createServer } from "../server.js";
import {
  INIT_ASSETS_VERSION,
  NEXT_INIT_FILES,
} from "../init-assets.generated.js";
import {
  getSiteSetup,
  previewOrigin,
  setPreviewUrl,
  SITE_SETUP_INSTRUCTIONS,
} from "../site-setup.js";
import { connectServer } from "./mcp-harness.js";

const setupData = {
  workspace: {
    current: { slug: "builders-test", organization: { slug: "cmssy" } },
    draftSecret: "draft-secret-value",
  },
  siteConfig: { get: { previewUrl: null } },
};

function recordingClient(respond: (document: string) => unknown) {
  const calls: { document: string; variables: unknown }[] = [];
  const client: CmssyApi = {
    workspaceId: "ws",
    query: vi.fn(async (document: string, variables?: unknown) => {
      calls.push({ document, variables });
      return respond(document);
    }) as CmssyApi["query"],
    buildSelectionSet: vi.fn(),
  };
  return { client, calls };
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const abs = join(dir, entry);
    return statSync(abs).isDirectory() ? filesUnder(abs) : [abs];
  });
}

describe("get_site_setup", () => {
  it("fills the env vars from the workspace it is called for", async () => {
    const { client } = recordingClient(() => setupData);

    const setup = await getSiteSetup(client, { framework: "next" });

    expect(setup.env).toStrictEqual({
      CMSSY_ORG_SLUG: "cmssy",
      CMSSY_WORKSPACE_SLUG: "builders-test",
      CMSSY_DRAFT_SECRET: "draft-secret-value",
    });
  });

  it("hands over the editor route and the proxy that rewrites editor traffic onto it", async () => {
    const { client } = recordingClient(() => setupData);

    const { files } = await getSiteSetup(client, { framework: "next" });
    const byPath = new Map(files.map((file) => [file.path, file.content]));

    expect(byPath.get("proxy.ts")).toContain("createCmssyProxy(cmssy)");
    expect(byPath.get("app/cmssy-edit/[[...path]]/page.tsx")).toContain(
      "createCmssyEditPage",
    );
    expect(byPath.get("cmssy.config.ts")).toContain('id: "header"');
  });

  it("pins the SDK packages to the version its files came from", async () => {
    const { client } = recordingClient(() => setupData);

    const { dependencies } = await getSiteSetup(client, { framework: "next" });

    expect(dependencies).toStrictEqual([
      `@cmssy/core@^${INIT_ASSETS_VERSION}`,
      `@cmssy/next@^${INIT_ASSETS_VERSION}`,
      `@cmssy/react@^${INIT_ASSETS_VERSION}`,
    ]);
  });

  it("refuses when the workspace cannot be read", async () => {
    const { client } = recordingClient(() => ({
      ...setupData,
      workspace: { current: null, draftSecret: "x" },
    }));

    await expect(getSiteSetup(client, { framework: "next" })).rejects.toThrow(
      "Workspace not found",
    );
  });
});

describe("bundled init files", () => {
  it("match the installed @cmssy/cli templates byte for byte", () => {
    const root = join(process.cwd(), "node_modules/@cmssy/cli");
    const assets = join(root, "assets/init/next");
    const installed = filesUnder(assets)
      .map((abs) => {
        const rel = relative(assets, abs).split("\\").join("/");
        return {
          path: rel === "env.example" ? ".env.example" : rel,
          content: readFileSync(abs, "utf8"),
        };
      })
      .sort((a, b) => a.path.localeCompare(b.path));
    const version = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ).version;

    expect(INIT_ASSETS_VERSION).toBe(version);
    expect(NEXT_INIT_FILES).toStrictEqual(installed);
  });
});

describe("set_preview_url", () => {
  it("stores only the origin of the deployed URL", async () => {
    const { client, calls } = recordingClient(() => ({
      siteConfig: { update: { previewUrl: "https://my-site.vercel.app" } },
    }));

    const result = await setPreviewUrl(client, {
      url: "https://my-site.vercel.app/about?x=1",
    });

    expect(calls[0]!.variables).toStrictEqual({
      input: { previewUrl: "https://my-site.vercel.app" },
    });
    expect(result).toStrictEqual({ previewUrl: "https://my-site.vercel.app" });
  });

  it.each([
    ["not a URL", "my-site.vercel.app"],
    ["not http(s)", "ftp://my-site.vercel.app"],
  ])("refuses %s without writing", async (_label, url) => {
    const { client, calls } = recordingClient(() => ({}));

    expect(() => previewOrigin(url)).toThrow();
    await expect(setPreviewUrl(client, { url })).rejects.toThrow();
    expect(calls).toStrictEqual([]);
  });
});

describe("hosted get_site_setup", () => {
  it("reads the workspace the call names", async () => {
    const { client: workspaceClient } = recordingClient(() => setupData);
    const resolveWorkspace = vi.fn(async () => ({ client: workspaceClient }));
    const client = await connectServer(
      createHostedServer({
        listWorkspaces: vi.fn(async () => []),
        resolveWorkspace,
        fetchUrl: vi.fn(),
      }),
    );

    const result = await client.callTool({
      name: "get_site_setup",
      arguments: { workspace: "cmssy/builders-test" },
    });

    expect(result.isError).toBeFalsy();
    expect(resolveWorkspace).toHaveBeenCalledWith("cmssy/builders-test");
    const text = (result as { content: { text: string }[] }).content[0]!.text;
    expect(JSON.parse(text).env.CMSSY_WORKSPACE_SLUG).toBe("builders-test");
  });

  it("writes set_preview_url to the workspace the call names", async () => {
    const { client: workspaceClient, calls } = recordingClient(() => ({
      siteConfig: { update: { previewUrl: "https://my-site.vercel.app" } },
    }));
    const client = await connectServer(
      createHostedServer({
        listWorkspaces: vi.fn(async () => []),
        resolveWorkspace: vi.fn(async () => ({ client: workspaceClient })),
        fetchUrl: vi.fn(),
      }),
    );

    const result = await client.callTool({
      name: "set_preview_url",
      arguments: {
        workspace: "cmssy/builders-test",
        url: "https://my-site.vercel.app/",
      },
    });

    expect(result.isError).toBeFalsy();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.variables).toStrictEqual({
      input: { previewUrl: "https://my-site.vercel.app" },
    });
  });
});

describe("server instructions", () => {
  it("both servers tell a connecting agent to start from get_site_setup", async () => {
    const stdio = await connectServer(
      createServer({ query: vi.fn() } as unknown as CmssyClient),
    );
    const hosted = await connectServer(
      createHostedServer({
        listWorkspaces: vi.fn(async () => []),
        resolveWorkspace: vi.fn(),
        fetchUrl: vi.fn(),
      }),
    );

    for (const client of [stdio, hosted]) {
      expect(client.getInstructions()).toBe(SITE_SETUP_INSTRUCTIONS);
      const names = (await client.listTools()).tools.map((tool) => tool.name);
      expect(names).toContain("get_site_setup");
      expect(names).toContain("set_preview_url");
    }
    expect(SITE_SETUP_INSTRUCTIONS).toContain("get_site_setup");
  });
});
