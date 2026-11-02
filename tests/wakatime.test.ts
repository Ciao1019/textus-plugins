import { beforeAll, describe, expect, it } from "vitest";

/** WakaTime's heartbeat rules (plugins/catvinci.wakatime/beat.js). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wb: any;

beforeAll(async () => {
  const script = "../plugins/catvinci.wakatime/beat.js";
  await import(/* @vite-ignore */ script);
  wb = (globalThis as unknown as { wakaBeat: unknown }).wakaBeat;
});

describe("WakaTime heartbeats", () => {
  it("counts the user's own work in a window in front, never the background", () => {
    expect(wb.category("user", "active")).toBe("writing docs");
    expect(wb.category("history", "active")).toBe("writing docs");
    expect(wb.category("ai", "active")).toBe("ai coding");
    expect(wb.category("disk", "active")).toBeNull();
    expect(wb.category("plugin", "active")).toBeNull();
    expect(wb.category("user", "inactive")).toBeNull();
    expect(wb.category("user", "background")).toBeNull();
  });

  it("sends on another file or kind of work, every two minutes on the same one, and on every save", () => {
    const last = { entity: "/n/a.md", at: 0, category: "writing docs" };
    expect(wb.due(null, "/n/a.md", 1000, false, "writing docs")).toBe(true);
    expect(wb.due(last, "/n/a.md", wb.EVERY_MS - 1, false, "writing docs")).toBe(false);
    expect(wb.due(last, "/n/a.md", wb.EVERY_MS, false, "writing docs")).toBe(true);
    expect(wb.due(last, "/n/b.md", 10, false, "writing docs")).toBe(true);
    expect(wb.due(last, "/n/a.md", 10, false, "ai coding")).toBe(true);
    expect(wb.due(last, "/n/a.md", 10, true, "writing docs")).toBe(true);
  });

  it("describes the work: project, branch and lines when known", () => {
    expect(
      wb.heartbeat("/notes/a.md", 1_700_000_000_000, true, {
        category: "writing docs",
        project: "notes",
        branch: "main",
        lines: 12,
      }),
    ).toEqual({
      entity: "/notes/a.md",
      type: "file",
      category: "writing docs",
      time: 1_700_000_000,
      is_write: true,
      language: "Markdown",
      project: "notes",
      branch: "main",
      lines: 12,
    });
    expect(wb.heartbeat("/a.md", 0, false, {})).not.toHaveProperty("project");
  });

  it("names the project and branch as the official plugins do", () => {
    expect(wb.project("C:\\work\\thesis\\", null)).toBe("thesis");
    expect(wb.project("/work/thesis", "PhD thesis\n")).toBe("PhD thesis");
    expect(wb.branch("ref: refs/heads/feat/notes\n")).toBe("feat/notes");
    expect(wb.branch("3f2a9c")).toBeNull();
    expect(wb.validKey("waka_12345678-1234-1234-1234-123456789abc")).toBe(true);
    expect(wb.validKey("nope")).toBe(false);
  });
});
