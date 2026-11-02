// What the market shows of each plugin and skill beside its manifest
// (build.mjs reads it): installs, ever and in the last 30 days, from
// Textus's anonymous install counts (textus.catvinci.com/api/ext/stats;
// the app's services/ext-stats), and a plugin's first and latest release
// dates from GitHub. Counts the endpoint can't give are left out. Run by
// the release workflow, with GH_TOKEN, before the build:
// `node scripts/stats.mjs > dist/stats.json`.

const REPO = "CatVinci-Studio/textus-plugins";
const EXT_STATS = "https://textus.catvinci.com/api/ext/stats";

/** Each plugin's first and latest release dates, from `releases`
 *  (GitHub's release objects, `<id>-v<version>`), by id. */
export function datesOf(releases) {
  const out = {};
  for (const release of releases) {
    const m = /^(.+)-v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.exec(release.tag_name);
    if (!m || release.draft) continue;
    const date = (release.published_at ?? release.created_at ?? "").slice(0, 10);
    const s = (out[m[1]] ??= { published: date, updated: date });
    if (date && date < s.published) s.published = date;
    if (date && date > s.updated) s.updated = date;
  }
  return out;
}

/** `installs` and `installs30` of each extension of `kind` in the
 *  endpoint's answer `counts`, by id. */
export function installsOf(counts, kind) {
  const out = {};
  for (const [id, s] of Object.entries(counts?.[kind] ?? {}))
    if (Number.isInteger(s?.installs) && Number.isInteger(s?.installs30))
      out[id] = { installs: s.installs, installs30: s.installs30 };
  return out;
}

/** dist/stats.json: by kind, then id. */
export function statsOf(releases, counts) {
  const dates = datesOf(releases);
  const plugins = installsOf(counts, "plugin");
  const plugin = {};
  for (const id of new Set([...Object.keys(dates), ...Object.keys(plugins)]))
    plugin[id] = { ...plugins[id], ...dates[id] };
  return { plugin, skill: installsOf(counts, "skill") };
}

async function releases() {
  const all = [];
  for (let page = 1; ; page++) {
    const response = await fetch(
      `https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`,
      {
        headers: {
          accept: "application/vnd.github+json",
          ...(process.env.GH_TOKEN
            ? { authorization: `Bearer ${process.env.GH_TOKEN}` }
            : {}),
        },
      },
    );
    if (!response.ok) throw new Error(`releases: ${response.status}`);
    const batch = await response.json();
    all.push(...batch);
    if (batch.length < 100) return all;
  }
}

/** The install counts, or null when the endpoint can't be read: the
 *  catalog is then built without them. */
export async function counts(url = EXT_STATS) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`${response.status}`);
    return await response.json();
  } catch (err) {
    console.error(`install counts left out: ${url}: ${err.message}`);
    return null;
  }
}

if (import.meta.url === `file://${process.argv[1]}`)
  console.log(
    JSON.stringify(statsOf(await releases(), await counts()), null, 2),
  );
