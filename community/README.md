# Plugins from other repositories

One file per plugin, named after its id: `jane.word-count.json`.

```json
{
  "id": "jane.word-count",
  "repo": "jane/textus-word-count",
  "version": "0.2.0"
}
```

- `repo` is the GitHub repository the plugin lives in. Its release for the
  tag `v<version>` must have `<id>-<version>.zip` - the release workflow
  Textus's **Export for Publishing** puts in the repository makes it.
- `version` is the version listed. You don't change it for a new
  version: once a day the updates workflow finds a newer `v<x.y.z>`
  release, reviews it and opens a pull request that changes this line and
  `sha256`, merged on its own unless the version adds a permission, adds
  a warning or fails a check - those wait for a maintainer.
- `libs` (optional) names bundled library files and where they come from,
  `{ "lib/chart.min.js": "chart.js 4.4.1 (npm)" }`, so the review doesn't
  ask about their minified code.
- `sha256` pins the zip that was reviewed: a maintainer adds it from the
  review's comment before the first listing, the updates workflow for
  each version after.

See [LISTING.md](../LISTING.md) for what gets listed and what the review
checks.
