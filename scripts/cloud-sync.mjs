// Development only: the catalog packages these checked-in files without compiling.
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const check = process.argv.includes("--check");
for (const [name, format] of [
  ["host", "cjs"],
  ["panel", "iife"],
]) {
  const outfile = `plugins/catvinci.cloud-sync/${name}.js`;
  const result = await build({
    absWorkingDir: root,
    entryPoints: [`development/cloud-sync/src/${name}.ts`],
    bundle: true,
    platform: "browser",
    format,
    target: "es2020",
    outfile,
    write: false,
    legalComments: "inline",
  });
  const bytes = Buffer.from(result.outputFiles[0].contents);
  const path = new URL(`../${outfile}`, import.meta.url);
  if (check) {
    const existing = await readFile(path);
    if (!existing.equals(bytes))
      throw new Error(
        `${outfile} is stale; run npm run build:cloud-sync and commit it.`,
      );
  } else await writeFile(path, bytes);
}
console.log(
  `Cloud Sync: ${check ? "verified" : "updated"} readable host and panel.`,
);
