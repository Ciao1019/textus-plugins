// A database block's page: the rows host.js sends, as a table (cells
// edited in place), a board (cards dragged between lists), a calendar or a
// gallery. Drawn with Textus's own controls (tx- classes) and menus
// (api.menu); filters, sorts, columns and types are kept in the block's
// lines. Every change goes back to the host, which writes the documents or
// the block; what a menu can't hold (a name, a value) the host asks for.
(function () {
  "use strict";
  const api = acquireTextusApi();
  const VIEWS = ["table", "board", "calendar", "gallery"];
  const VIEW_ICONS = { table: "table", board: "board", calendar: "calendar", gallery: "gallery" };
  const TYPES = ["text", "number", "select", "tags", "date", "checkbox", "url"];
  const TYPE_ICONS = { text: "text", number: "number", select: "select", tags: "multi", date: "date", checkbox: "checkbox", url: "url" };
  // The order tones are given in (design standard 3.4).
  const TONES = ["blue", "green", "orange", "purple", "red", "teal", "yellow", "pink", "gray"];
  let data = null;
  let month = null;
  /** A field being typed in: the view waits for it before drawing again. */
  let editing = false;
  let stale = false;

  const $ = (id) => document.getElementById(id);
  const post = (message) => api.postMessage(message);
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") node.className = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (v !== false && v !== null && v !== undefined) node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c);
    return node;
  }
  const s = (key) => (data && data.strings && data.strings[key]) || key;
  const icon = (name) => el("span", { class: "tx-icon", "data-icon": name });
  const typeOf = (key) => (key === "name" ? "text" : data.types[key] || "text");
  const label = (key) => (key === "name" ? s("page") : key);
  const allKeys = () => ["name"].concat(data.keys);
  /** What the block says, changed: filters, sorts, columns or types. */
  const setSpec = (change) => post({ type: "spec", spec: change });

  // ------------------------------------------------------------ values
  /** An option's tone: its place among its property's options. */
  function tone(word, key) {
    const options = (key && data.options[key]) || [];
    const i = options.indexOf(String(word));
    return TONES[(i >= 0 ? i : 0) % TONES.length];
  }
  const tag = (word, key, status) =>
    el("span", { class: "tx-tag" + (status ? " status" : ""), "data-tone": tone(word, key) }, String(word));
  /** A select that reads as a state - status, stage - gets the dot. */
  const isStatus = (key) => /^(status|state|stage|phase|进度|状态)$/i.test(key || "");

  function shown(value, type, key) {
    if (type === "checkbox")
      return el("input", { type: "checkbox", class: "ui-check", checked: value === true, tabindex: "-1", "aria-label": key });
    if (value === null || value === undefined || value === "") return "";
    if (Array.isArray(value)) return el("span", { class: "tags" }, value.map((v) => tag(v, key)));
    if (type === "select") return tag(value, key, isStatus(key));
    if (type === "number" && /^(rate|rating|stars?)$/i.test(key) && value >= 0 && value <= 5)
      return el("span", { class: "stars" }, "★".repeat(Math.round(value)) + "☆".repeat(5 - Math.round(value)));
    if (type === "url") return el("a", { href: value, target: "_blank", onclick: (e) => e.stopPropagation() }, String(value));
    return String(value);
  }

  const pageLink = (row) =>
    el("button", { type: "button", class: "page-link", onclick: () => post({ type: "open", rel: row.rel }) },
      (typeof row.props.icon === "string" ? row.props.icon + " " : "") + row.name);

  // ------------------------------------------------- filters and sorts
  const OPS = {
    text: ["has", "!has", "=", "!=", "empty", "!empty"],
    url: ["has", "!has", "empty", "!empty"],
    select: ["=", "!=", "empty", "!empty"],
    tags: ["has", "!has", "empty", "!empty"],
    number: ["=", "!=", ">", "<", "empty", "!empty"],
    date: ["=", ">", "<", "empty", "!empty"],
    checkbox: ["="],
  };
  const OP_NAMES = { "=": "is", "!=": "isNot", has: "contains", "!has": "notContains", empty: "isEmpty", "!empty": "notEmpty", ">": "greater", "<": "less", ">=": "greater", "<=": "less" };
  const opsFor = (key) => OPS[typeOf(key)] || OPS.text;
  const filterText = (f) =>
    label(f.key) + " " + s(OP_NAMES[f.op] || "is").toLowerCase() + (f.op === "empty" || f.op === "!empty" ? "" : " " + f.value);

  /** A filter on `key`, by menus: its operator, then its value - one of the
   *  options where there are some, else asked by the host. */
  async function filterOn(key, at, replace) {
    const op = await api.menu(opsFor(key).map((o) => ({ label: s(OP_NAMES[o]), value: o })), at);
    if (op === null) return;
    const type = typeOf(key);
    let value;
    if (op === "empty" || op === "!empty") value = "";
    else if (type === "checkbox") {
      value = await api.menu([{ label: "☑", value: "true" }, { label: "☐", value: "false" }], at);
      if (value === null) return;
    } else if ((type === "select" || type === "tags") && (data.options[key] || []).length) {
      value = await api.menu(data.options[key].map((o) => ({ label: o })), at);
      if (value === null) return;
    }
    post({ type: "addFilter", key, op, value, replace });
  }

  async function filterMenu(at) {
    const key = await api.menu(allKeys().map((k) => ({ label: label(k), value: k })), at);
    if (key !== null) filterOn(key, at);
  }

  async function sortMenu(at) {
    const sort = data.spec.sort;
    const items = allKeys().map((k) => {
      const now = sort.find((x) => x.key === k);
      return {
        label: label(k),
        items: [
          { label: s("ascending"), value: k + "\n+", checked: !!now && !now.desc },
          { label: s("descending"), value: k + "\n-", checked: !!now && now.desc },
        ],
      };
    });
    if (sort.length) items.push("separator", { label: s("clear"), value: "\nclear" });
    const choice = await api.menu(items, at);
    if (choice === null) return;
    if (choice === "\nclear") return setSpec({ sort: [] });
    const [key, dir] = String(choice).split("\n");
    setSpec({ sort: sort.filter((x) => x.key !== key).concat([{ key, desc: dir === "-" }]) });
  }

  /** The rules in force, under the bar: a chip each, its menu to change it. */
  function rules() {
    const chips = data.spec.filters.map((f, i) =>
      el("button", {
        type: "button",
        class: "tx-chip",
        onclick: async (e) => {
          const at = e.currentTarget;
          const choice = await api.menu([{ label: s("filter") + "…", value: "change" }, { label: s("remove"), value: "remove", danger: true }], at);
          if (choice === "remove") setSpec({ filters: data.spec.filters.filter((_, j) => j !== i) });
          if (choice === "change") filterOn(f.key, at, i);
        },
      }, filterText(f), icon("chevron")),
    );
    for (const x of data.spec.sort)
      chips.push(el("button", {
        type: "button",
        class: "tx-chip",
        onclick: async (e) => {
          const choice = await api.menu([
            { label: s("ascending"), value: "asc", checked: !x.desc },
            { label: s("descending"), value: "desc", checked: x.desc },
            "separator",
            { label: s("remove"), value: "remove", danger: true },
          ], e.currentTarget);
          if (choice === null) return;
          const rest = data.spec.sort.filter((y) => y.key !== x.key);
          setSpec({ sort: choice === "remove" ? rest : data.spec.sort.map((y) => (y.key === x.key ? { key: y.key, desc: choice === "desc" } : y)) });
        },
      }, icon("sort"), label(x.key), icon("chevron")));
    return chips;
  }

  // ------------------------------------------------------- table header
  async function columnMenu(th, key) {
    const items = [
      { label: s("ascending"), value: "asc" },
      { label: s("descending"), value: "desc" },
      { label: s("filter") + "…", value: "filter" },
    ];
    if (key !== "name")
      items.push(
        "separator",
        { label: s("type"), items: TYPES.map((k) => ({ label: s("type." + k), value: "type:" + k, checked: typeOf(key) === k })) },
        { label: s("rename") + "…", value: "rename" },
        { label: s("hide"), value: "hide" },
        "separator",
        { label: s("deleteProperty"), value: "delete", danger: true },
      );
    const choice = await api.menu(items, th);
    if (choice === null) return;
    if (choice === "asc" || choice === "desc") setSpec({ sort: [{ key, desc: choice === "desc" }] });
    else if (choice === "filter") filterOn(key, th);
    else if (choice === "rename") post({ type: "renameProp", from: key });
    else if (choice === "hide") setSpec({ columns: data.columns.filter((c) => c !== key) });
    else if (choice === "delete") post({ type: "deleteProp", key });
    else if (String(choice).startsWith("type:")) setSpec({ types: { ...data.spec.types, [key]: String(choice).slice(5) } });
  }

  /** The last column's +: a new property of a kind, or a hidden one back. */
  async function addColumnMenu(th) {
    const hidden = data.keys.filter((k) => !data.columns.includes(k));
    const items = [{ label: s("newProperty"), items: TYPES.map((k) => ({ label: s("type." + k), value: "new:" + k })) }];
    if (hidden.length)
      items.push("separator", ...hidden.map((k) => ({ label: k, value: "show:" + k })), { label: s("showAll"), value: "all" });
    const choice = await api.menu(items, th);
    if (choice === null) return;
    if (choice === "all") setSpec({ columns: null });
    else if (String(choice).startsWith("show:")) setSpec({ columns: data.columns.concat([String(choice).slice(5)]) });
    else post({ type: "addProp", kind: String(choice).slice(4), columns: data.columns });
  }

  // ------------------------------------------------------------- table
  function table() {
    const sorted = (key) => {
      const x = data.spec.sort.find((r) => r.key === key);
      return x ? icon(x.desc ? "chevron" : "sort") : null;
    };
    const th = (key) =>
      el("th", { tabindex: "0", onclick: (e) => columnMenu(e.currentTarget, key) }, icon(TYPE_ICONS[typeOf(key)]), label(key), sorted(key));
    const head = el("tr", null, th("name"), data.columns.map(th),
      el("th", { class: "plus", tabindex: "0", "aria-label": s("newProperty"), onclick: (e) => addColumnMenu(e.currentTarget) }, icon("plus")));
    const rows = data.rows.map((row) => el("tr", null, titleCell(row), data.columns.map((key) => cell(row, key)), el("td", { class: "plus" })));
    const add = el("tr", { class: "new-row" }, el("td", { colspan: String(data.columns.length + 2) }, newButton({})));
    return el("div", { class: "tx-table-frame" }, el("table", { class: "tx-table" }, el("thead", null, head), el("tbody", null, rows, add)));
  }

  /** A page's title: click to rename it, the arrow beside it to open it. */
  function titleCell(row) {
    const td = el("td", { class: "title" },
      el("span", { class: "name" }, (typeof row.props.icon === "string" ? row.props.icon + " " : "") + row.name),
      el("button", { type: "button", class: "tx-icon-button open", "aria-label": s("open"), onclick: (e) => { e.stopPropagation(); post({ type: "open", rel: row.rel }); } }, icon("open")));
    td.addEventListener("click", () => {
      if (!td.querySelector("input")) editInline(td, row.name, "text", (text) => post({ type: "renamePage", rel: row.rel, title: text }));
    });
    return td;
  }

  /** `td` as a field holding `value`; `commit(text)` on Enter or leaving. */
  function editInline(td, value, kind, commit) {
    const input = el("input", { type: kind, class: "cell-input", value: value === undefined || value === null ? "" : String(value) });
    let done = false;
    editing = true;
    const finish = (keep) => {
      if (done) return;
      done = true;
      editing = false;
      const changed = keep && input.value.trim() !== String(value ?? "");
      if (changed) commit(input.value.trim());
      if (!changed || stale) render();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish(true);
      if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
    td.replaceChildren(input);
    input.focus();
    if (kind === "text") input.select();
  }

  function cell(row, key) {
    const type = typeOf(key);
    const value = row.props[key];
    const td = el("td", { class: "cell cell-" + type, "data-key": key, tabindex: "0" }, shown(value, type, key));
    const set = (next) => post({ type: "set", rel: row.rel, key, value: next });
    if (type === "checkbox") td.addEventListener("click", () => set(value !== true));
    else if (type === "select" || type === "tags") td.addEventListener("click", () => optionsMenu(td, row, key));
    else
      td.addEventListener("click", () => {
        if (!td.querySelector("input"))
          editInline(td, value, type === "date" ? "date" : type === "number" ? "number" : "text", (text) =>
            set(type === "number" ? (text === "" ? null : Number(text)) : text));
      });
    return td;
  }

  /** A select's or multi-select's options, in Textus's menu: one picked,
   *  or toggled for a multi-select; a new one asked for by the host. */
  async function optionsMenu(td, row, key) {
    const multi = typeOf(key) === "tags";
    const value = row.props[key];
    const chosen = (Array.isArray(value) ? value : value ? [value] : []).map(String);
    const items = (data.options[key] || []).map((o) => ({ label: o, checked: chosen.includes(o) }));
    if (items.length) items.push("separator");
    items.push({ label: s("create") + "…", value: "\nnew" });
    if (chosen.length) items.push({ label: s("clear"), value: "\nclear" });
    const choice = await api.menu(items, td);
    if (choice === null) return;
    const set = (next) => post({ type: "set", rel: row.rel, key, value: next });
    if (choice === "\nnew") return post({ type: "newOption", rel: row.rel, key, multi, current: chosen });
    if (choice === "\nclear") return set(null);
    if (!multi) return set(choice === chosen[0] ? null : choice);
    set(chosen.includes(choice) ? chosen.filter((o) => o !== choice) : chosen.concat([choice]));
  }

  /** "+ New": a page named where it's made, with `props` already set. */
  function newButton(props) {
    const button = el("button", { type: "button", class: "tx-button small new" }, icon("plus"), s("add"));
    button.addEventListener("click", () => {
      const holder = el("div", { class: "new-title" });
      button.replaceWith(holder);
      editInline(holder, "", "text", (title) => post({ type: "add", folder: data.folder, props, title }));
      holder.querySelector("input").placeholder = s("untitled");
    });
    return button;
  }

  // ---------------------------------------------------------------- board
  function board() {
    const key = data.group;
    if (!key) return el("div", { class: "tx-empty" }, s("noGroup"));
    const byRel = new Map(data.rows.map((r) => [r.rel, r]));
    const lanes = data.groups.map((g) => {
      const lane = el("div", { class: "lane", "data-value": g.value },
        el("div", { class: "lane-head" },
          g.value ? tag(g.value, key, isStatus(key)) : el("span", { class: "tx-tag" }, s("noValue")),
          el("span", { class: "count" }, String(g.rels.length))),
        g.rels.map((rel) => card(byRel.get(rel), key, g.value)),
        newButton(groupProps(key, g.value)));
      lane.addEventListener("dragover", (e) => {
        e.preventDefault();
        lane.classList.add("drop");
      });
      lane.addEventListener("dragleave", () => lane.classList.remove("drop"));
      lane.addEventListener("drop", (e) => {
        e.preventDefault();
        lane.classList.remove("drop");
        const moved = JSON.parse(e.dataTransfer.getData("text/plain") || "{}");
        if (moved.rel && moved.from !== g.value) post({ type: "move", rel: moved.rel, key, from: moved.from, to: g.value });
      });
      return lane;
    });
    return el("div", { class: "board" }, lanes);
  }

  function groupProps(key, value) {
    if (!value) return {};
    return { [key]: data.types[key] === "tags" ? [value] : value };
  }

  function card(row, key, lane) {
    const others = data.columns.filter((c) => c !== key && row.props[c] !== undefined && row.props[c] !== "").slice(0, 3);
    const node = el("div", { class: "tx-card record", draggable: "true" },
      pageLink(row),
      others.map((c) => el("div", { class: "prop" }, shown(row.props[c], data.types[c], c))));
    node.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", JSON.stringify({ rel: row.rel, from: lane })));
    return node;
  }

  // ------------------------------------------------------------- calendar
  const day = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const parseDay = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? new Date(v.slice(0, 10) + "T00:00:00") : null);

  function calendar() {
    const key = data.date;
    if (!key) return el("div", { class: "tx-empty" }, s("noDate"));
    if (!month) {
      const first = data.rows.map((r) => parseDay(r.props[key])).find(Boolean);
      const now = new Date();
      const inMonth = data.rows.some((r) => {
        const d = parseDay(r.props[key]);
        return d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      });
      const base = inMonth || !first ? now : first;
      month = new Date(base.getFullYear(), base.getMonth(), 1);
    }
    const lang = s("locale");
    const shift = (n) => {
      month = new Date(month.getFullYear(), month.getMonth() + n, 1);
      render();
    };
    const nav = el("div", { class: "tx-bar month-bar" },
      el("strong", null, new Intl.DateTimeFormat(lang, { year: "numeric", month: "long" }).format(month)),
      el("span", { class: "tx-spacer" }),
      el("button", { type: "button", class: "tx-icon-button", "aria-label": s("prev"), onclick: () => shift(-1) }, icon("left")),
      el("button", { type: "button", class: "tx-button small", onclick: () => { month = null; render(); } }, s("today")),
      el("button", { type: "button", class: "tx-icon-button", "aria-label": s("next"), onclick: () => shift(1) }, icon("right")));
    // Monday first; six weeks always, so the block keeps its height.
    const start = new Date(month);
    start.setDate(1 - ((month.getDay() + 6) % 7));
    const names = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      names.push(el("div", { class: "weekday" }, new Intl.DateTimeFormat(lang, { weekday: "short" }).format(d)));
    }
    const on = new Map();
    for (const row of data.rows) {
      const from = parseDay(row.props[key]);
      if (!from) continue;
      const to = data.end ? parseDay(row.props[data.end]) : null;
      const last = to && to >= from && (to - from) / 864e5 <= 62 ? to : from;
      for (let d = new Date(from); d <= last; d.setDate(d.getDate() + 1)) {
        const k = day(d);
        if (!on.has(k)) on.set(k, []);
        on.get(k).push({ row, first: day(d) === day(from) });
      }
    }
    const today = day(new Date());
    const days = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const k = day(d);
      const weekend = i % 7 >= 5;
      const node = el("div", { class: "day" + (d.getMonth() !== month.getMonth() ? " other" : "") + (weekend ? " weekend" : "") + (k === today ? " today" : "") },
        el("span", { class: "num" }, String(d.getDate())),
        (on.get(k) || []).map((x) =>
          el("button", { type: "button", class: "chip" + (x.first ? "" : " cont"), title: x.row.name, onclick: () => post({ type: "open", rel: x.row.rel }) }, x.row.name)));
      node.addEventListener("dblclick", (e) => {
        if (e.target === node || e.target.classList.contains("num")) post({ type: "add", folder: data.folder, props: { [key]: k } });
      });
      days.push(node);
    }
    return el("div", null, nav, el("div", { class: "month" }, names, days));
  }

  // -------------------------------------------------------------- gallery
  function gallery() {
    return el("div", { class: "gallery" },
      data.rows.map((row) => {
        const cover = typeof row.props.cover === "string" && /^https?:\/\//.test(row.props.cover) ? row.props.cover : null;
        const glyph = typeof row.props.icon === "string" ? row.props.icon : null;
        return el("div", { class: "tx-card tile" },
          (cover || glyph) && el("div", { class: "cover", style: cover ? "background-image:url(" + JSON.stringify(cover) + ")" : null }, cover ? "" : glyph),
          el("div", { class: "text" }, pageLink(row),
            data.columns.filter((c) => c !== "cover" && row.props[c] !== undefined).slice(0, 3).map((c) => el("div", { class: "prop" }, shown(row.props[c], data.types[c], c)))));
      }));
  }

  // ---------------------------------------------------------------- frame
  function render() {
    stale = false;
    const body = $("body");
    if (!data) return;
    if (data.error) return body.replaceChildren(el("div", { class: "tx-empty problem" }, data.error));
    if (data.missing) return body.replaceChildren(el("div", { class: "tx-empty" }, s("missing")));
    const view = data.spec.view;
    $("views").replaceChildren(
      ...VIEWS.map((v) =>
        el("button", { type: "button", class: "tx-segment", role: "tab", "aria-selected": String(v === view), onclick: () => v !== view && post({ type: "view", view: v }) }, icon(VIEW_ICONS[v]), s(v))));
    $("filter").setAttribute("aria-label", s("filter"));
    $("sort").setAttribute("aria-label", s("sort"));
    $("count").textContent = s("count").replace("{0}", String(data.rows.length));
    $("add").replaceChildren(icon("plus"), s("add"));
    $("rules").replaceChildren(...rules());
    if (!data.rows.length && view !== "calendar" && view !== "table") return body.replaceChildren(el("div", { class: "tx-empty" }, s("empty")));
    body.replaceChildren(view === "board" ? board() : view === "calendar" ? calendar() : view === "gallery" ? gallery() : table());
  }

  $("add").addEventListener("click", () => {
    if (!data) return;
    const button = document.querySelector(".tx-table .new");
    if (button) button.click();
    else post({ type: "add", folder: data.folder, props: {} });
  });
  $("filter").addEventListener("click", (e) => data && filterMenu(e.currentTarget));
  $("sort").addEventListener("click", (e) => data && sortMenu(e.currentTarget));
  api.onMessage((m) => {
    if (!m || m.type !== "data") return;
    if (data && data.spec && m.data.spec && data.spec.view !== m.data.spec.view) month = null;
    data = m.data;
    if (editing) stale = true;
    else render();
  });
  post({ type: "ready" });
})();
