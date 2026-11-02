import { describe, expect, it } from "vitest";
import { changes, report, review, verdict } from "../scripts/review-lib.mjs";

const MIT = "MIT License\n\nCopyright (c) 2026 jane\n";

function plugin(over: Record<string, unknown> = {}, files: Record<string, string> = {}) {
  const manifest = {
    id: "jane.word-count",
    name: "Word Count",
    publisher: "jane",
    description: "Counts the words in the document.",
    version: "0.2.0",
    main: "host.js",
    engines: { textus: ">=1.3.0-beta.2" },
    platforms: ["desktop", "ios"],
    permissions: ["editor.read"],
    l10n: { en: { hello: "Hi" }, zh: { hello: "你好" } },
    ...over,
  };
  const all: Record<string, string> = {
    "textus-plugin.json": JSON.stringify(manifest),
    "host.js": "exports.activate = function () {};",
    "README.md": "# Word Count\n\nUse it.",
    ...files,
  };
  const pkg = new Map(Object.entries(all).map(([k, v]) => [k, Buffer.from(v)]));
  const source = new Map([...pkg, ["LICENSE", Buffer.from(MIT)]]);
  return { entry: { id: "jane.word-count", version: manifest.version }, pkg, source };
}

const levels = (results: { level: string; check: string }[], check: string) =>
  results.filter((r) => r.check === check).map((r) => r.level);

describe("review", () => {
  it("passes a plugin that is its tagged source and says what it needs", () => {
    const results = review(plugin());
    expect(verdict(results)).toBe("pass");
    expect(report({ id: "jane.word-count", version: "0.2.0" }, results)).toContain(
      "### ✅ jane.word-count 0.2.0",
    );
  });

  it("fails a zip that isn't the repository at the tag", () => {
    const p = plugin();
    p.pkg.set("host.js", Buffer.from("exports.activate = function () { steal(); };"));
    const results = review(p);
    expect(levels(results, "source")).toEqual(["fail"]);
  });

  it("fails an id or version that doesn't match the listing, or a version not newer", () => {
    expect(levels(review({ ...plugin(), entry: { id: "jane.other", version: "0.2.0" } }), "package")).toContain("fail");
    const results = review({ ...plugin(), previous: { version: "0.2.0", permissions: [] } });
    expect(results.find((r) => r.check === "package" && r.level === "fail")?.detail).toContain(
      "isn't newer",
    );
  });

  it("fails programs, eval and code from the web", () => {
    const results = review(
      plugin({}, {
        "tool.dll": "MZ",
        "lib/a.js": "eval(x)",
        "view.html": '<script src="https://evil.example/x.js"></script>',
      }),
    );
    expect(results.filter((r) => r.level === "fail").map((r) => r.check)).toEqual(
      expect.arrayContaining(["package", "code"]),
    );
  });

  it("asks a person about new or broad permissions", () => {
    const results = review({
      ...plugin({ permissions: ["editor.read", "network:*"] }),
      previous: { version: "0.1.0", permissions: ["editor.read"] },
    });
    expect(levels(results, "permissions")).toEqual(["warn", "warn"]);
    expect(verdict(results)).toBe("warn");
  });

  it("wants where it runs said, and the background kept off iOS", () => {
    const fails = (over: object) =>
      review(plugin(over)).filter((r) => r.check === "package" && r.level === "fail");
    expect(fails({ platforms: undefined })).toHaveLength(1);
    expect(fails({ platforms: ["android"] })).toHaveLength(1);
    expect(
      fails({ requires: [{ setting: "runInBackground" }], platforms: ["desktop", "ios"] }),
    ).toHaveLength(1);
    expect(fails({ requires: [{ setting: "runInBackground" }], platforms: ["desktop"] })).toHaveLength(0);
  });

  it("asks why a plugin runs code in the background", () => {
    const results = review(plugin({ permissions: ["notifications", "background"] }));
    expect(levels(results, "permissions")).toEqual(["warn"]);
  });

  it("wants a README in the package, an open license, and no borrowed name", () => {
    const p = plugin({ name: "Official Word Count" });
    p.pkg.delete("README.md");
    p.source.set("LICENSE", Buffer.from("All rights reserved."));
    const details = review(p)
      .filter((r) => r.check === "content")
      .map((r) => r.detail);
    expect(details.join(" ")).toMatch(/no README\.md in the package/);
    expect(details.join(" ")).toMatch(/doesn't recognise/);
    expect(details.join(" ")).toMatch(/CatVinci or Official/);
  });
});

describe("changes", () => {
  // The listed version asks for files.write and network:* and decodes
  // strings: all approved when it was listed.
  const listedOver = { version: "0.1.0", permissions: ["files.read", "files.write", "network:*"] };
  const listedFiles = { "host.js": "exports.activate = () => atob(x);" };
  const listed = () => {
    const results = review(plugin(listedOver, listedFiles));
    return { permissions: listedOver.permissions, results };
  };
  const next = (over: Record<string, unknown> = {}, files: Record<string, string> = {}) => {
    const manifest = { ...listedOver, version: "0.2.0", ...over };
    const results = review({
      ...plugin(manifest, { ...listedFiles, ...files }),
      previous: listedOver,
    });
    return { permissions: manifest.permissions as string[], results };
  };

  it("lets through a version that only repeats what was approved", () => {
    const found = changes(listed(), next());
    expect(found).toMatchObject({ failed: false, newPermissions: [], newWarnings: [] });
    expect(found.automatic).toBe(true);
    expect(changes(listed(), next({ permissions: ["network:*"] })).automatic).toBe(true);
  });

  it("holds a version that asks for a new permission, even one not broad", () => {
    const found = changes(
      listed(),
      next({ permissions: ["files.read", "files.write", "network:*", "editor.read"] }),
    );
    expect(found.newPermissions).toEqual(["editor.read"]);
    expect(found.automatic).toBe(false);
  });

  it("holds a version with a warning the listed one didn't have", () => {
    const found = changes(listed(), next({}, { "panel.js": "document.cookie" }));
    expect(found.newWarnings.map((r) => r.detail)).toEqual(["document.cookie in panel.js."]);
    expect(found.automatic).toBe(false);
  });

  it("holds a version that fails a check", () => {
    const found = changes(listed(), next({}, { "tool.dll": "MZ" }));
    expect(found.failed).toBe(true);
    expect(found.automatic).toBe(false);
  });
});
