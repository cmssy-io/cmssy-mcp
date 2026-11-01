import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliRoot = join(root, "node_modules/@cmssy/cli");
const assetsRoot = join(cliRoot, "assets/init/next");
const target = join(root, "src/init-assets.generated.ts");

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const abs = join(dir, entry);
    return statSync(abs).isDirectory() ? walk(abs) : [abs];
  });
}

const version = JSON.parse(
  readFileSync(join(cliRoot, "package.json"), "utf8"),
).version;

const files = walk(assetsRoot)
  .map((abs) => {
    const rel = relative(assetsRoot, abs).split("\\").join("/");
    return {
      path: rel === "env.example" ? ".env.example" : rel,
      content: readFileSync(abs, "utf8"),
    };
  })
  .sort((a, b) => a.path.localeCompare(b.path));

const output =
  `export const INIT_ASSETS_VERSION = ${JSON.stringify(version)};\n\n` +
  `export const NEXT_INIT_FILES: ReadonlyArray<{ path: string; content: string }> = ${JSON.stringify(files, null, 2)};\n`;

if (process.argv.includes("--check")) {
  const current = readFileSync(target, "utf8");
  if (current !== output) {
    console.error(
      `src/init-assets.generated.ts is stale against @cmssy/cli ${version} - run pnpm init-assets`,
    );
    process.exit(1);
  }
  console.log(`init assets match @cmssy/cli ${version}`);
} else {
  writeFileSync(target, output);
  console.log(`Wrote ${files.length} files from @cmssy/cli ${version}`);
}
