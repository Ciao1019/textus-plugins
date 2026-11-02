import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { expect, it } from "vitest";

it("checks and packages the first community listing using its release filename", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  // Keep the fixture beneath the repository so the copied script resolves its dependencies.
  const fixture = mkdtempSync(join(root, ".community-build-"));
  try {
    for (const dir of ["scripts", "plugins", "skills", "community"]) mkdirSync(join(fixture, dir));
    for (const file of ["build.mjs", "community.mjs"])
      copyFileSync(join(root, "scripts", file), join(fixture, "scripts", file));
    writeFileSync(join(fixture, "libs.json"), "{}");
    writeFileSync(join(fixture, "removed.json"), '{"plugins":[]}');
    const entry = { id: "jane.word-count", repo: "jane/textus-word-count", version: "0.2.0" };
    const asset = `${entry.id}-${entry.version}.zip`;
    const url = `https://github.com/${entry.repo}/releases/download/v${entry.version}/${asset}`;
    const manifest = { id: entry.id, version: entry.version, main: "host.js" };
    const zip = await new JSZip()
      .file("textus-plugin.json", JSON.stringify(manifest))
      .file("host.js", "module.exports = {};")
      .file("README.md", "# Word count\n")
      .generateAsync({ type: "nodebuffer" });
    const sha256 = createHash("sha256").update(zip).digest("hex");
    writeFileSync(
      join(fixture, "community", `${entry.id}.json`),
      JSON.stringify({ ...entry, sha256 }),
    );
    const preload = join(fixture, "fetch.mjs");
    writeFileSync(
      preload,
      `
      globalThis.fetch = async (url) => {
        if (process.argv.includes("--check")) throw new Error("check must not download");
        if (url !== ${JSON.stringify(url)}) throw new Error("unexpected release URL: " + url);
        return new Response(Buffer.from(${JSON.stringify(zip.toString("base64"))}, "base64"));
      };
    `,
    );
    const script = join(fixture, "scripts", "build.mjs");
    const checked = spawnSync(process.execPath, ["--import", preload, script, "--check"], {
      encoding: "utf8",
    });
    expect(checked.status, checked.stderr).toBe(0);
    expect(checked.stdout).toContain("1 community listings");
    const built = spawnSync(process.execPath, ["--import", preload, script], { encoding: "utf8" });
    expect(built.status, built.stderr).toBe(0);
    expect(readFileSync(join(fixture, "dist", asset))).toEqual(zip);
    const catalog = JSON.parse(readFileSync(join(fixture, "dist", "index.json"), "utf8"));
    expect(catalog.plugins).toEqual([
      expect.objectContaining({
        id: entry.id,
        version: entry.version,
        official: false,
        manifest,
        sha256,
        url: `https://github.com/CatVinci-Studio/textus-plugins/releases/download/${entry.id}-v${entry.version}/${asset}`,
      }),
    ]);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
