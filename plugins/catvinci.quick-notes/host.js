// Quick Notes: short notes kept by the plugin (textus.storage), listed in
// a sidebar tab. A note goes into the document at the caret, or opens as
// a new document of its own.
/** What activate was given: the plugin's storage and own files. */
let ctx;

let panel = null;

async function notes() {
  return (await ctx.storage.global.get("notes")) || [];
}

async function save(list) {
  await ctx.storage.global.set("notes", list);
  if (panel) panel.postMessage({ type: "notes", notes: list });
}

async function add(text) {
  const list = await notes();
  const note = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    text: text,
    at: Date.now(),
  };
  await save([note].concat(list));
  return note;
}

exports.activate = function (context) {
  ctx = context;
  textus.commands.register(
    "catvinci.quick-notes.capture",
    async function () {
      const text = await textus.ui.input({
        prompt: textus.l10n.t("prompt"),
        value: "",
      });
      if (text && text.trim()) await add(text.trim());
    },
  );

  textus.views.registerWebview("catvinci.quick-notes.panel", {
    resolve: async function (webview) {
      panel = webview;
      webview.onDidDispose(function () {
        if (panel === webview) panel = null;
      });
      // One message at a time, in order: each reads the notes the last
      // one wrote.
      let queue = Promise.resolve();
      webview.onDidReceiveMessage(function (message) {
        queue = queue.then(() => handle(webview, message)).catch(() => {});
        return queue;
      });
      const html = await ctx.plugin.readText("panel.html");
      webview.html = html.replace("{{lang}}", textus.env.language);
      // Drawn again in the interface's language when that changes.
      const relabel = textus.env.onDidChangeLanguage(() => {
        webview.html = html.replace("{{lang}}", textus.env.language);
      });
      webview.onDidDispose(() => relabel.dispose());
    },
  });
};

/** The note deleted last, and where it was, for Undo. */
let lastDeleted = null;

async function handle(webview, message) {
  const list = await notes();
  if (message.type === "ready")
    webview.postMessage({ type: "notes", notes: list });
  if (message.type === "new") {
    const note = await add("");
    webview.postMessage({ type: "focus", id: note.id });
  }
  if (message.type === "edit")
    await save(
      list.map((n) =>
        n.id === message.id ? Object.assign({}, n, { text: message.text }) : n,
      ),
    );
  if (message.type === "delete") {
    const at = list.findIndex((n) => n.id === message.id);
    if (at >= 0) lastDeleted = { note: list[at], at: at };
    await save(list.filter((n) => n.id !== message.id));
  }
  // A note left empty: gone, with nothing to undo.
  if (message.type === "drop")
    await save(list.filter((n) => n.id !== message.id || n.text.trim()));
  if (message.type === "undo" && lastDeleted) {
    const back = list.slice();
    back.splice(Math.min(lastDeleted.at, back.length), 0, lastDeleted.note);
    lastDeleted = null;
    await save(back);
  }
  const note = list.find((n) => n.id === message.id);
  // Asked for by a click: written at the caret at once, one undo away.
  if (message.type === "insert" && note)
    await textus.editor.insertText(note.text);
  if (message.type === "open" && note)
    await textus.layout.openUntitled(note.text);
}
