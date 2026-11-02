// Word Reader: a .docx opened in a tab, drawn as Word lays it out by
// docx-preview in the page (view.html). "Edit as Markdown" hands the file
// to Textus to convert into a document of the user's, as File > Open did
// before this plugin.
/** What activate was given: the plugin's storage and own files. */
let ctx;

exports.activate = function (context) {
  ctx = context;
  textus.views.registerFileEditor("catvinci.word-reader.docx", {
    resolve: async function (document, webview) {
      webview.onDidReceiveMessage(async function (message) {
        if (message.type === "ready") {
          try {
            webview.postMessage({
              type: "file",
              name: document.fileName,
              bytes: await document.readFile(),
            });
          } catch (err) {
            webview.postMessage({
              type: "failed",
              message: String((err && err.message) || err),
            });
          }
        }
        if (message.type === "edit")
          await textus.layout.open(document.path, { asDocument: true });
      });
      const html = await ctx.plugin.readText("view.html");
      webview.html = html.replace("{{lang}}", textus.env.language);
      // Drawn again in the interface's language when that changes.
      const relabel = textus.env.onDidChangeLanguage(() => {
        webview.html = html.replace("{{lang}}", textus.env.language);
      });
      webview.onDidDispose(() => relabel.dispose());
    },
  });
};
