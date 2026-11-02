# Listing in the Textus market

**Settings › Extensions › Get more** in Textus lists three kinds of things, each from its own repository: plugins and skills from this one, themes from [textus-themes](https://github.com/CatVinci-Studio/textus-themes). This page says what gets listed and how.

## What every listing must be

- **Useful to people who write.** Something a writer, a student, a researcher or a team would reach for - not a demo, not a duplicate of something already listed or built in.
- **Honest about what it does.** Its name and description say plainly what it does; it does nothing else.
- **Open.** An OSI-approved license (MIT unless you name another), and only what you have the right to share - fonts and libraries included.
- **Quiet.** Nothing in the background the user didn't ask for: no tracking, no analytics, no ads, no updates or downloads of its own.
- **Kind.** Nothing offensive, nothing that copies someone else's work without credit.

## Plugins

A plugin is a folder with a `textus-plugin.json` manifest ([Writing plugins](https://github.com/CatVinci-Studio/Textus/blob/main/docs/dev/writing-plugins.md)). CatVinci Studio's own are in [`plugins/`](plugins/) here; yours lives in a repository of your own, and a one-file listing in [`community/`](community/) points to it.

- **Permissions it needs, and no more.** Each permission in the manifest is asked for before the plugin runs; one that the plugin's purpose doesn't explain is a reason not to list it. `network:` names the hosts it talks to - `network:*` only for a plugin whose purpose is the open web (a web view) or a server the user types in (their own sync or storage), which it reaches over HTTPS and names in its README.
- **Works offline,** apart from what plainly needs the network (Zotero's local API, a web page), and says so when it can't reach something.
- **Says where it runs.** Every manifest names its `platforms`: `["desktop", "ios"]`, or `["desktop"]` for a plugin that can't work on iOS: one that needs a program on the computer (Zotero, a local server) or opens any web page. One that works in the background (`background` code, or `requires` Keep running in the background) is desktop-only by default and can't name `ios`. A plugin offered on iOS is tried in a phone-sized window first.
- **English and Chinese.** Its `l10n` has at least `en` and `zh`; Textus falls back to English for the other languages.
- **Tested.** Its flows run in Textus's e2e tests or yours, and `npm run check` passes.
- **Versioned.** A change ships as a new `version`; a published version never changes.
- **Its own source.** No build step between the repository and the zip: the zip holds exactly the files of the tag it was released from, so anyone can read what they install. Bundled libraries are named with their source and version.

## Skills

A skill is one Markdown file in [`skills/`](skills/), named after the skill (`press-release.md`), with front matter like the built-in skills' ([AGENTS.md › Skills](https://github.com/CatVinci-Studio/Textus/blob/main/AGENTS.md)): `name` (the file's name), `description` (what it does and when to use it - Textus AI reads it to decide), and `metadata` with `textus-version`, `textus-invocation`, `textus-category` and `textus-modes` - the panel modes it works in, one or more of `write`, `review` and `create` - and, for each UI language, `textus-label-<code>` and `textus-hint-<code>` (its name and one line on what it does) and `textus-aliases-<code>` (other words typed after `/`).

- **A procedure, not a one-off.** A kind of task people do again and again, with the steps that make it come out right.
- **Never invents.** A skill that writes from the user's material says what to do when the material is missing a detail (leave a placeholder, ask) - never to make it up.
- **No built-in twin.** Not a second translate, proofread or summarize - improve the built-in one instead (a pull request to Textus).

## Themes

Themes are shared in [textus-themes](https://github.com/CatVinci-Studio/textus-themes#share-a-theme) - one comment on its gallery issue, no pull request. Its rules (one self-contained stylesheet, no remote resources, no script hooks) apply as they stand.

## How to list yours

### A plugin

1. In Textus, open your plugin's page in **Settings › Extensions › Plugins** (or the card under the chat that made it) and choose **Export for Publishing…**. You get a folder ready to be a repository: your plugin under your name, a README, a LICENSE and a release workflow.
2. Make it a GitHub repository, then push a version tag (`git tag v0.1.0 && git push origin v0.1.0`). The workflow publishes `<id>-<version>.zip` as a release.
3. Open a pull request here adding `community/<id>.json` - your repository and the version ([format](community/README.md)).
4. The review runs on the pull request and posts what it found:
   - **the package** - its manifest, id and version, size, no programs or native libraries;
   - **its source** - every file in the zip is the tagged repository's, byte for byte;
   - **permissions** - each one listed; broad ones (`network:*`, `files.write`, `editor.write`, `background`) wait for a person, who approves them once: at the first listing, or in the version that adds them;
   - **the code** - no `eval`, no code loaded from the web, no keys written in, nothing minified that isn't a named library;
   - **what comes with it** - a `README.md` in the package, an open-source LICENSE, English and Chinese strings, no name that borrows "CatVinci" or "Official". The README is what **Get more** shows on your plugin's page, and its guide once installed: what it does and how to reach it. Add `README.zh.md`, `README.ja.md` and so on for other languages; Textus shows the one in the reader's language, English otherwise.
5. A maintainer tries it in Textus, adds the reviewed zip's `sha256` to the file and merges. The release workflow copies that zip here and **Get more** lists it.

After that, a new version needs no pull request from you: push its version tag (`v0.2.0`) and let your release workflow publish the zip. Once a day this repository looks for a release newer than the listed version, reviews it the same way and opens a pull request that changes `version` and pins its `sha256`. One that fails nothing, asks for no permission the listed version didn't and brings no warning it didn't have is merged on its own and listed within the day; one that adds a permission or a new warning, or fails a check, waits for a maintainer. Prereleases and drafts are left out.

Passing the review doesn't make a plugin safe on its own: Textus runs every plugin in a sandbox and asks before each permission. A plugin taken down goes in [`removed.json`](removed.json).

### A skill

1. Open a pull request here that adds your skill's file.
2. CI checks it (`npm run check`); a maintainer reviews it, usually within a week, trying it in Textus.
3. Once merged, the release workflow publishes it, and it is in **Get more** for everyone. Only what CatVinci Studio makes is marked **Official**.

A listing that stops meeting these rules - broken by a Textus update and not fixed, or found doing more than it says - is taken down, and its author told why.

