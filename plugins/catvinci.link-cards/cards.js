// Link Cards: what a ```card block holds, and what a web page says about
// itself (its title, description and picture). Pure, for the host and the
// tests.

(function (root) {
  const FIELDS = ["url", "title", "description", "image", "site"];

  /** A block's `key: value` lines. */
  function parse(source) {
    const card = {};
    for (const line of String(source).split("\n")) {
      const m = /^(\w+)\s*:\s*(.*)$/.exec(line.trim());
      if (m && FIELDS.includes(m[1].toLowerCase())) card[m[1].toLowerCase()] = m[2].trim();
    }
    return card;
  }

  /** `card` as a block's source: one line each, no line breaks inside. */
  function write(card) {
    return FIELDS.filter((k) => card[k])
      .map((k) => k + ": " + String(card[k]).replace(/\s+/g, " ").trim())
      .join("\n");
  }

  const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  const decode = (s) =>
    s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, e) =>
      e[0] === "#"
        ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
        : ENTITIES[e.toLowerCase()] || all,
    );

  /** A page's card: Open Graph's title, description, picture and site, else
   *  its <title> and description meta. Relative picture addresses are made
   *  whole against `url`. */
  function fromHtml(html, url) {
    const head = String(html).slice(0, 200000);
    const meta = (names) => {
      for (const name of names) {
        const re = new RegExp(
          "<meta[^>]+(?:property|name)=[\"']" + name.replace(/[.:]/g, "\\$&") + "[\"'][^>]*>",
          "i",
        );
        const tag = re.exec(head);
        const content = tag && /content=["']([^"']*)["']/i.exec(tag[0]);
        if (content && content[1].trim()) return decode(content[1].trim());
      }
      return null;
    };
    const title = meta(["og:title", "twitter:title"]) || ((/<title[^>]*>([^<]*)<\/title>/i.exec(head) || [])[1] || "").trim();
    let image = meta(["og:image", "og:image:url", "twitter:image"]);
    if (image) {
      try {
        image = new URL(image, url).href;
      } catch {
        image = null;
      }
    }
    return {
      url: url,
      title: decode(title || "") || null,
      description: meta(["og:description", "description", "twitter:description"]),
      image: image,
      site: meta(["og:site_name"]),
    };
  }

  /** The player a video page can be shown in: YouTube's or Bilibili's. */
  function videoEmbed(url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return "https://www.youtube.com/embed/" + u.pathname.slice(1);
    if (host === "youtube.com" && u.searchParams.get("v"))
      return "https://www.youtube.com/embed/" + u.searchParams.get("v");
    const bv = /\/video\/(BV[0-9A-Za-z]+)/.exec(u.pathname);
    if (host === "bilibili.com" && bv) return "https://player.bilibili.com/player.html?bvid=" + bv[1] + "&autoplay=0";
    return null;
  }

  const isUrl = (text) => /^https?:\/\/\S+$/.test(String(text).trim());

  root.linkCards = { parse, write, fromHtml, videoEmbed, isUrl };
})(typeof window !== "undefined" ? window : globalThis);
