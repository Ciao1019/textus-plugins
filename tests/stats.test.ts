import { describe, expect, it } from "vitest";
import { counts, statsOf } from "../scripts/stats.mjs";

const release = (tag: string, date: string) => ({
  tag_name: tag,
  published_at: `${date}T10:00:00Z`,
  assets: [{ name: `${tag}.zip`, download_count: 1000 }],
});

const releases = [
  release("catvinci.tasks-v0.1.1", "2026-10-27"),
  release("catvinci.tasks-v0.1.0", "2026-10-20"),
  release("catvinci.vim-v0.1.0", "2026-10-21"),
  release("catalog", "2026-10-27"),
];

const endpoint = {
  date: "2026-10-30",
  plugin: {
    "catvinci.tasks": {
      installs: 17,
      installs30: 9,
      updates30: 40,
      uninstalls: 2,
      updates30ByVersion: { "0.1.1": 40 },
    },
  },
  theme: {},
  skill: { tighten: { installs: 5, installs30: 5, updates30: 0, uninstalls: 0 } },
};

describe("statsOf", () => {
  it("takes installs from the install counts and dates from the releases, never GitHub's downloads", () => {
    expect(statsOf(releases, endpoint)).toEqual({
      plugin: {
        "catvinci.tasks": {
          installs: 17,
          installs30: 9,
          published: "2026-10-20",
          updated: "2026-10-27",
        },
        "catvinci.vim": { published: "2026-10-21", updated: "2026-10-21" },
      },
      skill: { tighten: { installs: 5, installs30: 5 } },
    });
  });

  it("leaves the installs out when the counts couldn't be read", async () => {
    const none = await counts("http://127.0.0.1:9/api/ext/stats");
    expect(none).toBeNull();
    expect(statsOf(releases, none).plugin["catvinci.tasks"]).toEqual({
      published: "2026-10-20",
      updated: "2026-10-27",
    });
    expect(statsOf(releases, none).skill).toEqual({});
  });
});
