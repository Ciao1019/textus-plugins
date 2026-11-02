// Reminders: the folder's `(@2026-11-02 09:00)` marks become system
// notifications that Textus keeps and shows on time - with a window open,
// or with none in background mode. A click opens the line.

/* global reminders */
const t = (key, ...args) => textus.l10n.t(key, ...args);
const LIMIT = 30;

let list = null;
let soon = [];

/** Every document's reminders read again, and the next ones scheduled;
 *  those no longer in a document are cleared. */
async function sync() {
  const root = await textus.files.root();
  if (!root) return;
  const all = [];
  for (const doc of await textus.files.find("**/*.md")) {
    const text = await textus.files.readText(doc.path).catch(() => "");
    if (!text.includes("(@")) continue;
    for (const r of reminders.find(text)) all.push(Object.assign({ path: doc.path, rel: doc.rel }, r));
  }
  soon = reminders.upcoming(all, new Date(), LIMIT);
  const keep = new Set(soon.map((r) => reminders.jobId(r.rel, r)));
  for (const job of await textus.schedule.list()) if (!keep.has(job.id)) await textus.schedule.clear(job.id);
  for (const r of soon)
    await textus.schedule.set(reminders.jobId(r.rel, r), {
      at: r.when,
      catchUp: "once",
      notify: { title: r.text || t("name"), body: r.rel, open: { path: r.path, line: r.line } },
    });
  if (list) list.refresh();
}

/** A mark at the caret, for a time picked from a few or typed. */
async function remind() {
  const now = new Date();
  const at = (days, hour, minute) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, hour, minute || 0);
    return d;
  };
  const inHour = new Date(now.getTime() + 3600000);
  const choices = [
    { label: t("inHour"), value: inHour },
    { label: t("tonight"), value: at(0, 20) },
    { label: t("tomorrow"), value: at(1, 9) },
    { label: t("nextWeek"), value: at(7 - ((now.getDay() + 6) % 7), 9) },
    { label: t("pickTime"), value: "pick" },
  ].filter((c) => c.value === "pick" || c.value > now);
  const picked = await textus.ui.pick(
    choices.map((c, i) => ({ label: c.label, description: c.value === "pick" ? "" : reminders.mark(c.value).slice(2, -1), value: i })),
    { placeholder: t("when") },
  );
  if (picked === null || picked === undefined) return;
  let when = choices[picked].value;
  if (when === "pick") {
    const typed = await textus.ui.input({ prompt: t("typeTime"), value: reminders.mark(at(1, 9)).slice(2, -1) });
    const m = typed && /^(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(typed.trim());
    if (!m) return typed && textus.ui.message(t("badTime"));
    when = new Date(m[1] + "T" + (m[2] || "09").padStart(2, "0") + ":" + (m[3] || "00") + ":00");
  }
  await textus.editor.insertText(" " + reminders.mark(when));
}

exports.activate = function (ctx) {
  let pending = null;
  const later = () => {
    clearTimeout(pending);
    pending = setTimeout(() => void sync(), 800);
  };
  list = textus.views.registerList("catvinci.reminders.list", {
    items: () =>
      soon.map((r) => ({
        id: reminders.jobId(r.rel, r),
        label: r.text || r.rel,
        description: r.when.replace("T", " "),
        detail: r.rel,
        icon: "clock",
        location: { path: r.path, line: r.line },
      })),
    emptyText: t("none"),
  });
  ctx.subscriptions.push(
    list,
    textus.commands.register("catvinci.reminders.remind", remind),
    textus.files.onDidChangeRoot(later),
    textus.files.onDidSave(later),
    textus.files.onDidChange(later),
    textus.files.onDidCreate(later),
    textus.files.onDidDelete(later),
    textus.files.onDidRename(later),
  );
  void sync();
};
