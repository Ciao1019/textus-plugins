import { beforeAll, describe, expect, it } from "vitest";
import manifest from "../plugins/catvinci.quick-insert/textus-plugin.json";

/** Quick Insert's emoji table (plugins/catvinci.quick-insert/emoji.js). */
let emoji: {
  search: (typed: string, limit: number) => { char: string; name: string }[];
  all: { char: string; name: string }[];
};

beforeAll(async () => {
  const script = "../plugins/catvinci.quick-insert/emoji.js";
  await import(/* @vite-ignore */ script);
  emoji = (globalThis as unknown as { quickEmoji: typeof emoji }).quickEmoji;
});

describe("quick insert", () => {
  it("finds emoji by name, another word, or a Chinese one, names first", () => {
    expect(emoji.search("tada", 8)[0].char).toBe("🎉");
    expect(emoji.search("+1", 8)[0].char).toBe("👍");
    expect(emoji.search("笑", 8).map((e) => e.char)).toContain("😄");
    expect(emoji.search("heart", 8)[0].char).toBe("❤️");
    expect(emoji.search("", 8)).toEqual([]);
  });

  it("has one name per emoji", () => {
    const names = emoji.all.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("opens emoji only after a space or at the line's start, not in 10:30 or a URL", () => {
    const pattern = new RegExp(`(?:${manifest.contributes.completions[0].pattern})$`, "u");
    expect(pattern.exec("I am :sm")?.[0]).toBe(":sm");
    expect(pattern.exec(":tada")?.[0]).toBe(":tada");
    expect(pattern.exec("at 10:30")).toBeNull();
    expect(pattern.exec("https://x")).toBeNull();
  });

  it("names every command in every language it speaks", () => {
    const keys = manifest.contributes.commands.map((c) => c.title.slice(1, -1));
    for (const [lang, strings] of Object.entries(manifest.l10n))
      for (const key of keys) expect(strings[key as keyof typeof strings], `${lang}.${key}`).toBeTruthy();
  });
});
