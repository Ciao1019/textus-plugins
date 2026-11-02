import { beforeAll, describe, expect, it } from "vitest";

/** Reminders' logic (plugins/catvinci.reminders/reminders.js). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let r: any;

beforeAll(async () => {
  const script = "../plugins/catvinci.reminders/reminders.js";
  await import(/* @vite-ignore */ script);
  r = (globalThis as unknown as { reminders: unknown }).reminders;
});

describe("reminders", () => {
  it("finds the marks, a date alone at nine, and skips ticked tasks", () => {
    const text = [
      "# Week",
      "- [ ] Send the draft (@2026-11-02 14:30)",
      "- [x] Done already (@2026-11-02 10:00)",
      "Call Mum (@2026-11-03)",
      "No mark here",
    ].join("\n");
    expect(r.find(text)).toEqual([
      { line: 2, when: "2026-11-02T14:30", text: "Send the draft" },
      { line: 4, when: "2026-11-03T09:00", text: "Call Mum" },
    ]);
  });

  it("keeps the next ones only, soonest first", () => {
    const list = [
      { when: "2026-11-03T09:00" },
      { when: "2026-10-01T09:00" },
      { when: "2026-11-02T14:30" },
    ];
    const now = new Date("2026-10-30T12:00:00");
    expect(r.upcoming(list, now, 5).map((x: { when: string }) => x.when)).toEqual([
      "2026-11-02T14:30",
      "2026-11-03T09:00",
    ]);
    expect(r.upcoming(list, now, 1)).toHaveLength(1);
  });

  it("gives a reminder the same id each time, and writes marks as Obsidian does", () => {
    const one = { when: "2026-11-02T14:30", text: "Send" };
    expect(r.jobId("a.md", one)).toBe(r.jobId("a.md", { ...one }));
    expect(r.jobId("a.md", one)).not.toBe(r.jobId("b.md", one));
    expect(r.jobId("a.md", one)).toMatch(/^[A-Za-z0-9_.-]+$/);
    expect(r.mark(new Date(2026, 10, 2, 9, 5))).toBe("(@2026-11-02 09:05)");
  });
});
