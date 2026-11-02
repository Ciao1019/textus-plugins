# Developing Cloud Sync

The official plugin lives in `plugins/catvinci.cloud-sync/`. Its typed source
and protocol tests live here; its integration flows are in `e2e/cloud-sync/`.
This imports Ciao1019/textus-cloud-sync at `59baab6`, including the 0.3.0
interface and setup improvements contributed by ChengAo Shen.

From the repository root:

```sh
npm ci
npm run build:cloud-sync
npm run check
npm run build
npx playwright install chromium webkit
npm run test:e2e:cloud-sync
```

Edit `src/` for behavior, or the plugin folder's HTML, CSS and manifest for
the interface, locale strings and identity. `build:cloud-sync` updates readable
`host.js` and `panel.js`; commit both alongside their source. `npm run check`
typechecks this plugin and its tests, verifies that the committed runtime
matches an in-memory rebuild, and runs the repository's unit tests, including
Cloud Sync's encryption, transport, synchronization and local-file tests.

`npm run build` does no compilation: the standard catalog builder packages
the committed plugin files, publishes its screenshot metadata and marks it
official through `publisher: catvinci`. No separate community listing or
external plugin release is needed. `aws4fetch` 1.0.20 is bundled readably in
the host; its MIT license and source are recorded in the plugin's notices.

Integration tests read the actual catalog ZIP in `dist/`, then run it in
Textus's real frontend, sandbox and broker. They use an isolated filesystem
and HTTP fixtures, never cloud accounts or production Textus data. A Textus
checkout with npm dependencies installed is expected at `../Textus`; set
`TEXTUS_REPO` to use another checkout. The supported UI baseline is Textus
1.3.2. Set `PLAYWRIGHT_PORT` when another checkout is using port 1574.

Set `CAPTURE_EVIDENCE=1` to capture current WebKit screenshots in
`docs/cloud-sync/screenshots/`. The validation report records which app
revision was used. Browser fixtures do not replace live provider testing or
a native-platform run.

The official ID is new. It intentionally does not read another plugin's
private settings or secrets. The user-facing README describes joining an
existing encrypted remote, finishing interrupted downloads before switching,
and disabling the community plugin to avoid two automatic sync loops.
