import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  buildSchema,
  coerceInputValue,
  isInputObjectType,
  parse,
  validate,
} from "graphql";
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

// Validating the document alone proves nothing about what goes inside an input
// object variable: a required field the backend adds, or one this client stops
// sending, is invisible to `validate`. These coerce the payloads the tools
// actually build.
const PAYLOADS: Array<[string, string, Record<string, unknown>]> = [
  [
    "UploadMediaInput",
    "UploadMediaInput",
    {
      pathname: "ws/8f3a1c2b-photo.png",
      filename: "photo.png",
      type: "image",
      mimeType: "image/png",
      size: 1024,
    },
  ],
  [
    "UpdateLayoutRegionSettingsInput",
    "UpdateLayoutRegionSettingsInput",
    {
      pageId: "p1",
      expectedVersion: 7,
      settings: [{ region: "sidebar", values: { width: "wide" } }],
    },
  ],
];

describe("MCP variable payloads satisfy the backend SDL", () => {
  it.each(PAYLOADS)("%s is complete", (_name, typeName, payload) => {
    const type = schema.getType(typeName);
    if (!type || !isInputObjectType(type)) {
      throw new Error(`${typeName} is not an input object in the SDL`);
    }

    const errors: string[] = [];
    coerceInputValue(payload, type, (path, _value, error) => {
      errors.push(`${path.join(".")}: ${error.message}`);
    });

    expect(errors).toEqual([]);
  });
});
