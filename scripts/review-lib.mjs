// The checks a community plugin's version goes through before it is
// listed (LISTING.md › Plugins from other repositories): its package, that
// the package is its tagged source, its permissions, its code and what
// comes with it. Pure functions over the files - review.mjs fetches them,
// tests/review.test.ts runs these on made-up plugins.
//
// Each check answers "pass", "warn" (a person looks) or "fail" (not
// listed until fixed). Passing doesn't make a plugin safe: the sandbox and
// the permission prompt do that; this catches the obvious and tells the
// reviewer where to look.

import { createHash } from "node:crypto";
import { compareVersions } from "./community.mjs";

export const MAX_PACKAGE_BYTES = 5 * 1024 * 1024;

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;
/** Files no plugin needs: programs and native libraries. */
const BINARY = /\.(exe|dll|dylib|so|node|bin|app|msi|dmg|sh|bat|cmd|ps1)$/i;
/** Licenses the listing takes (OSI-approved), by what their text says. */
const LICENSES = [
  "MIT License",
  "Apache License",
  "BSD 2-Clause",
  "BSD 3-Clause",
  "Redistribution and use in source and binary forms",
  "GNU GENERAL PUBLIC LICENSE",
  "GNU LESSER GENERAL PUBLIC LICENSE",
  "Mozilla Public License",
  "ISC License",
  "Permission to use, copy, modify, and/or distribute this software",
];
/** Permissions whose reason the description should give: `background`
 *  runs the plugin's code with every window closed. */
const BROAD = ["network:*", "files.write", "editor.write", "background"];
/** Code that turns text into code, loads code from the web, or looks
 *  like something it shouldn't: what each is, and how bad. */
