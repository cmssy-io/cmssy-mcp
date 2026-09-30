import { PACKAGE_VERSION } from "./package-version.js";

export interface GivenOptions {
  token: string;
  workspaceId: string;
  apiUrl: string;
}

export const DEFAULT_API_URL = "https://api.cmssy.io";

export const VALUE_FLAGS: Readonly<Record<string, keyof GivenOptions>> =
  Object.freeze({
    "--token": "token",
    "--workspace-id": "workspaceId",
    "--api-url": "apiUrl",
  });

function valueFlag(arg: string): keyof GivenOptions | null {
  return Object.hasOwn(VALUE_FLAGS, arg) ? VALUE_FLAGS[arg] : null;
}

export function readValueFlags(
  args: readonly string[],
): Partial<GivenOptions> {
  const given: Partial<GivenOptions> = {};

  for (let i = 0; i < args.length; i++) {
    const key = valueFlag(args[i]);
    const next = args[i + 1];

    if (key && next) {
      given[key] = next;
      i++;
    }
  }

  return given;
}

const VERSION_FLAGS = new Set(["--version", "-v"]);
const HELP_FLAGS = new Set(["--help", "-h"]);

export const USAGE = `cmssy-mcp-server ${PACKAGE_VERSION}

Serves a cmssy workspace to an MCP client over stdio.

Usage: cmssy-mcp-server [options]

Options:
  --token <cs_...>      API token; or CMSSY_API_TOKEN
  --workspace-id <id>   Workspace to serve; or CMSSY_WORKSPACE_ID
  --api-url <url>       API to reach; or CMSSY_API_URL (default ${DEFAULT_API_URL})
  -v, --version         Print the version and exit
  -h, --help            Print this and exit`;

export function informationalOutput(args: readonly string[]): string | null {
  let usage = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (valueFlag(arg) && args[i + 1]) {
      i++;
      continue;
    }
    if (VERSION_FLAGS.has(arg)) return PACKAGE_VERSION;
    if (HELP_FLAGS.has(arg)) usage = true;
  }

  return usage ? USAGE : null;
}
