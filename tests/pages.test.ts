import { beforeAll, describe, expect, it } from "vitest";

/** Pages' tree (plugins/catvinci.pages/pages.js). */
type Node = { name: string; rel: string | null; dir: string | null; icon: string | null; children: Node[] };
let p: {
  tree: (docs: { rel: string; icon?: unknown }[]) => Node[];
  ancestors: (rel: string, rels: string[]) => string[];
  subpage: (parent: string, title: string) => string;
  link: (rel: string, rels: string[]) => string;
};

beforeAll(async () => {
  const script = "../plugins/catvinci.pages/pages.js";
  await import(/* @vite-ignore */ script);
  p = (globalThis as unknown as { pages: typeof p }).pages;
});

const shape = (nodes: Node[]): unknown =>
  nodes.map((n) => (n.children.length ? { [n.name]: shape(n.children) } : n.name));

describe("pages", () => {
  it("puts a page's folder under the page, and a folder without one on its own", () => {
    const docs = [
      { rel: "Life.md", icon: "☀️" },
      { rel: "Life/2026 Calendar.md" },
      { rel: "Life/2026 Calendar/Week1.md" },
      { rel: "Life/2026 Calendar/Week2.md" },
      { rel: "Archive/Old.md" },
      { rel: "Inbox.md" },
    ];
    const tree = p.tree(docs);
    expect(shape(tree)).toEqual([
      "Inbox",
      { Life: [{ "2026 Calendar": ["Week1", "Week2"] }] },
      { Archive: ["Old"] },
    ]);
    const life = tree.find((n) => n.name === "Life")!;
    expect(life).toMatchObject({ rel: "Life.md", dir: "Life", icon: "☀️" });
    expect(tree.find((n) => n.name === "Archive")).toMatchObject({ rel: null, dir: "Archive" });
  });

  it("finds the pages above a sub-page, the outermost first", () => {
    const rels = ["Life.md", "Life/2026 Calendar.md", "Life/2026 Calendar/Week1.md"];
    expect(p.ancestors("Life/2026 Calendar/Week1.md", rels)).toEqual(["Life.md", "Life/2026 Calendar.md"]);
    expect(p.ancestors("Life.md", rels)).toEqual([]);
  });

  it("makes a sub-page beside its page, and links it by name unless the name is taken", () => {
    expect(p.subpage("Life/Plans.md", "Trip: Japan")).toBe("Life/Plans/Trip- Japan.md");
    expect(p.link("Life/Plans/Trip.md", ["Life/Plans/Trip.md"])).toBe("[[Trip]]");
    expect(p.link("Life/Plans/Trip.md", ["Life/Plans/Trip.md", "Work/Trip.md"])).toBe(
      "[[Life/Plans/Trip|Trip]]",
    );
  });
});
