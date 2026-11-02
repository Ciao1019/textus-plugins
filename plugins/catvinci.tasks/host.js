// Tasks: every Markdown task in the open folder's documents - "- [ ] …" and
// "- [x] …" - in a list in the sidebar that Textus draws (views.registerList):
// the ones due soon first, then by document, each under the heading it
// sits beneath. What Textus knows of the folder (textus.metadata) says
// where they are; ticking one changes that one line of its file - in its
// tab if it is open - after checking the line still says what was listed.

const TASK = /^(\s*(?:[-*+]|\d+[.)])\s+\[)( |x|X)(\]\s+)(.*)$/;
// A due date written after a task, as Obsidian's Tasks writes it
// ("📅 2026-10-30") or plainly ("due:2026-10-30").
const DUE = /\s*(?:📅|due::?)\s*(\d{4}-\d{2}-\d{2})/u;
/** How far ahead "Due soon" looks. */
const SOON_DAYS = 7;

const t = (key, ...args) => textus.l10n.t(key, ...args);

/** The local date `offset` days from today, as YYYY-MM-DD. */
function day(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const two = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate());
}

/** "3 open tasks", in the language's plural form ("open.few"…). */
function count(key, n) {
  const form = key + "." + new Intl.PluralRules(textus.env.language).select(n);
  const text = t(form, n);
  return text === form ? t(key + ".other", n) : text;
}

/** The heading a line sits beneath, from the document's headings. */
function headingAt(headings, line) {
  let found = null;
  for (const h of headings) {
    if (h.line > line) break;
    found = h.text;
  }
  return found;
}

/** A task as the list shows it. */
function itemOf(doc, task, group) {
  const today = day(0);
  return {
    // Listed twice - due soon, and in its document - under two ids.
    id: group + ":" + doc.path + ":" + task.line,
    label: task.text.replace(DUE, "").trim(),
    description: headingAt(doc.headings, task.line) || undefined,
    detail: group === "soon" ? doc.rel : undefined,
    group: group === "soon" ? t("dueSoon") : doc.rel,
    checkbox: task.done,
    badge: task.due
      ? {
          text: task.due,
          tone: task.done
            ? "muted"
            : task.due < today
              ? "danger"
              : task.due <= day(SOON_DAYS)
                ? "warning"
                : "muted",
        }
      : undefined,
    location: { path: doc.path, line: task.line, text: task.text },
    data: { path: doc.path, line: task.line, text: task.text },
  };
}

async function items() {
  if (!(await textus.files.root())) {
    list.setMessage(t("nofolder"));
    return [];
  }
  const showDone = await textus.settings.get("showDone");
  const docs = await textus.metadata.all();
  const soonUntil = day(SOON_DAYS);
  const soon = [];
  const rest = [];
  let open = 0;
  for (const doc of docs)
    for (const task of doc.tasks) {
      if (!task.done) open++;
      if (task.done && !showDone) continue;
      if (!task.done && task.due && task.due <= soonUntil)
        soon.push(itemOf(doc, task, "soon"));
      rest.push(itemOf(doc, task, "doc"));
    }
  soon.sort((a, b) => (a.badge.text < b.badge.text ? -1 : 1));
  list.setMessage(count("open", open));
  return soon.concat(rest);
}

/** Ticks or unticks the task on `line` of `path`, if it is still there. */
async function setDone(task, done) {
  await textus.files.process(task.path, function (text) {
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const lines = text.split(/\r?\n/);
    const m = TASK.exec(lines[task.line] || "");
    // The file changed since it was listed: nothing is written; the list
    // is drawn again from what is there now.
    if (!m || m[4].trim() !== task.text.trim()) return text;
    lines[task.line] = m[1] + (done ? "x" : " ") + m[3] + m[4];
    return lines.join(eol);
  });
}

let list = null;

exports.activate = function (ctx) {
  list = textus.views.registerList("catvinci.tasks.panel", {
    items: items,
    onCheck: function (item, checked) {
      return setDone(item.data, checked).finally(() => list.refresh());
    },
    filterPlaceholder: t("filter"),
    emptyText: t("none"),
  });
  const refresh = () => list.refresh();
  ctx.subscriptions.push(
    list,
    textus.metadata.onDidChange(refresh),
    textus.files.onDidChangeRoot(refresh),
    textus.settings.onDidChange(refresh),
    // Its count and dates in the interface's language.
    textus.env.onDidChangeLanguage(refresh),
  );
};
