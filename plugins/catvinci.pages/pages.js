// Pages: how documents nest. A page is a Markdown file; its sub-pages are
// the documents in the folder beside it that has its name (Plans.md and
// Plans/), as Notion and Obsidian's folder notes have it. Paths here are
// `/`-separated and relative to the open folder.

(function (root) {
  const stem = (rel) => rel.replace(/\.md$/i, "");
  const dirOf = (rel) => (rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "");
  const nameOf = (rel) => stem(rel).slice(stem(rel).lastIndexOf("/") + 1);

  /**
   * The folder's pages as a tree: `{ name, rel, dir, icon, children }`.
   * A page (`rel`) takes the folder named as it (`dir`) as its children;
   * a folder no page names is a node of its own (`rel` null). Pages come
   * before folders, each by name.
   */
  function tree(docs) {
    const pages = new Map(docs.map((d) => [d.rel, d]));
    const nodes = new Map();
    const node = (dir) => {
      if (!nodes.has(dir))
        nodes.set(dir, { name: nameOf(dir), rel: null, dir: dir, icon: null, children: [] });
      return nodes.get(dir);
    };
    const top = { children: [] };
    const parentOf = (dir) => {
      if (dir === "") return top;
      return node(dir);
    };
    // Every folder holding a document, and the folders above it.
    for (const d of docs) {
      let dir = dirOf(d.rel);
      while (dir !== "") {
        const parent = dirOf(dir);
        const n = node(dir);
        const up = parentOf(parent);
        if (!up.children.includes(n)) up.children.push(n);
        dir = parent;
      }
    }
    for (const d of docs) {
      const own = nodes.get(stem(d.rel));
      const n = own || { name: nameOf(d.rel), dir: null, children: [] };
      n.rel = d.rel;
      n.icon = typeof d.icon === "string" && d.icon ? d.icon : null;
      if (own) n.dir = stem(d.rel);
      const up = parentOf(dirOf(d.rel));
      if (!up.children.includes(n)) up.children.push(n);
    }
    // A folder named as a page sits under that page, not beside it.
    const settle = (n) => {
      n.children = n.children.filter((c) => !(c.rel === null && pages.has(c.dir + ".md")));
      n.children.sort(
        (a, b) => (a.rel ? 0 : 1) - (b.rel ? 0 : 1) || a.name.localeCompare(b.name),
      );
      n.children.forEach(settle);
    };
    settle(top);
    return top.children;
  }

  /** The pages above `rel`, the outermost first: each page whose folder
   *  holds it. */
  function ancestors(rel, rels) {
    const have = new Set(rels);
    const out = [];
    let dir = dirOf(rel);
    while (dir !== "") {
      if (have.has(dir + ".md")) out.unshift(dir + ".md");
      dir = dirOf(dir);
    }
    return out;
  }

  /** A title as a file name: no characters a file system refuses. */
  const fileName = (title) => title.trim().replace(/[\\/:*?"<>|#^[\]]/g, "-");

  /** Where a sub-page of `parent` called `title` goes. */
  function subpage(parent, title) {
    return stem(parent) + "/" + fileName(title) + ".md";
  }

  /** A wiki link to `rel`: its name alone when no other document has it,
   *  else its path. */
  function link(rel, rels) {
    const name = nameOf(rel);
    const same = rels.filter((r) => nameOf(r).toLowerCase() === name.toLowerCase());
    return same.length > 1 ? "[[" + stem(rel) + "|" + name + "]]" : "[[" + name + "]]";
  }

  root.pages = { tree, ancestors, subpage, link, nameOf, fileName };
})(typeof window !== "undefined" ? window : globalThis);
