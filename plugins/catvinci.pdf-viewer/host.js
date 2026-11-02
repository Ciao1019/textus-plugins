// PDF Viewer: a PDF opened in a tab of its own, drawn by PDF.js in the
// page (view.html). Once the page is up it is handed the file, the zoom
// to open at and where it was left last time.

/** What activate was given: the plugin's storage and own files. */
let ctx;

/** Where each PDF was left - its page and zoom - by path, in one stored
 *  record; the most recent POSITIONS_KEPT. */
const POSITIONS = "positions";
const POSITIONS_KEPT = 200;

async function positionOf(path) {
  const all = (await ctx.storage.global.get(POSITIONS)) || {};
  return all[path] || null;
}

async function keepPosition(path, position) {
  const all = (await ctx.storage.global.get(POSITIONS)) || {};
  delete all[path];
  all[path] = position;
  const paths = Object.keys(all);
  for (const old of paths.slice(0, Math.max(0, paths.length - POSITIONS_KEPT)))
    delete all[old];
  await ctx.storage.global.set(POSITIONS, all);
}

exports.activate = function (context) {
  ctx = context;
  textus.views.registerFileEditor("catvinci.pdf-viewer.pdf", {
    resolve: async function (document, webview, context) {
      // A link to a page (#page=12): there at once, and again when asked.
      document.onDidRequestReveal(function (target) {
        if (target.page)
          webview.postMessage({ type: "goto", page: target.page });
      });
      webview.onDidReceiveMessage(async function (message) {
        // PDF.js's own data - a CJK font's character map, a standard font
        // - from the plugin's lib folder: the page can't fetch it.
        if (message.type === "data") {
          let bytes = null;
          try {
            bytes = await ctx.plugin.readFile(message.path);
          } catch {
            // Not shipped: PDF.js draws without it.
          }
          return webview.postMessage({
            type: "data",
            id: message.id,
            bytes: bytes,
          });
        }
        if (message.type === "position")
          return keepPosition(document.path, {
            page: message.page,
            scale: message.scale,
          });
        if (message.type !== "ready") return;
        let bytes;
        try {
          bytes = await document.readFile();
        } catch (err) {
          return webview.postMessage({
            type: "failed",
            message: String((err && err.message) || err),
          });
        }
        const position = await positionOf(document.path);
        webview.postMessage({
          type: "file",
          name: document.fileName,
          bytes: bytes,
          position: position,
          page: context.target?.page || 0,
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
