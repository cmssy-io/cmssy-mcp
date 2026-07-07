import { copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Refreshes the vendored backend SDL that operations.validate.test.ts checks
// every embedded operation against. Point CMSSY_BACKEND_SCHEMA at the cmssy
// repo's printed schema, or keep the default sibling-checkout path. Regenerate
// the source first with `pnpm --filter backend print-schema` in the cmssy repo.
// Run this whenever the backend schema changes so the harness validates against
// the live surface - a stale SDL is what let namespaced fields drift undetected.

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Resolve the override relative to the repo root (absolute paths pass through)
// so behavior is identical no matter which directory the script is run from.
const src = process.env.CMSSY_BACKEND_SCHEMA
  ? resolve(root, process.env.CMSSY_BACKEND_SCHEMA)
  : resolve(root, "../cmssy/apps/backend/schema.graphql");
const dest = resolve(root, "schema.graphql");

if (!existsSync(src)) {
  console.error(
    `Backend SDL not found at ${src}.\n` +
      "Set CMSSY_BACKEND_SCHEMA to ../cmssy/apps/backend/schema.graphql " +
      "(run `pnpm --filter backend print-schema` in the cmssy repo first).",
  );
  process.exit(1);
}

copyFileSync(src, dest);
console.log(`Synced backend SDL: ${src} -> ${dest}`);
