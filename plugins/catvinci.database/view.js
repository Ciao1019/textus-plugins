// A database block's page: the rows host.js sends, as a table (cells
// edited in place), a board (cards dragged between lists), a calendar or a
// gallery. Filters, sorts, columns and types are set from menus as in
// Notion and kept in the block's lines; every change goes back to the host,
// which writes the documents or the block.
(function () {
  "use strict";
  const api = acquireTextusApi();
  const VIEWS = ["table", "board", "calendar", "gallery"];
  const TYPES = ["text", "number", "select", "tags", "date", "checkbox", "url"];
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
  const typeOf = (key) => (key === "name" ? "text" : data.types[key] || "text");
  const label = (key) => (key === "name" ? s("page") : key);
  /** What the block says, changed: filters, sorts, columns or types. */
  const setSpec = (change) => post({ type: "spec", spec: change });

  // ------------------------------------------------------------ values
  /** An option's colour, one of nine as in Notion: a property's options
   *  take them in turn, so neighbours differ; a word elsewhere by its letters. */
  const COLOURS = [210, 140, 30, 265, 0, 45, 320, 180, 25];
  function hue(word, key) {
    const i = key && data && data.options[key] ? data.options[key].indexOf(String(word)) : -1;
    if (i >= 0) return COLOURS[i % COLOURS.length];
    let h = 0;
    for (const c of String(word)) h = (h * 31 + c.codePointAt(0)) >>> 0;
    return COLOURS[h % COLOURS.length];
  }
  const tag = (word, key) => el("span", { class: "tag", style: "--tag-hue:" + hue(word, key) }, String(word));

  function shown(value, type, key) {
    if (type === "checkbox") return el("span", { class: "check" + (value === true ? " on" : "") });
    if (value === null || value === undefined || value === "") return "";
    if (Array.isArray(value)) return value.map((v) => tag(v, key));
    if (type === "select") return tag(value, key);
    if (type === "number" && /^(rate|rating|stars?)$/i.test(key) && value >= 0 && value <= 5)
      return el("span", { class: "stars" }, "★".repeat(Math.round(value)) + "☆".repeat(5 - Math.round(value)));
    if (type === "url") return el("a", { href: value, target: "_blank", onclick: (e) => e.stopPropagation() }, String(value));
    return String(value);
  }

  function pageLink(row) {
    const icon = typeof row.props.icon === "string" ? row.props.icon + " " : "";
    return el("button", { type: "button", class: "page-link", onclick: () => post({ type: "open", rel: row.rel }) }, icon + row.name);
  }

  // ------------------------------------------------------------ popovers
  let pop = null;
  function close() {
    if (pop) pop.remove();
    pop = null;
    document.body.style.minHeight = "";
  }
  /** A menu under `anchor`, built by `fill(box)`; one at a time. A `kept`
   *  one stays open while the view redraws under it, holding its own state. */
  function popover(anchor, fill, wide, kept) {
    close();
    const box = el("div", { class: "pop" + (wide ? " wide" : ""), role: "dialog" });
    if (kept) box.dataset.kept = "1";
    const r = anchor.getBoundingClientRect();
    box.style.left = Math.max(4, Math.min(r.left + window.scrollX, document.documentElement.clientWidth - (wide ? 420 : 240))) + "px";
    box.style.top = r.bottom + window.scrollY + 4 + "px";
    document.body.append(box);
    pop = box;
    fill(box);
    // The block is as tall as its page: the page grows to hold the menu.
    const stretch = () => {
      if (pop === box) document.body.style.minHeight = box.offsetTop + box.offsetHeight + 8 + "px";
    };
    new ResizeObserver(stretch).observe(box);
    const first = box.querySelector("input, select, button");
    if (first) first.focus();
    return box;
  }
  document.addEventListener("mousedown", (e) => {
    if (pop && !pop.contains(e.target)) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && pop) {
      close();
      e.stopPropagation();
    }
  });
  const item = (text, run, cls) => el("button", { type: "button", class: "item" + (cls ? " " + cls : ""), onclick: run }, text);
  const sep = () => el("div", { class: "sep" });
  function select(values, current, change, names) {
    const node = el("select", { onchange: (e) => change(e.target.value) }, values.map((v, i) => el("option", { value: v, selected: v === current }, names ? names[i] : v)));
    return node;
  }

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
  const allKeys = () => ["name"].concat(data.keys);

  function filterText(f) {
    const v = f.op === "empty" || f.op === "!empty" ? "" : " " + (f.value || "…");
    return label(f.key) + " " + s(OP_NAMES[f.op] || "is").toLowerCase() + v;
  }

  /** A filter's value: the choices of a select, a date, yes or no, or text. */
  function valueField(f, change) {
    const type = typeOf(f.key);
    if (f.op === "empty" || f.op === "!empty") return null;
    if (type === "checkbox") return select(["true", "false"], f.value || "true", change, ["☑", "☐"]);
    if ((type === "select" || type === "tags") && (data.options[f.key] || []).length)
      return select([""].concat(data.options[f.key]), f.value, change, [s("value")].concat(data.options[f.key]));
    const input = el("input", { type: type === "date" ? "date" : type === "number" ? "number" : "text", value: f.value || "", placeholder: s("value") });
    input.addEventListener("change", () => change(input.value));
    input.addEventListener("keydown", (e) => e.key === "Enter" && change(input.value));
    return input;
  }

  /** A filter applies once it says something: a value, or "is empty". */
  const complete = (f) => f.key && (f.op === "empty" || f.op === "!empty" || String(f.value || "") !== "");

  function filtersMenu(anchor, adding) {
    const filters = data.spec.filters.map((f) => ({ ...f }));
    if (adding) filters.push({ key: adding, op: opsFor(adding)[0], value: "" });
    popover(
      anchor,
      (box) => {
        const save = () => setSpec({ filters: filters.filter(complete) });
        const draw = () => {
          box.replaceChildren(
            ...filters.map((f, i) =>
              el(
                "div",
                { class: "rule" },
                select(allKeys(), f.key, (k) => {
                  f.key = k;
                  f.op = opsFor(k)[0];
                  f.value = "";
                  draw();
                  save();
                }, allKeys().map(label)),
                select(opsFor(f.key), f.op, (op) => {
                  f.op = op;
                  draw();
                  save();
                }, opsFor(f.key).map((op) => s(OP_NAMES[op]))),
                valueField(f, (v) => {
                  f.value = v;
                  save();
                }),
                el("button", { type: "button", class: "x", "aria-label": s("remove"), onclick: () => { filters.splice(i, 1); draw(); save(); } }, "×"),
              ),
            ),
            item("+ " + s("addFilter"), () => {
              const key = data.keys[0] || "name";
              filters.push({ key, op: opsFor(key)[0], value: "" });
              draw();
            }),
          );
        };
        draw();
      },
      true,
      true,
    );
  }

  function sortsMenu(anchor) {
    const sorts = data.spec.sort.map((x) => ({ ...x }));
    popover(
      anchor,
      (box) => {
        const save = () => setSpec({ sort: sorts });
        const draw = () => {
          const unused = allKeys().filter((k) => !sorts.some((x) => x.key === k));
          box.replaceChildren(
            ...[...sorts.map((x, i) =>
              el(
                "div",
                { class: "rule" },
                select(allKeys(), x.key, (k) => { x.key = k; save(); }, allKeys().map(label)),
                select(["asc", "desc"], x.desc ? "desc" : "asc", (d) => { x.desc = d === "desc"; save(); }, [s("ascending"), s("descending")]),
                el("button", { type: "button", class: "x", "aria-label": s("remove"), onclick: () => { sorts.splice(i, 1); draw(); save(); } }, "×"),
              ),
            ),
            unused.length ? item("+ " + s("addSort"), () => { sorts.push({ key: unused[0], desc: false }); draw(); save(); }) : null,
            ].filter(Boolean),
          );
        };
        draw();
      },
      true,
      true,
    );
  }

  /** The rules in force, under the bar: click one to change it. */
  function rules() {
    const chips = [];
    for (const f of data.spec.filters) chips.push(el("button", { type: "button", class: "rule-chip", onclick: (e) => filtersMenu(e.currentTarget) }, filterText(f)));
    for (const x of data.spec.sort)
      chips.push(el("button", { type: "button", class: "rule-chip", onclick: (e) => sortsMenu(e.currentTarget) }, (x.desc ? "↓ " : "↑ ") + label(x.key)));
    return chips;
  }

  // ------------------------------------------------------- table header
  /** A column's menu: sort, filter, its type, its name, hide or delete. */
  function columnMenu(th, key) {
    popover(th, (box) => {
      box.append(
        item("↑ " + s("ascending"), () => { close(); setSpec({ sort: [{ key, desc: false }] }); }),
        item("↓ " + s("descending"), () => { close(); setSpec({ sort: [{ key, desc: true }] }); }),
        item(s("filter"), () => filtersMenu($("filter"), key)),
      );
      if (key === "name") return;
      const name = el("input", { type: "text", value: key, "aria-label": s("rename") });
      name.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          close();
          post({ type: "renameProp", from: key, to: name.value });
        }
      });
      box.append(sep(), el("div", { class: "field" }, name), el("div", { class: "head" }, s("type")));
      for (const kind of TYPES)
        box.append(
          item(s("type." + kind), () => {
            close();
            setSpec({ types: { ...data.spec.types, [key]: kind } });
          }, typeOf(key) === kind ? "on" : ""),
        );
      box.append(
        sep(),
        item(s("hide"), () => {
          close();
          setSpec({ columns: data.columns.filter((c) => c !== key) });
        }),
        item(s("deleteProperty"), () => {
          close();
          post({ type: "deleteProp", key });
        }, "danger"),
      );
    });
  }

  /** The last column's +: a new property, or a hidden one back. */
  function addColumnMenu(th) {
    popover(th, (box) => {
      const name = el("input", { type: "text", placeholder: s("propertyName") });
      let kind = "text";
      const add = () => {
        const key = name.value.trim();
        if (!key) return;
        close();
        setSpec({
          columns: data.columns.includes(key) ? data.columns : data.columns.concat([key]),
          types: kind === "text" ? data.spec.types : { ...data.spec.types, [key]: kind },
        });
      };
      name.addEventListener("keydown", (e) => e.key === "Enter" && add());
      box.append(el("div", { class: "field" }, name), el("div", { class: "head" }, s("type")));
      const kinds = TYPES.map((k) => item(s("type." + k), (e) => {
        kind = k;
        kinds.forEach((b) => b.classList.toggle("on", b === e.currentTarget));
        add();
      }, k === kind ? "on" : ""));
      box.append(...kinds);
      const hidden = data.keys.filter((k) => !data.columns.includes(k));
      if (hidden.length) {
        box.append(sep(), el("div", { class: "head" }, s("hide")));
        for (const k of hidden) box.append(item("+ " + k, () => { close(); setSpec({ columns: data.columns.concat([k]) }); }));
        box.append(item(s("showAll"), () => { close(); setSpec({ columns: null }); }));
      }
    });
  }

  // ------------------------------------------------------------- table
  function table() {
    const sorted = (key) => {
      const x = data.spec.sort.find((r) => r.key === key);
      return x ? (x.desc ? " ↓" : " ↑") : "";
    };
    const th = (key) => el("th", { tabindex: "0", onclick: (e) => columnMenu(e.currentTarget, key) }, el("span", { class: "kind kind-" + typeOf(key) }), label(key) + sorted(key));
    const head = el(
      "tr",
      null,
      th("name"),
      data.columns.map(th),
      el("th", { class: "plus", tabindex: "0", "aria-label": s("newProperty"), onclick: (e) => addColumnMenu(e.currentTarget) }, "+"),
    );
    const rows = data.rows.map((row) => el("tr", null, titleCell(row), data.columns.map((key) => cell(row, key)), el("td", { class: "plus" })));
    const span = data.columns.length + 2;
    const add = el("tr", { class: "new-row" }, el("td", { colspan: String(span) }, newButton({})));
    return el("div", { class: "table-wrap" }, el("table", null, el("thead", null, head), el("tbody", null, rows, add)));
  }

  /** A page's title: click to rename it, Open beside it to go there. */
  function titleCell(row) {
    const icon = typeof row.props.icon === "string" ? row.props.icon + " " : "";
    const td = el("td", { class: "title" }, el("span", { class: "name" }, icon + row.name), el("button", { type: "button", class: "open", onclick: (e) => { e.stopPropagation(); post({ type: "open", rel: row.rel }); } }, "↗"));
    td.addEventListener("click", () => {
      if (td.querySelector("input")) return;
      editInline(td, row.name, "text", (text) => post({ type: "renamePage", rel: row.rel, title: text }));
    });
    return td;
  }

  /** `td` as a field holding `value`; `commit(text)` on Enter or leaving. */
  function editInline(td, value, kind, commit) {
    const input = el("input", { type: kind, value: value === undefined || value === null ? "" : String(value) });
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
    if (type === "checkbox") {
      td.addEventListener("click", () => set(value !== true));
      return td;
    }
    if (type === "select" || type === "tags") {
      td.addEventListener("click", () => optionsMenu(td, key, value, set));
      return td;
    }
    td.addEventListener("click", () => {
      if (td.querySelector("input")) return;
      editInline(td, value, type === "date" ? "date" : type === "number" ? "number" : "text", (text) =>
        set(type === "number" ? (text === "" ? null : Number(text)) : text),
      );
    });
    return td;
  }

  /** A select's or multi-select's choices, searched, with one to make. */
  function optionsMenu(td, key, value, set) {
    const multi = typeOf(key) === "tags";
    const chosen = (Array.isArray(value) ? value : value ? [value] : []).map(String);
    popover(td, (box) => {
      const find = el("input", { type: "text", placeholder: s("search") });
      if (multi) box.dataset.kept = "1";
      const list = el("div", { class: "options" });
      const pick = (option) => {
        if (!multi) {
          close();
          return set(option === chosen[0] ? null : option);
        }
        const next = chosen.includes(option) ? chosen.filter((o) => o !== option) : chosen.concat([option]);
        chosen.splice(0, chosen.length, ...next);
        set(next);
        draw();
      };
      const draw = () => {
        const q = find.value.trim();
        const all = data.options[key] || [];
        const matching = all.filter((o) => o.toLowerCase().includes(q.toLowerCase()));
        list.replaceChildren(
          ...[...matching.map((o) => el("button", { type: "button", class: "item" + (chosen.includes(o) ? " on" : ""), onclick: () => pick(o) }, tag(o, key))),
          q && !all.includes(q) ? el("button", { type: "button", class: "item", onclick: () => { (data.options[key] = all.concat([q])); find.value = ""; pick(q); } }, s("create") + " ", tag(q, key)) : null,
          chosen.length ? el("button", { type: "button", class: "item muted", onclick: () => { close(); set(null); } }, s("clear")) : null,
        ].filter(Boolean),
        );
      };
      find.addEventListener("input", draw);
      find.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        const first = list.querySelector("button");
        if (first) first.click();
      });
      box.append(el("div", { class: "field" }, find), list);
      draw();
    });
  }

  /** "+ New": a row named where it's made, with `props` already set. */
  function newButton(props) {
    const button = el("button", { type: "button", class: "new" }, "+ " + s("add"));
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
    if (!key) return el("div", { class: "empty" }, s("noGroup"));
    const byRel = new Map(data.rows.map((r) => [r.rel, r]));
    const lanes = data.groups.map((g) => {
      const lane = el(
        "div",
        { class: "lane", "data-value": g.value },
        el("div", { class: "lane-head" }, g.value ? tag(g.value, key) : el("span", { class: "prop" }, s("noValue")), el("span", { class: "prop" }, String(g.rels.length))),
        g.rels.map((rel) => card(byRel.get(rel), key, g.value)),
        newButton(groupProps(key, g.value)),
      );
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
    const others = data.columns.filter((c) => c !== key && row.props[c] !== undefined).slice(0, 3);
    const node = el(
      "div",
      { class: "card", draggable: "true" },
      pageLink(row),
      others.map((c) => el("div", { class: "prop" }, shown(row.props[c], data.types[c], c))),
    );
    node.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", JSON.stringify({ rel: row.rel, from: lane })));
    return node;
  }

  // ------------------------------------------------------------- calendar
  const day = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const parseDay = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? new Date(v.slice(0, 10) + "T00:00:00") : null);

  function calendar() {
    const key = data.date;
    if (!key) return el("div", { class: "empty" }, s("noDate"));
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
    const title = new Intl.DateTimeFormat(lang, { year: "numeric", month: "long" }).format(month);
    const shift = (n) => {
      month = new Date(month.getFullYear(), month.getMonth() + n, 1);
      render();
    };
    const nav = el(
      "div",
      { class: "nav" },
      el("strong", null, title),
      el("button", { type: "button", "aria-label": s("prev"), onclick: () => shift(-1) }, "‹"),
      el("button", { type: "button", onclick: () => { month = null; render(); } }, s("today")),
      el("button", { type: "button", "aria-label": s("next"), onclick: () => shift(1) }, "›"),
    );
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
      const cls = "day" + (d.getMonth() !== month.getMonth() ? " other" : "") + (k === today ? " today" : "");
      const node = el(
        "div",
        { class: cls },
        el("span", { class: "num" }, String(d.getDate())),
        (on.get(k) || []).map((x) =>
          el("button", { type: "button", class: "chip" + (x.first ? "" : " cont"), title: x.row.name, onclick: () => post({ type: "open", rel: x.row.rel }) }, x.row.name),
        ),
      );
      node.addEventListener("dblclick", (e) => {
        if (e.target === node || e.target.classList.contains("num")) post({ type: "add", folder: data.folder, props: { [key]: k } });
      });
      days.push(node);
    }
    return el("div", null, nav, el("div", { class: "month" }, names, days));
  }

  // -------------------------------------------------------------- gallery
  function gallery() {
    return el(
      "div",
      { class: "gallery" },
      data.rows.map((row) => {
        const cover = typeof row.props.cover === "string" && /^https?:\/\//.test(row.props.cover) ? row.props.cover : null;
        const icon = typeof row.props.icon === "string" ? row.props.icon : null;
        return el(
          "div",
          { class: "tile" },
          (cover || icon) &&
            el("div", { class: "cover", style: cover ? "background-image:url(" + JSON.stringify(cover) + ")" : null }, cover ? "" : icon),
          el(
            "div",
            { class: "text" },
            pageLink(row),
            data.columns.filter((c) => c !== "cover" && row.props[c] !== undefined).slice(0, 3).map((c) => el("div", { class: "prop" }, shown(row.props[c], data.types[c], c))),
          ),
        );
      }),
    );
  }

  // ---------------------------------------------------------------- frame
  function render() {
    stale = false;
    if (!pop || !pop.dataset.kept) close();
    const body = $("body");
    if (!data) return;
    if (data.error) return body.replaceChildren(el("div", { class: "problem" }, data.error));
    if (data.missing) return body.replaceChildren(el("div", { class: "empty" }, s("missing")));
    const view = data.spec.view;
    $("views").replaceChildren(
      ...VIEWS.map((v) =>
        el("button", { type: "button", role: "tab", "aria-selected": String(v === view), onclick: () => v !== view && post({ type: "view", view: v }) }, s(v)),
      ),
    );
    $("filter").textContent = s("filter");
    $("filter").classList.toggle("on", data.spec.filters.length > 0);
    $("sort").textContent = s("sort");
    $("sort").classList.toggle("on", data.spec.sort.length > 0);
    $("count").textContent = s("count").replace("{0}", String(data.rows.length));
    $("add").textContent = "+ " + s("add");
    $("rules").replaceChildren(...rules());
    if (!data.rows.length && view !== "calendar" && view !== "table") return body.replaceChildren(el("div", { class: "empty" }, s("empty")));
    body.replaceChildren(view === "board" ? board() : view === "calendar" ? calendar() : view === "gallery" ? gallery() : table());
  }

  $("add").addEventListener("click", () => {
    if (!data) return;
    const button = document.querySelector(".table-wrap .new");
    if (button) button.click();
    else post({ type: "add", folder: data.folder, props: {} });
  });
  $("filter").addEventListener("click", (e) => {
    if (!data) return;
    filtersMenu(e.currentTarget, data.spec.filters.length ? null : data.keys[0] || "name");
  });
  $("sort").addEventListener("click", (e) => data && sortsMenu(e.currentTarget));
  api.onMessage((m) => {
    if (!m || m.type !== "data") return;
    if (data && data.spec && m.data.spec && data.spec.view !== m.data.spec.view) month = null;
    data = m.data;
    if (editing) stale = true;
    else render();
  });
  post({ type: "ready" });
})();
