// Link Cards: a link as a card - its page's title, description and picture,
// or a video's player - in a ```card block that keeps them, so the card
// shows without the network and reads as text anywhere.

/* global linkCards */
const t = (key, ...args) => textus.l10n.t(key, ...args);

/** The card for `url`: what its page says, or the address alone when it
 *  can't be had. */
async function cardFor(url) {
  try {
    const response = await textus.net.fetch(url, { headers: { Accept: "text/html" } });
    if (response.ok) return linkCards.fromHtml(await response.text(), url);
  } catch {
    // Offline, or not a page: the address alone.
  }
  return { url: url };
}

const block = (card) => "```card\n" + linkCards.write(card) + "\n```\n";

async function insertCard() {
  const selected = await textus.editor.getSelection();
  const chosen = selected && linkCards.isUrl(selected.text) ? selected.text.trim() : null;
  const url = chosen || (await textus.ui.input({ prompt: t("urlPrompt"), placeholder: "https://" }));
  if (!url || !linkCards.isUrl(url)) return url && textus.ui.message(t("notUrl"));
  const card = await textus.ui.withProgress(t("fetching"), () => cardFor(url.trim()));
  if (chosen) await textus.editor.replaceSelection(block(card));
  else await textus.editor.insertText(block(card));
}

exports.activate = function (ctx) {
  ctx.subscriptions.push(
    textus.commands.register("catvinci.link-cards.insert", insertCard),
    textus.views.registerCodeBlock("card", {
      render: async (codeBlock, webview) => {
        webview.html = await ctx.plugin.readText("card.html");
        const send = () =>
          webview.postMessage({
            type: "card",
            card: linkCards.parse(codeBlock.source),
            video: linkCards.videoEmbed(linkCards.parse(codeBlock.source).url || ""),
            refresh: t("refresh"),
          });
        codeBlock.onDidChange(send);
        webview.onDidReceiveMessage(async (m) => {
          if (!m) return;
          if (m.type === "ready") send();
          if (m.type === "open" && linkCards.isUrl(m.url)) textus.layout.openExternal(m.url);
          if (m.type === "refresh") {
            const url = linkCards.parse(codeBlock.source).url;
            if (url) await codeBlock.setSource(linkCards.write(await cardFor(url)));
          }
        });
      },
    }),
  );
};
