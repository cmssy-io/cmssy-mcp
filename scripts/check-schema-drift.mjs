import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSchema,
  findBreakingChanges,
  lexicographicSortSchema,
  printSchema,
} from "graphql";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendoredPath = resolve(root, "schema.graphql");
const livePath = resolve(
  root,
  process.env.CMSSY_PROD_SCHEMA_OUT || "prod-schema.graphql",
);

const vendored = buildSchema(readFileSync(vendoredPath, "utf8"));
const live = buildSchema(readFileSync(livePath, "utf8"));

const normalize = (schema) => printSchema(lexicographicSortSchema(schema));

if (normalize(vendored) === normalize(live)) {
  console.log("Vendored SDL matches production.");
  process.exit(0);
}

const breaking = findBreakingChanges(vendored, live);

console.error("Vendored SDL has drifted from production.\n");
if (breaking.length > 0) {
  console.error(
    "Production no longer serves what the vendored copy promises - " +
      "operations validated against it may already be broken in prod:",
  );
  for (const change of breaking) {
    console.error(`  - [${change.type}] ${change.description}`);
  }
} else {
  console.error(
    "No breaking differences (production is ahead), but the copy is stale - " +
      "new fields are invisible to the harness.",
  );
}
console.error(
  "\nRefresh it: run `pnpm --filter backend print-schema` in the cmssy repo, " +
    "then `pnpm sync-schema` here.",
);
process.exit(1);
