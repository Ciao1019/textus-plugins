// Slides: the document in front as a Marp deck - slides apart at each
// "---" - shown in a tab that follows the writing, and saved as one HTML
// file to present from any browser.

/* global Marp */
const t = (key, ...args) => textus.l10n.t(key, ...args);
let ctxRef = null;
const views = new Set();

function render(markdown) {
  const marp = new Marp({ html: false, math: "katex", script: false });
  return marp.render(markdown || "");
}

/** The last deck, kept while the slides' own tab is in front. */
let deck = null;

async function update() {
  const text = await textus.editor.getText();
  if (text !== null) deck = render(text);
  if (deck) for (const view of views) void view.postMessage(deck);
}

/** A page that presents itself: the slides, ← → and Space to move, F for
 *  full screen. */
function standalone(title, html, css) {
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}
html,body{margin:0;height:100%;background:#000}
div.marpit{height:100%;display:grid;place-items:center}
div.marpit>svg{display:none;width:100vw;height:100vh}
div.marpit>svg.on{display:block}
</style></head><body>${html}
<script>
const s=[...document.querySelectorAll("div.marpit>svg")];let i=Number(location.hash.slice(1))||0;
const show=(n)=>{i=Math.max(0,Math.min(s.length-1,n));s.forEach((x,k)=>x.classList.toggle("on",k===i));history.replaceState(null,"","#"+i)};
addEventListener("keydown",(e)=>{if(["ArrowRight","ArrowDown","PageDown"," "].includes(e.key))show(i+1);else if(["ArrowLeft","ArrowUp","PageUp"].includes(e.key))show(i-1);else if(e.key==="f")document.documentElement.requestFullscreen?.()});
addEventListener("click",(e)=>show(e.clientX>innerWidth/3?i+1:i-1));show(i);
</script></body></html>`;
}

async function exportHtml() {
  const path = await textus.editor.getPath();
  const text = await textus.editor.getText();
  if (!path || text === null) {
    textus.ui.notice(t("saveFirst"), { tone: "warning" });
    return;
  }
  const { html, css } = render(text);
  const target = path.replace(/\.(md|markdown)$/i, "") + ".slides.html";
  const name = path.split(/[\\/]/).pop();
  await textus.files.writeText(target, standalone(name, html, css));
  textus.ui.notice(t("exported", target.split(/[\\/]/).pop()));
}

exports.activate = function (ctx) {
  ctxRef = ctx;
  ctx.subscriptions.push(
    textus.views.registerWebview("catvinci.slides.view", {
      async resolve(webview) {
        const page = await ctxRef.plugin.readText("slides.html");
        webview.html = page.replace("{{lang}}", textus.env.language);
        // Drawn again in the interface's language when that changes.
        const relabel = textus.env.onDidChangeLanguage(() => {
          webview.html = page.replace("{{lang}}", textus.env.language);
        });
        webview.onDidDispose(() => relabel.dispose());
        views.add(webview);
        webview.onDidDispose(() => views.delete(webview));
        webview.onDidReceiveMessage((message) => {
          if (message === "ready") void update();
          if (message === "export") void exportHtml();
        });
      },
    }),
    textus.commands.register("catvinci.slides.present", async () => {
      // Read before the deck's tab takes the front.
      await update();
      await textus.layout.openView("catvinci.slides.view", { where: "beside" });
    }),
    textus.commands.register("catvinci.slides.export", exportHtml),
    textus.editor.onDidChange(update),
    textus.editor.onDidChangeActive(update),
  );
};
