import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PACKAGE_VERSION } from "../package-version.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

describe("listing manifests ship the published version", () => {
  it("bundles the same version in the MCPB manifest", () => {
    expect(readJson("mcpb/manifest.json").version).toBe(PACKAGE_VERSION);
  });
});
