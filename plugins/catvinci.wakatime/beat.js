// When WakaTime hears about writing, and what it is told - the rules of the
// official editor plugins (vscode-wakatime): a heartbeat when the writing
// moves to another file, at most one per two minutes on the same file and
// kind of work, and always on a save. Only the user's own work in a Textus
// window in front counts: time in the background, files changed on disk or
// by a plugin are not working time.

(function (root) {
  const EVERY_MS = 2 * 60 * 1000;

  /** The kind of work a change is, or null when it isn't the user's:
   *  "writing docs" for typing (an undo too), "ai coding" for Textus AI's
   *  writing while the user works with it. */
  function category(source, state) {
    if (state !== "active") return null;
    if (source === "disk" || source === "plugin") return null;
    return source === "ai" ? "ai coding" : "writing docs";
  }

  /** Whether a heartbeat is due, given the last one sent: { entity, at,
   *  category } or null. */
  function due(last, entity, now, isWrite, kind) {
    if (isWrite) return true;
    if (!last || last.entity !== entity || last.category !== kind) return true;
    return now - last.at >= EVERY_MS;
  }

  /** The heartbeat WakaTime's API takes. */
  function heartbeat(entity, now, isWrite, more) {
    const beat = {
      entity: entity,
      type: "file",
      category: (more && more.category) || "writing docs",
      time: now / 1000,
      is_write: !!isWrite,
      language: "Markdown",
    };
    if (more && more.project) beat.project = more.project;
    if (more && more.branch) beat.branch = more.branch;
    if (more && typeof more.lines === "number") beat.lines = more.lines;
    return beat;
  }

  /** The project: a `.wakatime-project` file's first line, else the open
   *  folder's name. */
  function project(folder, projectFile) {
    const named = projectFile && projectFile.split("\n")[0].trim();
    if (named) return named;
    if (!folder) return null;
    const parts = folder.replace(/[\\/]+$/, "").split(/[\\/]/);
    return parts[parts.length - 1] || null;
  }

  /** The branch a `.git/HEAD` names; null for a detached head. */
  function branch(head) {
    const m = /^ref:\s*refs\/heads\/(.+)$/m.exec(head || "");
    return m ? m[1].trim() : null;
  }

  /** Whether `key` looks like a WakaTime API key. */
  const validKey = (key) => /^(waka_)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(key).trim());

  root.wakaBeat = { EVERY_MS, category, due, heartbeat, project, branch, validKey };
})(typeof window !== "undefined" ? window : globalThis);
