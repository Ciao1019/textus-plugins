// Image Viewer: a picture or an SVG file opened in a tab of its own. The
// page (view.html) asks for the file once it is up; this reads it and
// hands it over.
/** What activate was given: the plugin's storage and own files. */
let ctx;

exports.activate = function (context) {
  ctx = context;
  textus.views.registerFileEditor("catvinci.image-viewer.image", {
    resolve: async function (document, webview) {
      webview.onDidReceiveMessage(async function (message) {
        if (message.type !== "ready") return;
        let bytes;
        try {
          bytes = await document.readFile();
        } catch {
          // Moved, deleted or unreadable: the page says so.
          return webview.postMessage({ type: "failed" });
        }
        webview.postMessage({
          type: "file",
          name: document.fileName,
          bytes: bytes,
        });
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
