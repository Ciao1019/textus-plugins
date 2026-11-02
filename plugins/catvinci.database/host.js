// Database: ```database blocks drawn as a table, a board, a calendar or a
// gallery of the documents in a folder, their front matter the columns.
// Edits in the view are written to those documents' front matter; New
// makes one. Also: a Notion export's CSV as such a folder, and a tool for
// Textus AI to make one.

/* global database */
const t = (key, ...args) => textus.l10n.t(key, ...args);
const STRINGS = [
  "table", "board", "calendar", "gallery", "page", "add", "count", "empty",
  "noValue", "noGroup", "noDate", "today", "prev", "next", "missing", "locale",
  "filter", "sort", "addFilter", "addSort", "ascending", "descending", "remove",
  "is", "isNot", "contains", "notContains", "isEmpty", "notEmpty", "greater", "less",
  "value", "search", "create", "clear", "untitled", "newProperty", "propertyName",
  "type", "rename", "hide", "deleteProperty", "showAll", "open",
  "type.text", "type.number", "type.select", "type.tags", "type.date", "type.checkbox", "type.url",
];

let root = null;
/** The blocks on screen, each sending itself again. */
const live = new Set();

const join = (dir, rel) => (rel ? dir.replace(/[\\/]+$/, "") + "/" + rel : dir);
const relOf = (path) => {
  if (!root || !path) return null;
  const base = root.replace(/[\\/]+$/, "").replace(/\\/g, "/") + "/";
  const p = path.replace(/\\/g, "/");
  return p.startsWith(base) ? p.slice(base.length) : null;
};
const fileName = (title) => title.trim().replace(/[\\/:*?"<>|#^[\]]/g, "-");

/** Front matter values as the page can show them: dates as their day. */
function plain(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(plain);
  return value;
}

/** What the block's page draws. */
async function snapshot(block) {
  root = await textus.files.root();
  const spec = database.parseSpec(block.source);
  if (!root) return { spec, missing: true, strings: strings() };
  const folder = database.folderOf(spec.from, relOf(block.path));
  const all = await textus.metadata.all();
  const rows = database.rowsOf(all, folder).map((r) => ({
    rel: r.rel,
    name: r.name,
    props: Object.fromEntries(Object.entries(r.props).map(([k, v]) => [k, plain(v)])),
  }));
  const types = database.typesOf(rows, spec.types);
  const shown = database.viewRows(rows, spec);
  const keys = [...new Set([...Object.keys(types), ...(spec.columns || [])])].filter((k) => k !== "icon" && k !== "cover");
  const options = {};
  for (const k of keys) if (types[k] === "select" || types[k] === "tags") options[k] = database.options(rows, k);
  const group = database.groupKey(spec, rows, types);
  return {
    spec,
    folder,
    rows: shown,
    columns: database.columnsOf(spec, rows),
    keys,
    types,
    options,
    group,
    groups: database.groups(shown, group).map((g) => ({ value: g.value, rels: g.rows.map((r) => r.rel) })),
    date: database.dateKey(spec, types),
    end: spec.end || Object.keys(types).find((k) => types[k] === "date" && /end|until|due/i.test(k)) || null,
    strings: strings(),
  };
}

function strings() {
  return Object.fromEntries(STRINGS.map((k) => [k, t(k)]));
}

/** A new document in the view's folder, its front matter `props`; its
 *  title typed in the view, or asked for. */
async function addRow(folder, props, typed) {
  const title = typed || (await textus.ui.input({ prompt: t("newTitle") }));
  if (!title || !title.trim()) return;
  const file = join(root, (folder ? folder + "/" : "") + fileName(title) + ".md");
  if (await textus.files.stat(file)) return textus.ui.message(t("exists", title.trim()));
  if (folder) await textus.files.createFolder(join(root, folder)).catch(() => {});
  await textus.files.create(file, "# " + title.trim() + "\n");
  if (props && Object.keys(props).length)
    await textus.files.frontmatter.update(file, (fm) => Object.assign(fm, props));
}

async function setProp(rel, key, value) {
  await textus.files.frontmatter.update(join(root, rel), (fm) => {
    if (value === null || value === "" || (Array.isArray(value) && !value.length)) delete fm[key];
    else fm[key] = value;
  });
}

/** The documents of the block's folder, every one, filters aside. */
async function pagesOf(block) {
  const spec = database.parseSpec(block.source);
  const folder = database.folderOf(spec.from, relOf(block.path));
  return { spec, rows: database.rowsOf(await textus.metadata.all(), folder) };
}

/** Property `from` called `to` in every page, in the same place. */
async function renameProp(block, from, to) {
  if (to === undefined) to = (await textus.ui.input({ prompt: t("rename"), value: from })) || "";
  to = to.trim();
  if (!to || to === from) return;
  const { spec, rows } = await pagesOf(block);
  for (const row of rows)
    if (from in row.props)
      await textus.files.frontmatter.update(join(root, row.rel), (fm) =>
        Object.fromEntries(Object.entries(fm).map(([k, v]) => [k === from ? to : k, v])),
      );
  await block.setSource(database.writeSpec(database.renameKey(spec, from, to)));
}

async function deleteProp(block, key) {
  const { spec, rows } = await pagesOf(block);
  const using = rows.filter((r) => key in r.props);
  if (using.length && !(await textus.ui.confirm(t("deleteAsk", key, using.length), { okLabel: t("deleteProperty"), danger: true }))) return;
  for (const row of using)
    await textus.files.frontmatter.update(join(root, row.rel), (fm) => {
      delete fm[key];
      return fm;
    });
  await block.setSource(database.writeSpec(database.dropKey(spec, key)));
}

/** A page renamed in the view: its file, the links to it, and its title. */
async function renamePage(rel, title) {
  title = title.trim();
  const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/") + 1) : "";
  const old = rel.slice(dir.length).replace(/\.md$/i, "");
  if (!title || title === old) return;
  const to = join(root, dir + fileName(title) + ".md");
  if (await textus.files.stat(to)) return textus.ui.message(t("exists", title));
  await textus.files.rename(join(root, rel), to, { updateLinks: true });
  await textus.files.process(to, (text) => text.replace(/^(---\n[\s\S]*?\n---\n+)?# .*$/m, (line, fm) => (fm || "") + "# " + title));
}

function render(block, webview, context) {
  return context.plugin.readText("view.html").then((html) => {
    webview.html = html;
    let sent = 0;
    const send = async () => {
      const mine = ++sent;
      const data = await snapshot(block).catch((err) => ({ error: String((err && err.message) || err) }));
      if (mine === sent) webview.postMessage({ type: "data", data });
    };
    live.add(send);
    webview.onDidDispose(() => live.delete(send));
    block.onDidChange(send);
    webview.onDidReceiveMessage(async (m) => {
      if (!m) return;
      if (m.type === "ready") return send();
      if (m.type === "open") return textus.layout.open(join(root, m.rel));
      if (m.type === "set") return setProp(m.rel, m.key, m.value);
      if (m.type === "add") return addRow(m.folder, m.props, m.title);
      if (m.type === "view") {
        const spec = database.parseSpec(block.source);
        spec.view = m.view;
        return block.setSource(database.writeSpec(spec));
      }
      // Filters, sorts, columns and types, as the view's menus set them.
      if (m.type === "spec") return block.setSource(database.writeSpec({ ...database.parseSpec(block.source), ...m.spec }));
      if (m.type === "renameProp") return renameProp(block, m.from, m.to);
      if (m.type === "deleteProp") return deleteProp(block, m.key);
      if (m.type === "renamePage") return renamePage(m.rel, m.title);
      // What a menu can't hold - a name, a value - asked in Textus's own field.
      if (m.type === "addProp") {
        const name = ((await textus.ui.input({ prompt: t("propertyName") })) || "").trim();
        if (!name) return;
        const spec = database.parseSpec(block.source);
        const columns = m.columns.includes(name) ? m.columns : m.columns.concat([name]);
        const types = m.kind === "text" ? spec.types : { ...spec.types, [name]: m.kind };
        return block.setSource(database.writeSpec({ ...spec, columns, types }));
      }
      if (m.type === "addFilter") {
        const value = m.value !== undefined ? m.value : await textus.ui.input({ prompt: t("value") });
        if (value === null || value === undefined) return;
        const spec = database.parseSpec(block.source);
        spec.filters = spec.filters.filter((f, i) => i !== m.replace);
        spec.filters.push({ key: m.key, op: m.op, value: String(value).trim() });
        return block.setSource(database.writeSpec(spec));
      }
      if (m.type === "newOption") {
        const value = ((await textus.ui.input({ prompt: t("create") })) || "").trim();
        if (!value) return;
        return setProp(m.rel, m.key, m.multi ? (m.current || []).concat([value]) : value);
      }
      if (m.type === "move") {
        const fm = await textus.files.frontmatter.get(join(root, m.rel));
        return setProp(m.rel, m.key, database.regroup(fm[m.key], m.from, m.to));
      }
    });
  });
}

/** A database block at the caret, its folder beside the document. */
async function newDatabase() {
  root = await textus.files.root();
  const doc = await textus.editor.getPath();
  if (!root || !doc || !relOf(doc)) return textus.ui.message(t("needsSaved"));
  const name = await textus.ui.input({ prompt: t("dbName") });
  if (!name || !name.trim()) return;
  const docRel = relOf(doc);
  const dir = docRel.includes("/") ? docRel.slice(0, docRel.lastIndexOf("/")) : "";
  await textus.files.createFolder(join(root, (dir ? dir + "/" : "") + fileName(name))).catch(() => {});
  await textus.editor.insertText("```database\nfrom: " + fileName(name) + "\nview: table\n```\n");
}

/** A Notion export's database (its CSV, with its pages in the folder of
 *  the same name) as documents with front matter, and a page showing them. */
async function importNotion(path) {
  root = await textus.files.root();
  const csv = typeof path === "string" ? path : null;
  if (!root || !csv || !relOf(csv)) return textus.ui.message(t("importPick"));
  const rel = relOf(csv);
  const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
  const exportName = rel.slice(dir.length ? dir.length + 1 : 0).replace(/\.csv$/i, "").replace(/_all$/, "");
  const name = database.withoutId(exportName);
  const rows = database.fromNotionCsv(await textus.files.readText(csv));
  const folder = (dir ? dir + "/" : "") + fileName(name);
  await textus.files.createFolder(join(root, folder)).catch(() => {});
  const pages = await textus.files.list(join(root, (dir ? dir + "/" : "") + exportName)).catch(() => []);
  let made = 0;
  await textus.ui.withProgress(t("importing", name), async (report) => {
    for (const [i, row] of rows.entries()) {
      report({ fraction: i / rows.length, message: row.name });
      const file = join(root, folder + "/" + fileName(row.name) + ".md");
      if (await textus.files.stat(file)) continue;
      const page = pages.find((p) => /\.md$/i.test(p.name) && database.withoutId(p.name.replace(/\.md$/i, "")) === row.name);
      const body = page ? notionBody(await textus.files.readText(page.path)) : "";
      await textus.files.create(file, "# " + row.name + "\n" + (body ? "\n" + body + "\n" : ""));
      await textus.files.frontmatter.update(file, (fm) => Object.assign(fm, row.props));
      made++;
    }
  });
  const index = join(root, folder + ".md");
  if (!(await textus.files.stat(index)))
    await textus.files.create(index, "# " + name + "\n\n```database\nfrom: " + fileName(name) + "\nview: table\n```\n");
  await textus.layout.open(index);
  textus.ui.notice(t("imported", made, name));
}

/** A Notion page's text without its title and the property lines under it,
 *  which are in the front matter now. */
function notionBody(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  if (/^# /.test(lines[i] || "")) i++;
  while (i < lines.length && lines[i].trim() === "") i++;
  while (i < lines.length && /^[^:\n]{1,60}: .+$/.test(lines[i])) i++;
  return lines.slice(i).join("\n").trim();
}

/** Textus AI's tool: a folder of documents with these properties, and the
 *  block to show them, for the AI to put where the user wants it. */
async function createDatabase(input) {
  root = await textus.files.root();
  if (!root) return { error: t("needsFolder") };
  const doc = await textus.editor.getPath();
  const docRel = relOf(doc);
  const dir = docRel && docRel.includes("/") ? docRel.slice(0, docRel.lastIndexOf("/")) : "";
  const name = fileName(String(input.name || "Database"));
  const folder = (dir ? dir + "/" : "") + name;
  await textus.files.createFolder(join(root, folder)).catch(() => {});
  let made = 0;
  for (const row of Array.isArray(input.rows) ? input.rows.slice(0, 400) : []) {
    const title = fileName(String(row.name || ""));
    if (!title) continue;
    const file = join(root, folder + "/" + title + ".md");
    if (await textus.files.stat(file)) continue;
    await textus.files.create(file, "# " + String(row.name).trim() + "\n" + (row.body ? "\n" + row.body + "\n" : ""));
    if (row.properties && typeof row.properties === "object")
      await textus.files.frontmatter.update(file, (fm) => Object.assign(fm, row.properties));
    made++;
  }
  const view = database.VIEWS.includes(input.view) ? input.view : "table";
  const lines = ["from: " + name, "view: " + view];
  if (input.sort) lines.push("sort: " + input.sort);
  if (input.group) lines.push("group: " + input.group);
  return {
    folder: folder,
    documents: made,
    block: "```database\n" + lines.join("\n") + "\n```",
    note: t("aiNote"),
  };
}

exports.activate = function (ctx) {
  let pending = null;
  const again = () => {
    clearTimeout(pending);
    pending = setTimeout(() => live.forEach((send) => send()), 150);
  };
  ctx.subscriptions.push(
    textus.views.registerCodeBlock("database", { render: (b, w) => render(b, w, ctx) }),
    textus.commands.register("catvinci.database.new", newDatabase),
    textus.commands.register("catvinci.database.importNotion", importNotion),
    textus.ai.registerTool("create_database", createDatabase),
    // A page edited here, or anywhere: every block on screen again.
    textus.files.onDidChangeRoot(again),
    textus.metadata.onDidChange(again),
    textus.files.onDidChange(again),
    textus.files.onDidCreate(again),
    textus.files.onDidDelete(again),
    textus.files.onDidRename(again),
  );
};
