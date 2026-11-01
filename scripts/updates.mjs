// Finds new versions of the community plugins listed on this branch and
// reviews them, for .github/workflows/updates.yml: a listing whose
// repository has a release v<x.y.z> newer than its version, with the zip,
// gets the new version reviewed and compared with the listed one
// (review-lib.mjs › changes). For each, <out>/<id>.json is the listing
// with the new version and the reviewed zip's sha256, <out>/<id>.md the
// pull request's body, and a line of <out>/updates.tsv says
// `<id> <version> automatic|manual`. Nothing from the plugins' repositories
// runs here: their zips and sources are only read.
//   node scripts/updates.mjs updates

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { changes, report } from "./review-lib.mjs";
import { communityEntry, newerRelease } from "./community.mjs";
import { reviewVersion } from "./review.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const out = process.argv[2] ?? "updates";
mkdirSync(out, { recursive: true });

const removed = new Set(JSON.parse(readFileSync(join(ROOT, "removed.json"), "utf8")).plugins);
const lines = [];
let errors = 0;
for (const file of readdirSync(join(ROOT, "community")).filter((f) => f.endsWith(".json")).sort()) {
  const json = JSON.parse(readFileSync(join(ROOT, "community", file), "utf8"));
  const entry = communityEntry(json, `community/${file}`);
  if (removed.has(entry.id)) continue;
  try {
    const releases = JSON.parse(
      execFileSync("gh", ["api", `repos/${entry.repo}/releases?per_page=100`], { encoding: "utf8" }),
    );
    const version = newerRelease(entry, releases);
    if (!version) {
      console.log(`${entry.id} ${entry.version}: up to date`);
      continue;
    }
    const listed = await reviewVersion(entry);
    // The listed zip changed since it was reviewed: nothing to compare with.
    if (entry.sha256 && listed.sha256 !== entry.sha256)
      throw new Error(`${entry.version}'s zip isn't the one reviewed (${entry.sha256})`);
    const nextEntry = { ...entry, version };
    const next = await reviewVersion(nextEntry, { previous: listed.manifest });
    const found = changes(
      { permissions: listed.manifest?.permissions ?? [], results: listed.results },
      { permissions: next.manifest?.permissions ?? [], results: next.results },
    );
    writeFileSync(
      join(out, `${entry.id}.json`),
      `${JSON.stringify({ ...json, version, sha256: next.sha256 }, null, 2)}\n`,
    );
    writeFileSync(join(out, `${entry.id}.md`), body(nextEntry, entry.version, next, found));
    lines.push(`${entry.id}\t${version}\t${found.automatic ? "automatic" : "manual"}\n`);
    console.log(`${entry.id} ${entry.version} -> ${version}: ${found.automatic ? "automatic" : "manual"}`);
  } catch (err) {
    errors++;
    console.log(`::error::${entry.id}: ${err.message}`);
  }
}
writeFileSync(join(out, "updates.tsv"), lines.join(""));
process.exit(errors ? 1 : 0);

function body(entry, listedVersion, next, found) {
  const why = [
    found.failed && "a check failed",
    found.newPermissions.length && `new permissions: ${found.newPermissions.join(", ")}`,
    ...found.newWarnings.map((r) => `new warning (${r.check}): ${r.detail}`),
  ].filter(Boolean);
  return [
    `New version of [${entry.id}](https://github.com/${entry.repo}/releases/tag/v${entry.version}), found and reviewed by the updates workflow.`,
    found.automatic
      ? `Compared with ${listedVersion}: no new permissions or warnings, so it is merged automatically.`
      : `Compared with ${listedVersion}, a maintainer decides:\n\n${why.map((w) => `- ${w}`).join("\n")}`,
    "## Plugin review",
    report(entry, next.results),
    `The zip reviewed: \`"sha256": "${next.sha256}"\``,
  ].join("\n\n") + "\n";
}
