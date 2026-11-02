(function () {
  "use strict";
  const api = acquireTextusApi();
  const t = api.t;
  const $ = (id) => document.getElementById(id);
  // The icon buttons' names, in the UI's language.
  for (const [id, key] of [["refresh", "refresh"]])
    for (const attr of ["aria-label", "title"])
      $(id).setAttribute(attr, api.t(key));
  $("title").textContent = t("title");
  $("refresh").onclick = () => api.postMessage({ type: "refresh" });
  let opened = null;
  let data = { path: null, current: null, versions: [] };

  const when = (at) =>
    new Date(at).toLocaleString(api.language, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  function diffNode(version) {
    const box = document.createElement("div");
    box.className = "diff";
    const lines = window.lineDiff(version.text, data.current || "");
    if (!lines) {
      box.textContent = t("large");
      return box;
    }
    if (!lines.some((l) => l.kind !== "same")) {
      box.textContent = t("same");
      return box;
    }
    // Changed lines with two of context around them.
    const keep = new Set();
    lines.forEach((l, i) => {
      if (l.kind !== "same") for (let k = i - 2; k <= i + 2; k++) keep.add(k);
    });
    let skipped = false;
    lines.forEach((l, i) => {
      if (!keep.has(i)) {
        if (!skipped) {
          const gap = document.createElement("div");
          gap.className = "gap";
          gap.textContent = "⋯";
          box.append(gap);
        }
        skipped = true;
        return;
      }
      skipped = false;
      const row = document.createElement("div");
      row.className = l.kind;
      row.textContent =
        (l.kind === "added" ? "+ " : l.kind === "removed" ? "− " : "  ") +
        l.line;
      box.append(row);
    });
    return box;
  }

  // Versions grouped by day: Today, Yesterday, then the date.
  const dayOf = (at) => new Date(at).toDateString();
  function dayLabel(at) {
    const day = new Date(at);
    const today = new Date();
    const yesterday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - 1,
    );
    const words = new Intl.RelativeTimeFormat(api.language, {
      numeric: "auto",
    });
    if (day.toDateString() === today.toDateString())
      return words.format(0, "day");
    if (day.toDateString() === yesterday.toDateString())
      return words.format(-1, "day");
    return day.toLocaleDateString(api.language, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  function render() {
    const list = $("versions");
    list.textContent = "";
    let lastDay = null;
    $("empty").hidden = !!(data.path && data.versions.length);
    $("empty").textContent = data.path ? t("none") : t("nodoc");
    data.versions.forEach((version, index) => {
      if (dayOf(version.at) !== lastDay) {
        lastDay = dayOf(version.at);
        const day = document.createElement("li");
        day.className = "day-head";
        const label = dayLabel(version.at);
        day.textContent =
          label.charAt(0).toLocaleUpperCase(api.language) + label.slice(1);
        list.append(day);
      }
      const li = document.createElement("li");
      const head = document.createElement("div");
      head.className = "row-head";
      const stamp = document.createElement("span");
      stamp.className = "when";
      stamp.textContent = when(version.at);
      const older = data.versions[index + 1];
      const delta = document.createElement("span");
      delta.className = "delta";
      const change = version.text.length - (older ? older.text.length : 0);
      delta.innerHTML = "";
      const sign = document.createElement("span");
      sign.className = change >= 0 ? "plus" : "minus";
      sign.textContent = (change >= 0 ? "+" : "−") + Math.abs(change);
      delta.append(sign);
      head.append(stamp, delta);
      li.append(head);
      if (opened === version.at) {
        li.classList.add("open");
        const label = document.createElement("div");
        label.className = "muted";
        label.textContent = t("since");
        const actions = document.createElement("div");
        actions.className = "actions";
        const restore = document.createElement("button");
        restore.className = "tx-button small primary";
        restore.textContent = t("restore");
        restore.onclick = (e) => {
          e.stopPropagation();
          api.postMessage({ type: "restore", at: version.at });
        };
        const open = document.createElement("button");
        open.className = "tx-button small";
        open.textContent = t("open");
        open.onclick = (e) => {
          e.stopPropagation();
          api.postMessage({ type: "open", at: version.at });
        };
        actions.append(open, restore);
        li.append(label, diffNode(version), actions);
      }
      li.onclick = () => {
        opened = opened === version.at ? null : version.at;
        render();
      };
      list.append(li);
    });
  }

  api.onMessage((message) => {
    if (message.type !== "versions") return;
    if (message.path !== data.path) opened = null;
    data = message;
    render();
  });
  api.postMessage({ type: "ready" });
})();
