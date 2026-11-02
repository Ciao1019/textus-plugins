# The plugin template

A small plugin that works, to start yours from: a command, a sidebar list
and its strings in English and Chinese. Copy this folder, load it in
Textus (Settings › Extensions › Plugins › Load a plugin folder…), and when
it is ready, **Export for Publishing** on its page lays it out as a
repository of its own - README, LICENSE and a release workflow.

To try it as it is: in Textus, **Settings › Extensions › Plugins › Load a
plugin folder…**, and pick this folder.

To make it yours:

1. Change `your-name` in `textus-plugin.json` and `host.js` to your
   publisher name, and `hello` to your plugin's.
2. Write what it does in `host.js` - every call is in
   [textus.d.ts](https://github.com/CatVinci-Studio/Textus/blob/main/docs/dev/textus.d.ts),
   and [Writing plugins](https://github.com/CatVinci-Studio/Textus/blob/main/docs/dev/writing-plugins.md)
   walks through them.
3. Say what it does and how to use it in `README.md`: the market shows it
   on the plugin's page, and it is the guide once installed. Add
   `README.zh.md` and so on for other languages.

More of what a plugin can do, each a few lines:

```js
// A fenced block drawn by the plugin: ```chart ... ``` (manifest:
// contributes.codeBlocks [{ "language": "chart" }]).
textus.views.registerCodeBlock("chart", {
  render(block, webview) {
    webview.html = `<pre>${block.source}</pre>`;
    block.onDidChange((source) => webview.postMessage(source));
  },
});

// Marks on the text: "TODO" highlighted wherever it is.
textus.editor.registerDecorations({
  decorate: (blocks) =>
    blocks
      .filter((b) => b.markdown.includes("TODO"))
      .map((b) => ({ block: b.id, anchor: "TODO", style: "highlight", tone: "warning" })),
});

// A reminder every morning at nine, kept across restarts (API 1.1:
// "notifications" in permissions, and "files.read" for `open`). Clicking
// it opens the journal at its first line.
textus.schedule.set("morning", {
  daily: "09:00",
  notify: {
    title: "Morning pages",
    body: "Three pages before anything else.",
    open: { path: "journal.md", line: 0 },
  },
});

// Work on a schedule with no window needed (API 1.1: "background" in
// permissions and "background": "background.js" in the manifest). In
// background.js, `exports.sync = async (job, ctx) => { ... }` runs for 30 s
// at most, with files, net, storage and notify but no editor or UI.
textus.schedule.set("sync", { every: "1h", run: "sync" });

// Who changed the document (API 1.1): "user", "ai", "disk", "plugin" or
// "history" - to count only the user's own writing.
let lastTyped = 0;
textus.editor.onDidChange(({ source }) => {
  if (source === "user") lastTyped = Date.now();
});

// Before a save: the front matter's "updated" set to today (files.write).
textus.files.onWillSave(({ text }) =>
  text.replace(/^updated: .*$/m, `updated: ${new Date().toISOString().slice(0, 10)}`),
);
```
