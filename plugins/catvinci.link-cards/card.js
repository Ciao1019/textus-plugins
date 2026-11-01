// A ```card block's page: the card host.js sends, opened in the browser on
// a click; a video plays in place.
(function () {
  "use strict";
  const api = acquireTextusApi();
  const root = document.getElementById("card");
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  };
  const domain = (url) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  };

  api.onMessage((m) => {
    if (!m || m.type !== "card") return;
    const card = m.card || {};
    if (m.video) {
      const box = el("div", "video");
      const frame = document.createElement("iframe");
      frame.src = m.video;
      frame.allow = "fullscreen; picture-in-picture";
      frame.setAttribute("allowfullscreen", "");
      box.append(frame);
      return root.replaceChildren(box);
    }
    const link = el("button", "link");
    link.type = "button";
    const text = el("div", "text");
    text.append(el("div", "title", card.title || card.url || ""));
    if (card.description) text.append(el("div", "description", card.description));
    text.append(el("div", "site", card.site ? card.site + " · " + domain(card.url) : domain(card.url || "")));
    link.append(text);
    if (card.image && /^https?:\/\//.test(card.image)) {
      const picture = el("div", "picture");
      picture.style.backgroundImage = "url(" + JSON.stringify(card.image) + ")";
      link.append(picture);
    }
    link.addEventListener("click", () => api.postMessage({ type: "open", url: card.url }));
    const refresh = el("button", "tx-button small refresh");
    refresh.type = "button";
    const glyph = el("span", "tx-icon");
    glyph.dataset.icon = "refresh";
    refresh.append(glyph, m.refresh || "");
    refresh.addEventListener("click", () => api.postMessage({ type: "refresh" }));
    root.replaceChildren(link, refresh);
  });
  api.postMessage({ type: "ready" });
})();
