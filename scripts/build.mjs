// Builds what Textus downloads: each plugin in plugins/ as a zip, with the
// libraries libs.json lists copied in from node_modules, and the catalog
// (index.json) Settings › Plugins lists them from - each plugin's
// manifest, where its zip is and its SHA-256, which Textus checks before
// it installs. Run `npm run build`; `--check` only reads the manifests.
//
// The zips go up as GitHub release assets, one release per plugin version
// (`<id>-v<version>`), and index.json on the `catalog` release
// (.github/workflows/release.yml). The skills in skills/ - a skill file
// each - go up on the `catalog` release too, as skill-<name>.md, and
// index.json lists them beside the plugins. Plugins from other
// repositories (community/<id>.json, LISTING.md) come from their own
// releases: the zip that was reviewed is fetched and goes up here like an
// official plugin's - Textus downloads packages from this repository only,
// and an author changing a release later changes nothing listed.
// removed.json names those taken down.
//
// For the market, before a plugin is installed: its README (README.md,
// README.<lang>.md) and icon go up on the `catalog` release too, and
// index.json lists where. dist/stats.json, when the release workflow
// wrote it (scripts/stats.mjs), adds each plugin's installs and dates and
// each skill's installs.

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import JSZip from "jszip";
import { communityEntry, releaseZipUrl } from "./community.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const PLUGINS = join(ROOT, "plugins");
const COMMUNITY = join(ROOT, "community");
const SKILLS = join(ROOT, "skills");
const DIST = join(ROOT, "dist");
const REPOSITORY = "https://github.com/CatVinci-Studio/textus-plugins";
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const check = process.argv.includes("--check");

const libs = JSON.parse(readFileSync(join(ROOT, "libs.json"), "utf8"));

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path));
    else out.push(path);
  }
  return out;
}

function manifestOf(id) {
  const path = join(PLUGINS, id, "textus-plugin.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  if (manifest.id !== id)
    throw new Error(`${id}: the manifest's id is ${manifest.id}`);
  if (!ID.test(id)) throw new Error(`${id}: not a plugin id`);
  if (!VERSION.test(manifest.version ?? ""))
    throw new Error(`${id}: version "${manifest.version}" is not x.y.z`);
  for (const key of ["name", "publisher", "description"])
    if (typeof manifest[key] !== "string" || !manifest[key])
      throw new Error(`${id}: the manifest has no ${key}`);
  if (typeof manifest.engines?.textus !== "string")
    throw new Error(`${id}: the manifest has no engines.textus`);
  // Where it runs, said outright: ["desktop", "ios"] or ["desktop"].
  const platforms = manifest.platforms;
  if (
    !Array.isArray(platforms) ||
    !platforms.length ||
    !platforms.every((p) => p === "desktop" || p === "ios")
  )
    throw new Error(`${id}: platforms must list desktop, ios or both`);
  const inBackground =
    !!manifest.background ||
    (manifest.requires ?? []).some((r) => r.setting === "runInBackground");
  if (inBackground && manifest.platforms?.includes("ios"))
    throw new Error(`${id}: works in the background, so not on ios`);
  return manifest;
}

/** Each plugin's installs and first and latest release dates, and each
 *  skill's installs, when counted (scripts/stats.mjs). */
const STATS = join(DIST, "stats.json");
const stats = existsSync(STATS) ? JSON.parse(readFileSync(STATS, "utf8")) : {};
const statsOf = (kind, id) => stats[kind]?.[id] ?? {};

/** A README's language from its name: README.md is English. */
const README = /^README(?:\.([A-Za-z]{2,3}(?:-[A-Za-z]+)?))?\.md$/;

/**
 * What the market shows of plugin `id` before it is installed, from its
 * files (name -> bytes): each README, and the icon its manifest names,
 * copied to dist/ for the catalog release; their addresses there, and the
 * plugin's stats.
 */
function marketOf(id, manifest, fileList) {
  const at = (asset) => `${REPOSITORY}/releases/download/catalog/${asset}`;
  const readme = {};
  for (const [name, bytes] of fileList) {
    const m = README.exec(name);
    if (!m) continue;
    const lang = m[1] ?? "en";
    const asset = `readme-${id}.${lang}.md`;
    writeFileSync(join(DIST, asset), bytes);
    readme[lang] = at(asset);
  }
  const out = Object.keys(readme).length ? { readme } : {};
  const icon = typeof manifest.icon === "string" ? manifest.icon : "";
  const ext = /\.(svg|png)$/i.exec(icon)?.[1]?.toLowerCase();
  const iconBytes = ext && fileList.find(([name]) => name === icon)?.[1];
  if (iconBytes) {
    const asset = `icon-${id}.${ext}`;
    writeFileSync(join(DIST, asset), iconBytes);
    out.icon = at(asset);
  }
  return { ...out, ...statsOf("plugin", id) };
}

/** A plugin's pictures for the market (`screenshots/*.png`, in name
 *  order), copied to dist/ as shot-<id>-<n>.png for the catalog release;
 *  their addresses there. */
const SCREENSHOTS = "screenshots";
function screenshotsOf(id) {
  const dir = join(PLUGINS, id, SCREENSHOTS);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".png"))
    .sort()
    .map((name, i) => {
      const asset = `shot-${id}-${i + 1}.png`;
      copyFileSync(join(dir, name), join(DIST, asset));
      return `${REPOSITORY}/releases/download/catalog/${asset}`;
    });
}

