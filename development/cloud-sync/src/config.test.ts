import { describe, expect, it } from "vitest";
import { inScope, normalizeConfig, relativePath } from "./config";
import { parseManifest } from "./content";
import { FORMAT, encode } from "./model";

describe("connection and data boundaries", () => {
  it("uses Nutstore's fixed endpoint and a dedicated workspace folder", () => {
    expect(
      normalizeConfig({
        provider: "nutstore",
        endpoint: "https://wrong.example",
        prefix: "/我的笔记/",
      }),
    ).toMatchObject({
      endpoint: "https://dav.jianguoyun.com/dav",
      prefix: "我的笔记",
    });
  });
  it.each([
    "http://example.com",
    "https://user:secret@example.com",
    "https://example.com?secret=x",
    "https://example.com/#x",
    "bad",
  ])("rejects credential-bearing or unsafe endpoint %s", (endpoint) => {
    expect(() => normalizeConfig({ provider: "webdav", endpoint })).toThrow(
      "invalidEndpoint",
    );
  });
  it.each([
    "../x",
    "/x",
    "a//b",
    "a/./b",
    "a/..",
    "a\\b",
    "CON.md",
    "x/nul",
    "a:",
    "a ",
  ])("rejects nonportable relative path %s", (path) =>
    expect(relativePath(path)).toBe(false),
  );
  it("allows only documented project data and supported workspace documents", () => {
    for (const path of [
      "a.md",
      "图片/图.png",
      "manual.pdf",
      ".textus/agent.md",
      ".textus/memory/a.md",
      ".textus/skills/a.md",
    ])
      expect(inScope(path)).toBe(true);
    for (const path of [
      ".env",
      ".git/config",
      "provider_keys.json",
      ".textus/plugins/other/state.json",
      ".textus/secret.md",
      "node_modules/a.md",
      "private.local",
      "script.js",
    ])
      expect(inScope(path)).toBe(false);
  });
  it.each([
    "../escape.md",
    "/absolute.md",
    ".textus/plugins/other/a.md",
    "CON.md",
  ])("rejects remote manifest path %s", (path) => {
    expect(() =>
      parseManifest(
        encode({
          format: FORMAT,
          revision: "r",
          updatedAt: "now",
          files: { [path]: { hash: "a".repeat(64), size: 0, blocks: [] } },
        }),
      ),
    ).toThrow("invalidManifest");
  });
  it("rejects manifest sizes that disagree with the referenced blocks", () => {
    expect(() =>
      parseManifest(
        encode({
          format: FORMAT,
          revision: "r",
          updatedAt: "now",
          files: {
            "a.md": {
              hash: "a".repeat(64),
              size: 10,
              blocks: [{ hash: "b".repeat(64), size: 9 }],
            },
          },
        }),
      ),
    ).toThrow("invalidManifest");
  });
});
