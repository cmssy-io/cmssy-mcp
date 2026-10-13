import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PACKAGE_VERSION } from "../package-version.js";

const root = resolve(import.meta.dirname, "../..");

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

describe("listing manifests ship the published version", () => {
  it("bundles the same version in the MCPB manifest", () => {
    expect(readJson("mcpb/manifest.json").version).toBe(PACKAGE_VERSION);
  });

  it("pins the Claude plugin to the same npm version it declares", () => {
    const plugin = readJson("claude-plugin/.claude-plugin/plugin.json") as {
      version: string;
      mcpServers: { cmssy: { args: string[] } };
    };

    expect(plugin.version).toBe(PACKAGE_VERSION);
    expect(plugin.mcpServers.cmssy.args).toContain(
      `@cmssy/mcp-server@${PACKAGE_VERSION}`,
    );
  });
});
