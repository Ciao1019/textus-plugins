// Kanban: a board kept as Markdown - "## List" headings, "- [ ] card"
// tasks under them, the front matter Obsidian's Kanban writes - opened as
// a board in its own tab. The page (board.html) parses and writes the
// Markdown; this reads and writes the file.
/** What activate was given: the plugin's storage and own files. */
let ctx;

const TEMPLATE = function () {
  const lists = ["todo", "doing", "done"].map((key) => textus.l10n.t(key));
  return (
    "---\nkanban-plugin: basic\n---\n\n" +
    lists.map((l) => "## " + l + "\n").join("\n")
  );
};

function join(root, name) {
  const sep = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  return root.replace(/[\\/]+$/, "") + sep + name;
}

exports.activate = function (context) {
  ctx = context;
  textus.commands.register("catvinci.kanban.new", async function () {
    const root = await textus.files.root();
    if (!root) {
      await textus.ui.message(textus.l10n.t("needsFolder"));
      return;
    }
    const name = await textus.ui.input({
      prompt: textus.l10n.t("boardName"),
      value: textus.l10n.t("board"),
    });
    if (!name || !name.trim()) return;
    const path = join(
      root,
      name.trim().replace(/[\\/:*?"<>|]/g, "-") + ".kanban.md",
    );
    // A board of that name opens as it is - matched without regard to
    // case, as macOS and Windows name files - and is never written over.
    const existing = (await textus.files.list(root)).find(
      (e) => e.path.toLowerCase() === path.toLowerCase(),
    );
    if (!existing) await textus.files.create(path, TEMPLATE());
    await textus.layout.open(existing ? existing.path : path);
  });

  textus.views.registerFileEditor("catvinci.kanban.board", {
    resolve: async function (document, webview) {
      // The text the board last showed or wrote: a change from elsewhere
      // (the file edited as Markdown) is sent to it, its own saves aren't.
      let known = null;
      const send = async function () {
        const text = await document.readText();
        if (text === known) return;
        known = text;
        webview.postMessage({ type: "file", text: text });
      };
      const watching = textus.files.onDidChange(function (e) {
        if (e.path === document.path) send().catch(() => {});
      });
      webview.onDidDispose(() => watching.dispose());
      webview.onDidReceiveMessage(async function (message) {
        if (message.type === "ready") {
          known = null;
          await send();
        }
        if (message.type === "save") {
          try {
            known = message.text;
            await document.writeText(message.text);
            webview.postMessage({ type: "saved" });
          } catch (err) {
            webview.postMessage({
              type: "error",
              message: String((err && err.message) || err),
            });
          }
        }
        // A [[link]] on a card: the note of that name in the folder, as
        // Textus resolves a wiki link - or, with none, beside the board.
        if (message.type === "openNote") {
          let note = null;
          try {
            note = await textus.metadata.resolveLink(
              "[[" + message.name + "]]",
              document.path,
            );
          } catch {
            // No folder open.
          }
          const beside = join(
            document.path.replace(/[\\/][^\\/]*$/, ""),
            message.name.replace(/\.(md|markdown)$/i, "") + ".md",
          );
          try {
            await textus.layout.open(note || beside);
          } catch {
            await textus.ui.message(textus.l10n.t("noNote", message.name));
          }
          return;
        }
        if (message.type === "markdown")
          await textus.layout.open(document.path, { asDocument: true });
      });
      const html = await ctx.plugin.readText("board.html");
      webview.html = html.replace("{{lang}}", textus.env.language);
      // Drawn again in the interface's language when that changes.
      const relabel = textus.env.onDidChangeLanguage(() => {
        webview.html = html.replace("{{lang}}", textus.env.language);
      });
      webview.onDidDispose(() => relabel.dispose());
    },
  });
};
