import { beforeAll, describe, expect, it } from "vitest";

/** Link Cards' logic (plugins/catvinci.link-cards/cards.js). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lc: any;

beforeAll(async () => {
  const script = "../plugins/catvinci.link-cards/cards.js";
  await import(/* @vite-ignore */ script);
  lc = (globalThis as unknown as { linkCards: unknown }).linkCards;
});

describe("link cards", () => {
  it("reads a page's Open Graph card, its relative picture made whole", () => {
    const html = `<html><head><title>Fallback</title>
      <meta property="og:title" content="Textus &amp; you">
      <meta name="description" content="Writes with you.">
      <meta property="og:image" content="/og.png">
      <meta property="og:site_name" content="CatVinci"></head></html>`;
    expect(lc.fromHtml(html, "https://textus.catvinci.com/a")).toEqual({
      url: "https://textus.catvinci.com/a",
      title: "Textus & you",
      description: "Writes with you.",
      image: "https://textus.catvinci.com/og.png",
      site: "CatVinci",
    });
    expect(lc.fromHtml("<title> Plain </title>", "https://x.org").title).toBe("Plain");
  });

  it("keeps a card as one line per field, and reads it back", () => {
    const card = { url: "https://x.org", title: "Two\nlines", description: null };
    const source = lc.write(card);
    expect(source).toBe("url: https://x.org\ntitle: Two lines");
    expect(lc.parse(source)).toEqual({ url: "https://x.org", title: "Two lines" });
  });

  it("plays YouTube and Bilibili videos, and nothing else", () => {
    expect(lc.videoEmbed("https://www.youtube.com/watch?v=abc123")).toBe("https://www.youtube.com/embed/abc123");
    expect(lc.videoEmbed("https://youtu.be/abc123")).toBe("https://www.youtube.com/embed/abc123");
    expect(lc.videoEmbed("https://www.bilibili.com/video/BV1xx411c7mD/")).toContain("bvid=BV1xx411c7mD");
    expect(lc.videoEmbed("https://example.com/video/1")).toBeNull();
  });
});
