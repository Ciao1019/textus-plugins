# Textus Plugins

The plugins for [Textus](https://textus.catvinci.com), the Markdown editor. None of them comes with Textus: you install the ones you want from **Settings › Plugins › Get plugins**, and Textus downloads them from this repository.

## The plugins

| Plugin | What it does |
| --- | --- |
| Backlinks | For the document in front: the notes that link to it, the ones that name it without a link - linked in one click - and the notes it links to. |
| Calendar & Daily Notes | A calendar in the sidebar and a note for each day, kept in a folder of the open folder. |
| Emacs | Emacs keys in the editor: moving by character, word and line, the mark and region, the kill ring with C-y and M-y, C-/ undo and C-x prefixes. |
| Graph View | Your notes and the links between them as a graph - for the whole folder, or around the document in front - with filters, colour groups and forces to shape it. |
| Image Viewer | Open pictures and SVG files in a tab: zoom, fit, and an SVG's source. |
| LaTeX Completion | In a formula, a backslash and the start of a command - \\fr, \\alp - lists the LaTeX commands that begin so, each with what it draws; Enter or Tab writes one, with the caret in its braces. |
| Kanban | Boards of cards in lists, kept as a Markdown file (name.kanban.md) - a list per heading, a card per task. |
| PDF Viewer | Open PDFs in a tab beside your notes: pages, zoom, and text to select and copy. |
| Quick Preview | Rest the pointer on a link to another document - a Markdown link or a [[wikilink]] - to read its opening, or the section it names, in a card beside it. |
| Quick Notes | Jot something down without leaving the document: notes in the sidebar, to insert later or open as a document. |
| Split Panes | Two documents at once: side by side, or one above the other. Drag the line between them to share the space; a click in one brings it to the front. |
| Tasks | Every task (- [ ]) in the open folder's documents, in one list: tick one off there, or go to it. |
| Version History | Each save of a document kept as a version: see what changed since, and bring an old one back. |
| Vim | Vim's modes and keys in the editor: normal, insert and visual, motions, operators, counts, registers and dot repeat, and flash jumps with s. |
| Web View | Open web pages in a tab beside your notes. |
| Word Reader | Read Word documents as they look in Word, in a tab. Edit as Markdown turns one into a document of yours. |
| Zotero | Cite from your Zotero library while you write, and rest the pointer on a citation to see what it cites. Needs Zotero 7 running, with Settings › Advanced › Allow other applications on this computer to communicate with Zotero on. |

Quick Notes can also start a note from the tray or menu bar with every window closed, once **Keep running in the background** is on - it offers to turn it on.

Each one asks for the permissions it needs before it runs, and you can take any of them back in its page in Settings › Plugins.

## How Textus gets them

Each plugin's folder in [`plugins/`](plugins/) is packaged by `npm run build` into a zip, with the libraries [`libs.json`](libs.json) lists. The [release workflow](.github/workflows/release.yml) publishes each new version as a release of its own (`catvinci.graph-v1.0.0`) and the catalog, `index.json`, on the `catalog` release, with the skill files in [`skills/`](skills/) beside it. Textus reads that catalog, and checks each package against the SHA-256 it lists before it installs it.

## Writing a plugin

A plugin is a folder with a `textus-plugin.json` and its code, run in a sandbox. Start from [`template/`](template/), a small plugin that works; the guide is [Writing plugins](https://github.com/CatVinci-Studio/Textus/blob/main/docs/dev/writing-plugins.md) in the Textus repository, and the plugins here are complete examples. To try yours, use **Settings › Extensions › Plugins › Load a plugin folder…**; to publish it, **Export for Publishing…** on its page lays it out as a repository of its own with a release workflow.

Plugins from other repositories are listed through [`community/`](community/): one file naming the repository and version, reviewed on its pull request. See [Listing in the Textus market](LISTING.md) - for a skill in [`skills/`](skills/) too.

## Developing these plugins

```sh
npm ci
npm run check   # reads every manifest, runs the tests
npm run build   # dist/: the zips and index.json
```

The Textus app's tests and its development server use a checkout of this repository placed beside the app (`textus-plugins/`), or the one `TEXTUS_PLUGINS_DIR` names.

## License

MIT - see [LICENSE](LICENSE). The libraries copied into the packages keep their own licenses: PDF.js (Apache-2.0), JSZip (MIT) and docx-preview (Apache-2.0).

