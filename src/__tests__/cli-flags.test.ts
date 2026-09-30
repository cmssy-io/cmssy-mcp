import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_API_URL, informationalOutput } from "../cli-flags.js";
import { PACKAGE_VERSION } from "../package-version.js";

const ENTRY = fileURLToPath(new URL("../index.ts", import.meta.url));

const TOKEN_ERROR = "API token required";

function runCli(...args: string[]) {
  const env = { ...process.env };
  delete env.CMSSY_API_TOKEN;
  delete env.CMSSY_WORKSPACE_ID;
  delete env.CMSSY_API_URL;

  return spawnSync(process.execPath, ["--import", "tsx", ENTRY, ...args], {
    env,
    encoding: "utf8",
    timeout: 60_000,
  });
}

describe("informationalOutput", () => {
  it.each(["--version", "-v"])("answers %s with the version alone", (flag) => {
    expect(
      informationalOutput([flag]),
      "a caller diagnosing which build is running pipes this somewhere; a banner around it would have to be stripped",
    ).toBe(PACKAGE_VERSION);
  });

  it.each(["--help", "-h"])("answers %s with the usage", (flag) => {
    const out = informationalOutput([flag]);
    expect(out).toContain("Usage: cmssy-mcp-server");
    expect(out).toContain("--workspace-id");
    expect(
      out,
      "the usage names the version too, so a support thread that pasted --help does not need a second round trip",
    ).toContain(PACKAGE_VERSION);
  });

  it("answers the version when both are asked for", () => {
    expect(informationalOutput(["--help", "--version"])).toBe(PACKAGE_VERSION);
  });

  it("finds the flag wherever it sits, because a client config puts it last", () => {
    expect(
      informationalOutput(["--api-url", "https://api.cmssy.io", "--version"]),
    ).toBe(PACKAGE_VERSION);
  });

  it("stays out of the way when no flag asks for it", () => {
    expect(
      informationalOutput(["--token", "cs_x", "--workspace-id", "w"]),
      "returning a string here would print it instead of starting the server",
    ).toBeNull();
  });

  it("does not read a flag out of a value", () => {
    expect(
      informationalOutput(["--token", "-v"]),
      "a token is consumed as the value of --token; treating it as a request for the version would refuse to start a server whose token happens to look like a flag",
    ).toBeNull();
  });

  it("does not read a flag out of an api url either", () => {
    expect(
      informationalOutput(["--api-url", "-h"]),
      "one table names the flags that consume the next argument, and both readers walk it; a second copy is how the two would disagree",
    ).toBeNull();
  });

  it("names the default api url the server would actually use", () => {
    expect(
      DEFAULT_API_URL,
      "pinned as a literal: asserting the usage contains the constant would pass just as happily if both moved to the wrong host together",
    ).toBe("https://api.cmssy.io");
    expect(
      informationalOutput(["--help"]),
      "the usage is the one place a caller reads what happens when the flag is left out; a hand-written url here would be a second copy of the default",
    ).toContain(DEFAULT_API_URL);
  });

  it("reads the version out of package.json rather than a literal", () => {
    const declared = JSON.parse(
      readFileSync(
        fileURLToPath(new URL("../../package.json", import.meta.url)),
        "utf8",
      ),
    ) as { version: string };

    expect(
      PACKAGE_VERSION,
      "server.json's version drifted to 0.73.1 in git exactly because it was maintained by hand (CMS-1971); a literal here would drift the same way and lie in the one place someone looks to rule drift out",
    ).toBe(declared.version);
  });
});

describe("the started process answers before it asks for credentials", () => {
  it("prints the version and exits 0 with the environment cleared", () => {
    const run = runCli("--version");

    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout.trim()).toBe(PACKAGE_VERSION);
    expect(
      run.stderr,
      "the token check lives in parseArgs; if a later edit moves argument handling back behind it, this is the assertion that fails rather than a user discovering it mid-incident",
    ).not.toContain(TOKEN_ERROR);
  });

  it("prints the usage and exits 0 with the environment cleared", () => {
    const run = runCli("--help");

    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain("Usage: cmssy-mcp-server");
    expect(run.stderr).not.toContain(TOKEN_ERROR);
  });

  it("still refuses to start with no token and no flag", () => {
    const run = runCli();

    expect(
      run.status,
      "Positive control for the two assertions above: without it, a harness that failed to reach the token check at all would report the same clean stderr and prove nothing.",
    ).toBe(1);
    expect(run.stderr).toContain(TOKEN_ERROR);
  });
});
