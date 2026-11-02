// Reminders: `(@2026-11-02 09:00)` in a line is a reminder of that line
// then, as Obsidian's Reminder plugin writes them; `(@2026-11-02)` is at
// nine that morning. Pure, for the host and the tests.

(function (root) {
  const MARK = /\(@(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2}))?\)/;
  const DONE = /^\s*[-*+]\s+\[[xX]\]/;

  /** The reminders in a document's text: `{ line, when, text }`, `when`
   *  "YYYY-MM-DDTHH:MM" in local time, `text` the line without its mark
   *  and list or task markers. A ticked task's reminder is done. */
  function find(source) {
    const out = [];
    String(source)
      .split("\n")
      .forEach((line, i) => {
        const m = MARK.exec(line);
        if (!m || DONE.test(line)) return;
        const hour = m[2] === undefined ? "09" : m[2].padStart(2, "0");
        const minute = m[3] === undefined ? "00" : m[3];
        out.push({
          line: i + 1,
          when: m[1] + "T" + hour + ":" + minute,
          text: line
            .replace(MARK, "")
            .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[ \]\s+)?/, "")
            .replace(/^#+\s+/, "")
            .trim(),
        });
      });
    return out;
  }

  /** The next `limit` reminders after `now` (Date), soonest first. */
  function upcoming(reminders, now, limit) {
    const stamp = (r) => new Date(r.when + ":00").getTime();
    return reminders
      .filter((r) => stamp(r) > now.getTime())
      .sort((a, b) => stamp(a) - stamp(b))
      .slice(0, limit);
  }

  /** A job id for a reminder: the same reminder keeps its id. */
  function jobId(rel, r) {
    let h = 0;
    for (const c of rel + "|" + r.when + "|" + r.text) h = (h * 31 + c.codePointAt(0)) >>> 0;
    return "r" + h.toString(36);
  }

  /** The mark for a moment: `(@2026-11-02 09:00)`. */
  function mark(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return "(@" + date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes()) + ")";
  }

  root.reminders = { find, upcoming, jobId, mark };
})(typeof window !== "undefined" ? window : globalThis);
