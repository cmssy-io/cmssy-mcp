import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_API_URL,
  informationalOutput,
  readValueFlags,
} from "../cli-flags.js";
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

describe("readValueFlags", () => {
  it("puts each flag's value in the field that flag names", () => {
    expect(
      readValueFlags([
        "--token",
        "cs_abc",
        "--workspace-id",
        "ws_1",
        "--api-url",
        "http://localhost:4000",
      ]),
      "The flag-to-field mapping is one table and every value in it is a key of the same object, so swapping two entries typechecks. This is the only thing that would notice: a token sent as the workspace header and a workspace id sent as the bearer token both start a server that fails every request with 401.",
    ).toStrictEqual({
      token: "cs_abc",
      workspaceId: "ws_1",
      apiUrl: "http://localhost:4000",
    });
  });

  it("sets no key for a flag nobody passed", () => {
    expect(
      Object.keys(readValueFlags(["--token", "cs_abc"])),
      "The result is spread over the environment defaults, so a key present with an undefined value would blank out CMSSY_WORKSPACE_ID instead of leaving it alone.",
    ).toStrictEqual(["token"]);
  });

  it.each(["--token", "--workspace-id", "--api-url"])(
    "does not read %s as a value for the flag before it",
    (flag) => {
      expect(readValueFlags([flag, "-v"])).toStrictEqual({
        [flag === "--token"
          ? "token"
          : flag === "--workspace-id"
            ? "workspaceId"
            : "apiUrl"]: "-v",
      });
    },
  );

  it("ignores a value flag with nothing after it", () => {
    expect(
      readValueFlags(["--token"]),
      "A trailing flag with no value is silently dropped, so the caller gets 'API token required' rather than 'missing value for --token'. Unchanged from before the extraction; asserted so a later reader knows it is the behaviour, not an accident.",
    ).toStrictEqual({});
  });

  it("does not answer for a key that only Object.prototype has", () => {
    expect(
      readValueFlags(["constructor", "--token", "cs_abc"]),
      "The table is a plain object indexed by the raw argument, so before the Object.hasOwn guard `VALUE_FLAGS[\"constructor\"]` was Object.prototype.constructor - truthy - and the stray word swallowed the --token that followed it. A configured invocation with one unexpected word in argv stopped starting.",
    ).toStrictEqual({ token: "cs_abc" });
  });

  it.each(["toString", "__proto__", "valueOf", "hasOwnProperty"])(
    "treats %s as an ordinary unknown argument",
    (arg) => {
      expect(readValueFlags([arg, "--api-url", "http://x"])).toStrictEqual({
        apiUrl: "http://x",
      });
    },
  );
});

describe("informationalOutput and inherited keys", () => {
  it.each(["constructor", "toString", "__proto__"])(
    "still answers --version after a stray %s",
    (arg) => {
      expect(
        informationalOutput([arg, "--version"]),
        "Same prototype-chain hole on the other reader: the stray word used to consume --version, so the one command that is supposed to work without configuration went back to starting a server.",
      ).toBe(PACKAGE_VERSION);
    },
  );
});

describe("the version flag on an already-configured server", () => {
  it("answers and exits instead of serving", () => {
    const run = spawnSync(
      process.execPath,
      ["--import", "tsx", ENTRY, "-v"],
      {
        env: {
          ...process.env,
          CMSSY_API_TOKEN: "cs_test",
          CMSSY_WORKSPACE_ID: "ws_test",
          CMSSY_API_URL: "http://localhost:4000",
        },
        encoding: "utf8",
        timeout: 60_000,
      },
    );

    expect(run.status).toBe(0);
    expect(
      run.stdout.trim(),
      "-v is read from anywhere in argv, so it reaches a server that has everything it needs to start. That is the point for a support thread, and the cost is that a launcher passing -v for verbosity gets a version string and a process that exits - which an MCP client reports as a server that died. Pinned so the trade is a decision and not a surprise.",
    ).toBe(PACKAGE_VERSION);
    expect(run.stdout).not.toContain("running");
  });
});
