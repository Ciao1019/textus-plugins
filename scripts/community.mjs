// Plugins from other repositories (LISTING.md): community/<id>.json names
// the repository and the version listed; the zip is that repository's
// release for the tag v<version>, made by the release workflow Textus's
// Export for Publishing puts in it.

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;

/** Negative, zero or positive as `a` is older than, the same as or newer
 *  than `b`, by x.y.z; NaN when either isn't a version. */
export function compareVersions(a, b) {
  const x = VERSION.exec(a);
  const y = VERSION.exec(b);
  if (!x || !y) return NaN;
  for (let i = 1; i <= 3; i++)
    if (Number(x[i]) !== Number(y[i])) return Number(x[i]) - Number(y[i]);
  return 0;
}

/** The file's entry, checked: its id (also its file name), repository
 *  and version, the libraries it bundles (path -> where from), and the
 *  reviewed zip's SHA-256 (the review prints it; the maintainer adds it
 *  before merging, so the zip can't change after it was looked at). */
export function communityEntry(json, path = "") {
  const where = path || "community entry";
  if (!json || typeof json !== "object") throw new Error(`${where}: not an object`);
  const { id, repo, version, libs, sha256 } = json;
  if (!ID.test(id ?? "")) throw new Error(`${where}: "${id}" isn't a plugin id`);
  if (path && !path.endsWith(`/${id}.json`) && path !== `${id}.json`)
    throw new Error(`${where}: the file should be named ${id}.json`);
  if (id.startsWith("catvinci.")) throw new Error(`${where}: catvinci. is CatVinci Studio's own`);
  if (!REPO.test(repo ?? "")) throw new Error(`${where}: "${repo}" isn't owner/repository`);
  if (!VERSION.test(version ?? "")) throw new Error(`${where}: "${version}" isn't x.y.z`);
  if (libs !== undefined && (typeof libs !== "object" || Array.isArray(libs)))
    throw new Error(`${where}: libs maps a file to where it comes from`);
  if (sha256 !== undefined && !/^[0-9a-f]{64}$/.test(sha256))
    throw new Error(`${where}: sha256 is the zip's SHA-256, in hex`);
  return { id, repo, version, libs: libs ?? {}, sha256 };
}

/** Where the version's zip is. */
export function releaseZipUrl({ id, repo, version }) {
  return `https://github.com/${repo}/releases/download/v${version}/${id}-${version}.zip`;
}

/** The newest version among the repository's GitHub releases (the API's
 *  objects) that is newer than the listed one and has its zip, or null.
 *  Only plain x.y.z tags: prereleases and drafts are for testers. */
export function newerRelease({ id, version }, releases) {
  let newest = null;
  for (const release of releases) {
    const tag = /^v(\d+\.\d+\.\d+)$/.exec(release.tag_name ?? "");
    if (!tag || release.draft || release.prerelease) continue;
    const found = tag[1];
    if (!(release.assets ?? []).some((a) => a.name === `${id}-${found}.zip`)) continue;
    if (compareVersions(found, newest ?? version) > 0) newest = found;
  }
  return newest;
}
