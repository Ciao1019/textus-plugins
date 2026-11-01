import { describe, expect, it } from "vitest";
import { communityEntry, newerRelease, releaseZipUrl } from "../scripts/community.mjs";

const good = { id: "jane.word-count", repo: "jane/textus-word-count", version: "0.2.0" };

describe("communityEntry", () => {
  it("reads a listing and where its zip is", () => {
    const entry = communityEntry(good, "community/jane.word-count.json");
    expect(entry).toMatchObject({ ...good, libs: {} });
    expect(releaseZipUrl(entry)).toBe(
      "https://github.com/jane/textus-word-count/releases/download/v0.2.0/jane.word-count-0.2.0.zip",
    );
  });

  it("refuses a listing that is wrong", () => {
    const bad: [Record<string, unknown>, string][] = [
      [good, "community/other.json"],
      [{ ...good, id: "catvinci.word-count" }, "community/catvinci.word-count.json"],
      [{ ...good, repo: "not a repo" }, ""],
      [{ ...good, version: "2" }, ""],
      [{ ...good, sha256: "abc" }, ""],
      [{ ...good, libs: ["x"] }, ""],
    ];
    for (const [json, path] of bad) expect(() => communityEntry(json, path)).toThrow();
  });
});

describe("newerRelease", () => {
  const release = (tag: string, over: Record<string, unknown> = {}) => ({
    tag_name: tag,
    draft: false,
    prerelease: false,
    assets: [{ name: `jane.word-count-${tag.slice(1)}.zip` }],
    ...over,
  });

  it("finds the newest released version with its zip", () => {
    const releases = [release("v0.1.0"), release("v0.10.0"), release("v0.3.0"), release("v0.2.0")];
    expect(newerRelease(good, releases)).toBe("0.10.0");
  });

  it("finds nothing when only the listed version, older ones or unfinished releases exist", () => {
    expect(newerRelease(good, [release("v0.2.0"), release("v0.1.9")])).toBeNull();
    expect(
      newerRelease(good, [
        release("v0.3.0", { draft: true }),
        release("v0.4.0", { prerelease: true }),
        release("v0.5.0", { assets: [{ name: "other-0.5.0.zip" }] }),
        release("v0.6.0-beta.1"),
        release("0.7.0"),
      ]),
    ).toBeNull();
  });
});