const ids = readdirSync(PLUGINS)
  .filter((name) => statSync(join(PLUGINS, name)).isDirectory())
  .sort();
const catalog = [];
if (!check) mkdirSync(DIST, { recursive: true });

for (const id of ids) {
  const manifest = manifestOf(id);
  if (check) continue;
  const zip = new JSZip();
  const shipped = [];
  // Fixed dates and no folder entries (JSZip would date those now): the
  // same sources make the same zip, and the same hash.
  const options = {
    date: new Date("2026-01-01T00:00:00Z"),
    createFolders: false,
  };
  for (const path of files(join(PLUGINS, id))) {
    const name = relative(join(PLUGINS, id), path);
    // Pictures for the market go up beside the catalog, not in the package.
    if (name.startsWith(`${SCREENSHOTS}/`)) continue;
    const bytes = readFileSync(path);
    zip.file(name, bytes, options);
    shipped.push([name, bytes]);
  }
  for (const [target, lib] of Object.entries(libs)) {
    if (!target.startsWith(`${id}/`)) continue;
    // "./shared/x.js": a file of this repository's, shared by plugins.
    const from = lib.startsWith("./")
      ? join(ROOT, lib)
      : join(ROOT, "node_modules", lib);
    // A folder (its name ends in "/"): every file in it.
    const sources = lib.endsWith("/")
      ? files(from).map((path) => [target + relative(from, path), path])
      : [[target, from]];
    for (const [name, path] of sources)
      zip.file(name.slice(id.length + 1), readFileSync(path), options);
  }
  const bytes = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
  const file = `${id}-${manifest.version}.zip`;
  writeFileSync(join(DIST, file), bytes);
  catalog.push({
    id,
    version: manifest.version,
    // Made by CatVinci Studio and published from this repository: Textus
    // marks it Official.
    official: manifest.publisher === "catvinci",
    manifest,
    url: `${REPOSITORY}/releases/download/${id}-v${manifest.version}/${file}`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: bytes.length,
    screenshots: screenshotsOf(id),
    ...marketOf(id, manifest, shipped),
  });
  console.log(`${file}  ${(bytes.length / 1024).toFixed(0)} KB`);
}

/** A skill file's front matter: its name, description and the metadata
 *  the catalog lists (Textus reads the file itself the same way). */
