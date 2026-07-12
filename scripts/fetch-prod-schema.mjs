import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildClientSchema, getIntrospectionQuery, printSchema } from "graphql";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const endpoint =
  process.env.CMSSY_API_URL?.trim() || "https://api.cmssy.io/graphql";
const dest = resolve(root, process.env.CMSSY_PROD_SCHEMA_OUT || "prod-schema.graphql");

const res = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ query: getIntrospectionQuery() }),
});

if (!res.ok) {
  console.error(`Introspection failed: ${endpoint} returned ${res.status}`);
  process.exit(1);
}

const body = await res.json();
if (body.errors?.length || !body.data) {
  console.error(
    `Introspection failed: ${JSON.stringify(body.errors ?? body, null, 2)}`,
  );
  process.exit(1);
}

writeFileSync(dest, printSchema(buildClientSchema(body.data)) + "\n");
console.log(`Fetched live SDL: ${endpoint} -> ${dest}`);
