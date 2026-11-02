// Reviews community plugin versions (review-lib.mjs) for the pull request
// that lists them: each community/<id>.json named on the command line -
// its release zip and its repository at the version's tag fetched from
// GitHub - with the result written as Markdown (review.md, the PR
// comment) and the exit status failing when any check does.
//   node scripts/review.mjs community/jane.word-count.json [...]
// scripts/updates.mjs reviews new versions with reviewVersion.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { report, review, verdict } from "./review-lib.mjs";
import { communityEntry, releaseZipUrl } from "./community.mjs";

const CATALOG =
  "https://github.com/CatVinci-Studio/textus-plugins/releases/download/catalog/index.json";

async function fetchBytes(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/** A zip's files by path; `strip` drops the first folder (a GitHub
 *  source archive's), `skip` leaves paths out. */
async function unzip(bytes, { strip = false, skip = () => false } = {}) {
  const zip = await JSZip.loadAsync(bytes);
  const files = new Map();
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const path = strip ? entry.name.split("/").slice(1).join("/") : entry.name;
    if (!path || skip(path)) continue;
    files.set(path, Buffer.from(await entry.async("uint8array")));
  }
  return files;
}

/** What is listed now, from the published catalog. */
async function listed(id) {
  try {
    const catalog = JSON.parse((await fetchBytes(CATALOG)).toString("utf8"));
    return catalog.plugins.find((p) => p.id === id)?.manifest ?? null;
  } catch {
    return null;
  }
}

/** The listing's libraries, from the file on the main branch: none for
 *  a first listing. */
function libsOf(path) {
  try {
    return JSON.parse(execFileSync("git", ["show", `origin/main:${path}`], { encoding: "utf8" })).libs ?? {};
  } catch {
    return {};
  }
}

/** Fetches and reviews one version: its results, its manifest (null when
 *  the zip has none to read) and the zip's SHA-256. */
export async function reviewVersion(entry, { previous = null, libs = entry.libs } = {}) {
  const zipBytes = await fetchBytes(releaseZipUrl(entry));
  const sha256 = createHash("sha256").update(zipBytes).digest("hex");
  const [pkg, source] = await Promise.all([
    unzip(zipBytes),
    fetchBytes(`https://github.com/${entry.repo}/archive/refs/tags/v${entry.version}.zip`).then((b) =>
      unzip(b, { strip: true, skip: (p) => p.startsWith(".github/") || p === ".gitignore" }),
    ),
  ]);
  let manifest = null;
  try {
    manifest = JSON.parse(pkg.get("textus-plugin.json").toString("utf8"));
  } catch {}
  return { results: review({ entry, pkg, source, previous, libs }), manifest, sha256 };
}

async function main() {
  const sections = [];
  let failed = false;
  for (const path of process.argv.slice(2)) {
    let entry;
    try {
      entry = communityEntry(JSON.parse(readFileSync(path, "utf8")), path);
      const listedNow = libsOf(`community/${entry.id}.json`);
      const { results, sha256 } = await reviewVersion(entry, {
        previous: await listed(entry.id),
        libs: { ...listedNow, ...entry.libs },
      });
      if (verdict(results) === "fail") failed = true;
      sections.push(`${report(entry, results)}\n\nThe zip reviewed: \`"sha256": "${sha256}"\``);
    } catch (err) {
      failed = true;
      sections.push(`### ❌ ${entry?.id ?? path}\n\n${err.message}`);
    }
  }
  const markdown = ["## Plugin review", "", ...sections].join("\n\n") + "\n";
  writeFileSync("review.md", markdown);
  console.log(markdown);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
