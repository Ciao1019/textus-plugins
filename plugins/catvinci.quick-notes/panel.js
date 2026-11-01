(function () {
  "use strict";
  const api = acquireTextusApi();
  const t = api.t;
  const $ = (id) => document.getElementById(id);
  $("title").textContent = t("title");
  $("new").setAttribute("aria-label", t("new"));
  $("empty").textContent = t("empty");
  $("filter").placeholder = t("search");
  $("filter").setAttribute("aria-label", t("search"));
  $("undo-text").textContent = t("deleted");
  $("undo").textContent = t("undo");
  // The search shows once there are enough notes to look through.
  const SEARCH_FROM = 6;
  let all = [];
  $("filter").addEventListener("input", () => render(all));
  // A deleted note can be had back for a few seconds.
  let undoTimer = 0;
  function offerUndo() {
    $("undo-bar").hidden = false;
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => ($("undo-bar").hidden = true), 6000);
  }
  $("undo").onclick = () => {
    clearTimeout(undoTimer);
    $("undo-bar").hidden = true;
    api.postMessage({ type: "undo" });
  };
  const timers = new Map();
  // An edit still waiting out its pause goes first, so a button pressed
  // right after typing acts on every word typed.
  function flush() {
    for (const [id, timer] of timers) {
      clearTimeout(timer);
      const area = document.querySelector('textarea[data-id="' + id + '"]');
      if (area) api.postMessage({ type: "edit", id: id, text: area.value });
    }
    timers.clear();
  }
  $("new").onclick = () => {
    flush();
    api.postMessage({ type: "new" });
  };
  const when = (at) =>
    new Date(at).toLocaleString(api.language, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  /** A note's actions, in Textus's own menu: from its more button or a
   *  right-click on it. */
  async function actions(id, at) {
    const type = await api.menu(
      [
        { label: t("insert"), value: "insert" },
        { label: t("open"), value: "open" },
        "separator",
        { label: t("delete"), value: "delete", danger: true },
      ],
      at,
    );
    if (type === null) return;
    flush();
    api.postMessage({ type: type, id: id });
    if (type === "delete") offerUndo();
  }

  function render(notes) {
    all = notes;
    $("filter").hidden = notes.length < SEARCH_FROM;
    const words = $("filter").hidden
      ? []
      : $("filter").value.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length)
      notes = notes.filter((n) =>
        words.every((w) => n.text.toLowerCase().includes(w)),
      );
    const list = $("notes");
    // A note being typed in keeps its box, caret and all.
    const typing = document.activeElement && document.activeElement.dataset.id;
    $("empty").hidden = all.length > 0;
    const keep = new Set(notes.map((n) => n.id));
    for (const li of [...list.children])
      if (!keep.has(li.dataset.id)) li.remove();
    notes.forEach((note, i) => {
      let li = list.querySelector('li[data-id="' + note.id + '"]');
      if (!li) {
        li = document.createElement("li");
        li.className = "tx-card";
        li.dataset.id = note.id;
        li.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          actions(note.id, { x: e.clientX, y: e.clientY });
        });
        const area = document.createElement("textarea");
        area.dataset.id = note.id;
        area.placeholder = t("placeholder");
        // Left empty, a new note goes: nothing was noted.
        area.addEventListener("blur", () => {
          if (!area.value.trim())
            setTimeout(() => {
              if (document.activeElement !== area && !area.value.trim())
                api.postMessage({ type: "drop", id: note.id });
            }, 150);
        });
        area.addEventListener("input", () => {
          clearTimeout(timers.get(note.id));
          timers.set(
            note.id,
            setTimeout(() => {
              timers.delete(note.id);
              api.postMessage({ type: "edit", id: note.id, text: area.value });
            }, 300),
          );
        });
        const foot = document.createElement("div");
        foot.className = "note-foot";
        const stamp = document.createElement("span");
        stamp.className = "when";
        const more = document.createElement("button");
        more.type = "button";
        more.className = "tx-icon-button";
        more.setAttribute("aria-label", t("actions"));
        const glyph = document.createElement("span");
        glyph.className = "tx-icon";
        glyph.dataset.icon = "more";
        more.append(glyph);
        more.onclick = (e) => actions(note.id, e.currentTarget);
        foot.append(stamp, more);
        li.append(area, foot);
      }
      const area = li.querySelector("textarea");
      if (typing !== note.id) area.value = note.text;
      li.querySelector(".when").textContent = when(note.at);
      if (list.children[i] !== li)
        list.insertBefore(li, list.children[i] || null);
    });
  }

  api.onMessage((message) => {
    if (message.type === "notes") render(message.notes);
    if (message.type === "focus") {
      const area = document.querySelector(
        'textarea[data-id="' + message.id + '"]',
      );
      if (area) area.focus();
    }
  });
  api.postMessage({ type: "ready" });
})();
