// Pages: the open folder's documents as a tree of pages in the sidebar,
// sub-pages made in a folder beside their page and linked from it, page
// icons in front matter, and the pages above the one in front in the
// status bar.

/* global pages */
const t = (key, ...args) => textus.l10n.t(key, ...args);
const ICONS = ["📄", "📁", "📅", "🗓️", "✅", "📝", "📚", "💡", "🎯", "🚀", "⭐", "❤️", "🏠", "💼", "🎓", "🧪", "📊", "🔖"];

let root = null;
let docs = [];
let roots = [];
let list = null;
let crumb = null;

const join = (dir, rel) => dir.replace(/[\\/]+$/, "") + "/" + rel;
const relOf = (path) => {
  if (!root || !path) return null;
  const base = root.replace(/[\\/]+$/, "").replace(/\\/g, "/") + "/";
  const p = path.replace(/\\/g, "/");
  return p.startsWith(base) ? p.slice(base.length) : null;
};
const label = (node) => (node.icon ? node.icon + " " : "") + node.name;

/** The folder's documents again, and the tree, list and status bar from them. */
async function reload() {
  root = await textus.files.root();
  const all = root ? await textus.metadata.all() : [];
  docs = all
    .filter((d) => /\.md$/i.test(d.rel))
    .map((d) => ({ rel: d.rel, icon: d.frontmatter && d.frontmatter.icon }));
  roots = pages.tree(docs);
  if (list) list.refresh();
  await showCrumb();
}

function item(node) {
  const path = node.rel ? join(root, node.rel) : null;
  return {
    id: node.rel || "dir:" + node.dir,
    label: label(node),
    icon: node.rel ? "file" : "folder",
    location: path ? { path: path } : undefined,
    children: node.children.length > 0,
    data: node,
    actions: path
      ? [
          { label: t("newSubpage"), command: "catvinci.pages.newSubpage", args: [path] },
          { label: t("setIcon"), command: "catvinci.pages.setIcon", args: [path] },
        ]
      : [],
  };
}

/** "Life › 2026 Calendar › Week 1" for a sub-page; nothing for a page at
 *  the top. */
async function showCrumb() {
  const rel = relOf(await textus.editor.getPath());
  const above = rel ? pages.ancestors(rel, docs.map((d) => d.rel)) : [];
  if (!above.length) {
    if (crumb) crumb.dispose();
    crumb = null;
    return;
  }
  const icons = new Map(docs.map((d) => [d.rel, d.icon]));
  const text = above
    .concat([rel])
    .map((r) => label({ name: pages.nameOf(r), icon: icons.get(r) }))
    .join(" › ");
  if (crumb) crumb.update({ text: text });
  else
    crumb = textus.ui.statusItem("catvinci.pages.crumb", {
      text: text,
      tooltip: t("up"),
      command: "catvinci.pages.up",
    });
}

async function newSubpage(path) {
  root = await textus.files.root();
  if (!root) return textus.ui.message(t("needsFolder"));
  const active = await textus.editor.getPath();
  const parent = typeof path === "string" ? path : active;
  if (!parent) return textus.ui.message(t("needsSaved"));
  const parentRel = relOf(parent);
  if (!parentRel) return textus.ui.message(t("outside"));
  const title = await textus.ui.input({ prompt: t("subpageTitle") });
  if (!title || !title.trim()) return;
  const rel = pages.subpage(parentRel, title);
  const file = join(root, rel);
  if (await textus.files.stat(file)) return textus.ui.message(t("exists", title.trim()));
  await textus.files.createFolder(join(root, rel.slice(0, rel.lastIndexOf("/")))).catch(() => {});
  await textus.files.create(file, "# " + title.trim() + "\n");
  if (parent === active)
    await textus.editor.insertText(pages.link(rel, docs.map((d) => d.rel).concat([rel])));
  await textus.layout.open(file);
}

async function setIcon(path) {
  const file = typeof path === "string" ? path : await textus.editor.getPath();
  if (!file) return textus.ui.message(t("needsSaved"));
  const picked = await textus.ui.pick(
    ICONS.map((icon) => ({ label: icon, value: icon }))
      .concat([{ label: t("otherIcon"), value: "other" }, { label: t("removeIcon"), value: "none" }]),
    { placeholder: t("setIcon") },
  );
  if (!picked) return;
  const icon =
    picked === "other" ? ((await textus.ui.input({ prompt: t("iconPrompt") })) || "").trim() : picked;
  if (picked === "other" && !icon) return;
  await textus.files.frontmatter.update(file, (fm) => {
    if (picked === "none") delete fm.icon;
    else fm.icon = icon;
  });
}

async function up() {
  root = await textus.files.root();
  const rel = relOf(await textus.editor.getPath());
  if (!rel) return;
  const above = pages.ancestors(rel, docs.map((d) => d.rel));
  const picked = await textus.ui.pick(
    above.reverse().map((r) => ({ label: pages.nameOf(r), description: r, value: r })),
    { placeholder: t("up") },
  );
  if (picked) await textus.layout.open(join(root, picked));
}

exports.activate = function (ctx) {
  let pending = null;
  const later = () => {
    clearTimeout(pending);
    pending = setTimeout(() => void reload(), 300);
  };
  list = textus.views.registerList("catvinci.pages.tree", {
    items: (parent) => (parent ? parent.data.children : roots).map(item),
    emptyText: t("empty"),
    filterPlaceholder: t("filter"),
  });
  ctx.subscriptions.push(
    list,
    textus.commands.register("catvinci.pages.newSubpage", newSubpage),
    textus.commands.register("catvinci.pages.setIcon", setIcon),
    textus.commands.register("catvinci.pages.up", up),
    textus.files.onDidChangeRoot(later),
    textus.metadata.onDidChange(later),
    textus.files.onDidCreate(later),
    textus.files.onDidRename(later),
    textus.files.onDidDelete(later),
    textus.editor.onDidChangeActive(() => void showCrumb()),
    { dispose: () => crumb && crumb.dispose() },
  );
  void reload();
};