function skillOf(file) {
  const text = readFileSync(join(SKILLS, file), "utf8");
  const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!front) throw new Error(`${file}: no front matter`);
  const field = (key) => {
    const m = new RegExp(
      `^${key}:\\s*(>-)?\\s*\n?((?:.*\\S.*\\n?)(?:  .*\\n?)*)`,
      "m",
    ).exec(front[1]);
    if (!m) return "";
    return m[2]
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/^"|"$/g, "");
  };
  const name = field("name");
  const description = field("description");
  const version =
    (/textus-version:\s*"?([^"\n]+)"?/.exec(front[1]) ?? [])[1] ?? "";
  if (!name || name !== file.replace(/\.md$/, ""))
    throw new Error(`${file}: its name must be its file's`);
  if (!description) throw new Error(`${file}: no description`);
  if (!VERSION.test(version))
    throw new Error(`${file}: textus-version "${version}" is not x.y.z`);
  if (!text.slice(front[0].length).trim())
    throw new Error(`${file}: no instructions`);
  // The modes it works in, and its name and line in each UI language.
  const meta = (key) =>
    (new RegExp(`^  textus-${key}:\\s*"([^"\\n]*)"`, "m").exec(front[1]) ??
      [])[1];
  const modes = (meta("modes") ?? "write")
    .split(/[\s,]+/)
    .filter(Boolean);
  for (const mode of modes)
    if (!MODES.includes(mode))
      throw new Error(`${file}: textus-modes "${mode}" is not one of ${MODES}`);
  const labels = {};
  for (const m of front[1].matchAll(/^  textus-label-([\w-]+):\s*"([^"\n]*)"/gm))
    labels[m[1]] = { label: m[2], hint: meta(`hint-${m[1]}`) ?? "" };
  return { name, description, version, modes, labels, bytes: Buffer.from(text) };
}

/** The panel modes a skill can be in (`textus-modes`). */
const MODES = ["write", "review", "create"];

const skillFiles = readdirSync(SKILLS)
  .filter((f) => f.endsWith(".md"))
  .sort();
const skills = [];
for (const file of skillFiles) {
  const skill = skillOf(file);
  if (check) continue;
  const asset = `skill-${skill.name}.md`;
  writeFileSync(join(DIST, asset), skill.bytes);
  skills.push({
    name: skill.name,
    version: skill.version,
    description: skill.description,
    modes: skill.modes,
    labels: skill.labels,
    author: "CatVinci Studio",
    official: true,
    url: `${REPOSITORY}/releases/download/catalog/${asset}`,
    sha256: createHash("sha256").update(skill.bytes).digest("hex"),
    size: skill.bytes.length,
    ...statsOf("skill", skill.name),
  });
  console.log(`${asset}  ${skill.bytes.length} bytes`);
}

// Plugins from other repositories, as their releases have them.
const removed = new Set(
  JSON.parse(readFileSync(join(ROOT, "removed.json"), "utf8")).plugins,
);
const communityFiles = readdirSync(COMMUNITY)
  .filter((f) => f.endsWith(".json"))
  .sort();
for (const file of communityFiles) {
  const entry = communityEntry(
    JSON.parse(readFileSync(join(COMMUNITY, file), "utf8")),
    `community/${file}`,
  );
  if (ids.includes(entry.id))
    throw new Error(`community/${file}: ${entry.id} is an official plugin's id`);
  if (check || removed.has(entry.id)) continue;
  const url = releaseZipUrl(entry);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const zip = await JSZip.loadAsync(bytes);
  const manifest = JSON.parse(
    await zip.file("textus-plugin.json").async("string"),
  );
  if (manifest.id !== entry.id || manifest.version !== entry.version)
    throw new Error(`${url}: holds ${manifest.id} ${manifest.version}`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  // The zip the review saw, when the listing pins it.
  if (entry.sha256 && entry.sha256 !== sha256)
    throw new Error(`${url}: not the zip that was reviewed (${entry.sha256})`);
  const asset = `${entry.id}-${entry.version}.zip`;
  writeFileSync(join(DIST, asset), bytes);
  const inZip = [];
  for (const [name, f] of Object.entries(zip.files))
    if (!f.dir && (README.test(name) || name === manifest.icon))
      inZip.push([name, await f.async("nodebuffer")]);
  catalog.push({
    id: entry.id,
    version: entry.version,
    official: false,
    manifest,
    url: `${REPOSITORY}/releases/download/${entry.id}-v${entry.version}/${asset}`,
    sha256,
    size: bytes.length,
    ...marketOf(entry.id, manifest, inZip),
  });
  console.log(`${entry.id}-${entry.version}  from ${entry.repo}`);
}

if (check)
  console.log(
    `${ids.length} manifests, ${communityFiles.length} community listings and ${skillFiles.length} skills read`,
  );
else
  writeFileSync(
    join(DIST, "index.json"),
    `${JSON.stringify({ schema: 1, plugins: catalog, skills }, null, 2)}\n`,
  );
