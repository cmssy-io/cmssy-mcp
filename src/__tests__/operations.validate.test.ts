import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect } from "vitest";
import { buildSchema, parse, validate } from "graphql";
import * as operations from "../queries.js";

// schema.graphql is a committed copy of the backend's canonical SDL
// (`pnpm --filter backend print-schema` in the cmssy repo). Refresh it whenever
// the backend schema changes so this harness validates against the live surface.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SDL_PATH = join(
  REPO_ROOT,
  process.env.CMSSY_SCHEMA_FILE ?? "schema.graphql",
);
const schema = buildSchema(readFileSync(SDL_PATH, "utf8"));

const ops = Object.entries(operations).flatMap(([name, op]) =>
  typeof op === "string" ? [[name, op] as [string, string]] : [],
);

describe("MCP operations validate against the backend SDL", () => {
  it("exports at least one operation", () => {
    expect(ops.length).toBeGreaterThan(0);
  });

  it.each(ops)("%s is valid", (_name, op) => {
    const errors = validate(schema, parse(op));
    expect(errors.map((e) => e.message)).toEqual([]);
  });
});