const SCANS = [
  [/\beval\s*\(/, "fail", "eval()"],
  [/\bnew\s+Function\s*\(/, "fail", "new Function()"],
  [/\bimport\s*\(\s*["'`]https?:/, "fail", "code imported from the web"],
  [/<script[^>]+src\s*=\s*["']https?:/i, "fail", "a script loaded from the web"],
  [/\b(coinhive|cryptonight|stratum\+tcp)\b/i, "fail", "a miner's name"],
  [/\bAKIA[0-9A-Z]{16}\b/, "fail", "an AWS key"],
  [/\b(sk-[A-Za-z0-9]{32,}|ghp_[A-Za-z0-9]{36}|xox[bp]-[A-Za-z0-9-]{20,})\b/, "fail", "a secret key"],
  [/\bdocument\.cookie\b/, "warn", "document.cookie"],
  [/\b(atob|String\.fromCharCode)\s*\(/, "warn", "decoded strings"],
];
/** A line this long is minified or generated: fine in a library it names,
 *  a reason to look anywhere else. */
const LONG_LINE = 1000;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const text = (bytes) => Buffer.from(bytes).toString("utf8");

/**
 * Reviews one version. `entry` is its community/<id>.json; `pkg` and
 * `source` map each file's path to its bytes - the release's zip, and the
 * repository at the version's tag; `previous` is the manifest listed now,
 * if there is one; `libs` names files that are libraries (path -> where
 * from), which may be minified.
 */
export function review({ entry, pkg, source, previous = null, libs = {} }) {
  const results = [];
  const add = (level, check, detail) => results.push({ level, check, detail });

  // 1. The package.
  const manifestBytes = pkg.get("textus-plugin.json");
  if (!manifestBytes) {
    add("fail", "package", "The zip has no textus-plugin.json at its top.");
    return results;
  }
  let manifest;
  try {
    manifest = JSON.parse(text(manifestBytes));
  } catch (err) {
    add("fail", "package", `textus-plugin.json isn't JSON: ${err.message}`);
    return results;
  }
  if (!ID.test(entry.id ?? "")) add("fail", "package", `"${entry.id}" isn't a plugin id.`);
  if (manifest.id !== entry.id)
    add("fail", "package", `The manifest's id is ${manifest.id}, the listing's ${entry.id}.`);
  if (manifest.version !== entry.version)
    add("fail", "package", `The manifest says ${manifest.version}, the listing ${entry.version}.`);
  if (!VERSION.test(manifest.version ?? ""))
    add("fail", "package", `"${manifest.version}" isn't a version (x.y.z).`);
  for (const key of ["name", "publisher", "description", "main"])
    if (typeof manifest[key] !== "string" || !manifest[key])
      add("fail", "package", `The manifest has no ${key}.`);
  if (typeof manifest.engines?.textus !== "string")
    add("fail", "package", "The manifest has no engines.textus.");
  const platforms = manifest.platforms;
  if (
    !Array.isArray(platforms) ||
    !platforms.length ||
    !platforms.every((p) => p === "desktop" || p === "ios")
  )
    add("fail", "package", 'The manifest names no platforms: ["desktop", "ios"], or ["desktop"] for one iOS can\'t run.');
  else if (
    platforms.includes("ios") &&
    (manifest.background ||
      (manifest.requires ?? []).some((r) => r.setting === "runInBackground"))
  )
    add("fail", "package", "It works in the background, which iOS has none of: its platforms can't name ios.");
  if (manifest.main && !pkg.has(manifest.main))
    add("fail", "package", `Its main, ${manifest.main}, isn't in the zip.`);
  if (manifest.publisher === "catvinci" || entry.id.startsWith("catvinci."))
    add("fail", "package", "catvinci is CatVinci Studio's own name.");
  if (previous && compareVersions(manifest.version, previous.version) <= 0)
    add("fail", "package", `${manifest.version} isn't newer than the listed ${previous.version}.`);
  const size = [...pkg.values()].reduce((sum, b) => sum + b.length, 0);
  if (size > MAX_PACKAGE_BYTES)
    add("fail", "package", `${(size / 1048576).toFixed(1)} MB unpacked; the limit is ${MAX_PACKAGE_BYTES / 1048576} MB.`);
  const binaries = [...pkg.keys()].filter((path) => BINARY.test(path));
  if (binaries.length) add("fail", "package", `Programs or native libraries: ${binaries.join(", ")}.`);
  if (!results.some((r) => r.check === "package"))
    add("pass", "package", `${manifest.id} ${manifest.version}, ${pkg.size} files.`);

  // 2. The package is the tagged source, file for file.
  const differ = [];
  for (const [path, bytes] of pkg) {
    const from = source.get(path);
    if (!from) differ.push(`${path} isn't in the repository at the tag`);
    else if (sha256(from) !== sha256(bytes)) differ.push(`${path} differs from the repository`);
  }
  if (differ.length) add("fail", "source", differ.join("; ") + ".");
  else add("pass", "source", "Every file in the zip is the tagged source's.");

  // 3. Permissions.
  const asked = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  const before = new Set(previous?.permissions ?? []);
  const added = previous ? asked.filter((p) => !before.has(p)) : [];
  if (added.length)
    add("warn", "permissions", `New since ${previous.version}: ${added.join(", ")} - a person looks.`);
  const broad = asked.filter((p) => BROAD.includes(p));
  if (broad.length)
    add("warn", "permissions", `${broad.join(", ")}: the description should say why.`);
  if (!added.length && !broad.length)
    add("pass", "permissions", asked.length ? asked.join(", ") : "None.");

  // 4. The code.
  const found = [];
  for (const [path, bytes] of pkg) {
    if (!/\.(m?js|html?|css)$/i.test(path)) continue;
    const body = text(bytes);
    for (const [pattern, level, what] of SCANS)
      if (pattern.test(body)) found.push([level, `${what} in ${path}`]);
    const lib = libs[path];
    if (!lib && body.split("\n").some((line) => line.length > LONG_LINE))
      found.push(["warn", `${path} looks minified; name its source in the README if it's a library`]);
  }
  for (const [level, detail] of found) add(level, "code", detail + ".");
  if (!found.length) add("pass", "code", "Nothing to look at twice.");

  // 5. What comes with it.
  const l10n = manifest.l10n ?? {};
  const content = [];
  for (const lang of ["en", "zh"])
    if (!l10n[lang] && !(lang === "en" && Object.keys(l10n).length === 0))
      content.push(["warn", `no ${lang} strings in l10n`]);
  // The README is what the market shows of it, and its guide once installed.
  if (!pkg.has("README.md")) content.push(["fail", "no README.md in the package"]);
  const license = source.get("LICENSE") ?? pkg.get("LICENSE");
  if (!license) content.push(["fail", "no LICENSE"]);
  else if (!LICENSES.some((name) => text(license).includes(name)))
    content.push(["warn", "a LICENSE the listing doesn't recognise as open source"]);
  const words = `${manifest.name ?? ""} ${manifest.description ?? ""}`;
  if (/\b(catvinci|official)\b/i.test(words))
    content.push(["fail", "its name or description says CatVinci or Official"]);
  for (const [level, detail] of content) add(level, "content", detail + ".");
  if (!content.length) add("pass", "content", "README, LICENSE and strings in place.");

  return results;
}

/** The worst level among `results`. */
export function verdict(results) {
  if (results.some((r) => r.level === "fail")) return "fail";
  if (results.some((r) => r.level === "warn")) return "warn";
  return "pass";
}

/**
 * What a new version brings that the listed one didn't, from both
 * versions' manifest permissions and review results. Only a version that
 * fails nothing, asks for no new permission and warns of nothing new is
 * `automatic`: a broad permission or a warning already listed was
 * approved when it was.
 */
export function changes(listed, next) {
  const had = new Set(listed.permissions);
  const newPermissions = next.permissions.filter((p) => !had.has(p));
  // Permissions are compared as a set; their warnings' wording names versions.
  const key = (r) => `${r.check}: ${r.detail}`;
  const warned = new Set(listed.results.filter((r) => r.level === "warn").map(key));
  const newWarnings = next.results.filter(
    (r) => r.level === "warn" && r.check !== "permissions" && !warned.has(key(r)),
  );
  const failed = verdict(next.results) === "fail";
  return {
    failed,
    newPermissions,
    newWarnings,
    automatic: !failed && !newPermissions.length && !newWarnings.length,
  };
}

/** The results as the comment on the pull request. */
export function report(entry, results) {
  const mark = { pass: "✅", warn: "⚠️", fail: "❌" };
  const lines = [
    `### ${mark[verdict(results)]} ${entry.id} ${entry.version}`,
    "",
    "| | Check | |",
    "|---|---|---|",
    ...results.map(
      (r) => `| ${mark[r.level]} | ${r.check} | ${r.detail.replace(/\|/g, "\\|")} |`,
    ),
    "",
    verdict(results) === "fail"
      ? "Not listed until the ❌ are fixed: push a new version and update the file."
      : verdict(results) === "warn"
        ? "A maintainer looks at the ⚠️ before merging."
        : "Ready for a maintainer to try and merge.",
  ];
  return lines.join("\n");
}
