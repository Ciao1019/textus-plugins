// Database: the documents of a folder as rows, their front matter as
// properties. What a ```database block asks for, the rows it gets, and a
// Notion export's CSV as documents. Pure functions, shared by the host and
// the tests; paths are `/`-separated and relative to the open folder.

(function (root) {
  const VIEWS = ["table", "board", "calendar", "gallery"];
  /** A property's kinds, as Notion has them; "tags" is a multi-select. */
  const TYPES = ["text", "number", "select", "tags", "date", "checkbox", "url"];
  const DATE = /^\d{4}-\d{2}-\d{2}/;

  /** A block's lines, `key: value` each: from, view, columns, sort, group,
   *  date and end (a calendar's), types (a property's kind, when it isn't
   *  the one its values suggest) and any number of filter lines. */
  function parseSpec(source) {
    const spec = { from: null, view: "table", columns: null, sort: [], filters: [], group: null, date: null, end: null, types: {} };
    for (const raw of String(source).split("\n")) {
      const line = raw.replace(/\s+#.*$/, "").trim();
      const m = /^([A-Za-z]+)\s*:\s*(.*)$/.exec(line);
      if (!m) continue;
      const key = m[1].toLowerCase();
      const value = m[2].trim();
      if (key === "from") spec.from = value.replace(/^["']|["']$/g, "");
      else if (key === "view" && VIEWS.includes(value.toLowerCase())) spec.view = value.toLowerCase();
      else if (key === "columns") spec.columns = splitList(value);
      else if (key === "sort")
        spec.sort = splitList(value).map((s) =>
          s.startsWith("-") ? { key: s.slice(1), desc: true } : { key: s, desc: false },
        );
      else if (key === "group") spec.group = value || null;
      else if (key === "date") spec.date = value || null;
      else if (key === "end") spec.end = value || null;
      else if (key === "types")
        for (const pair of splitList(value)) {
          const [k, kind] = pair.split("=").map((x) => x.trim());
          if (k && TYPES.includes(kind)) spec.types[k] = kind;
        }
      else if (key === "filter") {
        const f = /^(\S+)\s*(!=|>=|<=|=|>|<|!has|has|!empty|empty)\s*(.*)$/.exec(value);
        if (f) spec.filters.push({ key: f[1], op: f[2], value: f[3].trim() });
      }
    }
    return spec;
  }

  /** `spec` written back as a block's source. */
  function writeSpec(spec) {
    const lines = [];
    if (spec.from) lines.push("from: " + spec.from);
    lines.push("view: " + spec.view);
    if (spec.columns) lines.push("columns: " + spec.columns.join(", "));
    if (spec.sort.length) lines.push("sort: " + spec.sort.map((s) => (s.desc ? "-" : "") + s.key).join(", "));
    for (const f of spec.filters) lines.push(("filter: " + f.key + " " + f.op + " " + (f.value || "")).trimEnd());
    if (spec.group) lines.push("group: " + spec.group);
    if (spec.date) lines.push("date: " + spec.date);
    if (spec.end) lines.push("end: " + spec.end);
    const types = Object.entries(spec.types || {});
    if (types.length) lines.push("types: " + types.map(([k, kind]) => k + "=" + kind).join(", "));
    return lines.join("\n");
  }

  /** `spec` with property `from` called `to` wherever it names it. */
  function renameKey(spec, from, to) {
    const name = (k) => (k === from ? to : k);
    const types = {};
    for (const [k, kind] of Object.entries(spec.types || {})) types[name(k)] = kind;
    return {
      ...spec,
      columns: spec.columns && spec.columns.map(name),
      sort: spec.sort.map((s) => ({ ...s, key: name(s.key) })),
      filters: spec.filters.map((f) => ({ ...f, key: name(f.key) })),
      group: spec.group && name(spec.group),
      date: spec.date && name(spec.date),
      end: spec.end && name(spec.end),
      types,
    };
  }

  /** `spec` without property `key` anywhere. */
  function dropKey(spec, key) {
    const types = { ...(spec.types || {}) };
    delete types[key];
    const keep = (k) => k !== key;
    return {
      ...spec,
      columns: spec.columns && spec.columns.filter(keep),
      sort: spec.sort.filter((s) => keep(s.key)),
      filters: spec.filters.filter((f) => keep(f.key)),
      group: spec.group === key ? null : spec.group,
      date: spec.date === key ? null : spec.date,
      end: spec.end === key ? null : spec.end,
      types,
    };
  }

  function splitList(value) {
    return value
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const dirOf = (rel) => (rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "");
  const stem = (rel) => rel.replace(/\.md$/i, "");

  /** The folder a block in `docRel` means by `from`: from the document's
   *  folder, from the open folder's top when it starts with "/", and the
   *  document's own sub-page folder when there is none. */
  function folderOf(from, docRel) {
    if (!from) return docRel ? stem(docRel) : "";
    if (from.startsWith("/")) return from.replace(/^\/+|\/+$/g, "");
    const base = docRel ? dirOf(docRel) : "";
    const parts = (base ? base.split("/") : []).concat(from.replace(/\/+$/, "").split("/"));
    const out = [];
    for (const p of parts) {
      if (p === "..") out.pop();
      else if (p && p !== ".") out.push(p);
    }
    return out.join("/");
  }

  /** The rows: the documents right in `folder`, each `{ rel, name, props }`. */
  function rowsOf(docs, folder) {
    return docs
      .filter((d) => /\.md$/i.test(d.rel) && dirOf(d.rel) === folder)
      .map((d) => ({
        rel: d.rel,
        name: stem(d.rel).slice(stem(d.rel).lastIndexOf("/") + 1),
        props: d.frontmatter && typeof d.frontmatter === "object" ? d.frontmatter : {},
      }));
  }

  /** Each property's kind, from the values the rows hold: "date",
   *  "number", "checkbox", "tags" (a list), "url" or "text". */
  function typesOf(rows, chosen) {
    const kinds = {};
    for (const row of rows)
      for (const [key, value] of Object.entries(row.props)) {
        const kind = kindOf(value);
        if (!kind) continue;
        kinds[key] = kinds[key] && kinds[key] !== kind ? "text" : kind;
      }
    // Text a few values long, said again and again, is a select: a status.
    for (const [key, kind] of Object.entries(kinds)) {
      if (kind !== "text") continue;
      const said = rows.map((r) => text(r.props[key])).filter(Boolean);
      const values = new Set(said);
      if (values.size <= 10 && values.size < said.length && [...values].every((v) => v.length <= 40)) kinds[key] = "select";
    }
    return Object.assign(kinds, chosen || {});
  }

  /** A select's or multi-select's choices: every value its rows have, in
   *  the order first met. */
  function options(rows, key) {
    const seen = [];
    for (const row of rows) {
      const value = row.props[key];
      for (const v of (Array.isArray(value) ? value : [value]).map(text))
        if (v && !seen.includes(v)) seen.push(v);
    }
    return seen;
  }

  function kindOf(value) {
    if (value === null || value === undefined || value === "") return null;
    if (Array.isArray(value)) return "tags";
    if (typeof value === "boolean") return "checkbox";
    if (typeof value === "number") return "number";
    if (value instanceof Date) return "date";
    const text = String(value);
    if (DATE.test(text)) return "date";
    if (/^https?:\/\//.test(text)) return "url";
    return "text";
  }

  /** The columns shown: the block's, else every property in the order
   *  first met; the page's name comes first either way. */
  function columnsOf(spec, rows) {
    if (spec.columns) return spec.columns;
    const seen = [];
    for (const row of rows) for (const key of Object.keys(row.props)) if (!seen.includes(key) && key !== "icon") seen.push(key);
    return seen;
  }

  /** A value as text to compare and sort: a date's day, a list's items. */
  function text(value) {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.map(text).join(", ");
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value);
  }

  function matches(row, f) {
    const value = f.key === "name" ? row.name : row.props[f.key];
    const items = Array.isArray(value) ? value.map(text) : [text(value)];
    const want = f.value.replace(/^["']|["']$/g, "");
    const lower = (s) => s.toLowerCase();
    switch (f.op) {
      case "=":
        return items.some((i) => lower(i) === lower(want));
      case "!=":
        return !items.some((i) => lower(i) === lower(want));
      case "has":
        return items.some((i) => lower(i).includes(lower(want)));
      case "!has":
        return !items.some((i) => lower(i).includes(lower(want)));
      case "empty":
        return items.every((i) => i === "");
      case "!empty":
        return items.some((i) => i !== "");
      default: {
        const a = text(value);
        const n = Number(a);
        const m = Number(want);
        const cmp = !isNaN(n) && !isNaN(m) && a !== "" ? n - m : a.localeCompare(want);
        if (a === "") return false;
        return f.op === ">" ? cmp > 0 : f.op === "<" ? cmp < 0 : f.op === ">=" ? cmp >= 0 : cmp <= 0;
      }
    }
  }

  /** The rows the block shows, filtered and sorted (by name at the last). */
  function viewRows(rows, spec) {
    const kept = rows.filter((row) => spec.filters.every((f) => matches(row, f)));
    const value = (row, key) => (key === "name" ? row.name : row.props[key]);
    return kept.sort((a, b) => {
      for (const s of spec.sort) {
        const x = text(value(a, s.key));
        const y = text(value(b, s.key));
        if (x === y) continue;
        if (x === "") return 1;
        if (y === "") return -1;
        const n = Number(x) - Number(y);
        const c = !isNaN(n) && x.trim() !== "" && y.trim() !== "" ? n : x.localeCompare(y, undefined, { numeric: true });
        if (c) return s.desc ? -c : c;
      }
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
  }

  /** The property a board groups by: the block's, else the first list or
   *  short text property with a few values. */
  function groupKey(spec, rows, types) {
    if (spec.group) return spec.group;
    return (
      Object.keys(types).find((k) => types[k] === "select") ||
      Object.keys(types).find((k) => types[k] === "tags") ||
      Object.keys(types).find((k) => {
        if (types[k] !== "text") return false;
        const values = new Set(rows.map((r) => text(r.props[k])).filter(Boolean));
        return values.size > 0 && values.size <= 8;
      }) ||
      null
    );
  }

  /** The board's lists: each value of `key` in the order met, then "" for
   *  rows without one. A row with several values is in each of their lists. */
  function groups(rows, key) {
    const order = [];
    const of = new Map();
    const add = (value, row) => {
      if (!of.has(value)) {
        of.set(value, []);
        order.push(value);
      }
      of.get(value).push(row);
    };
    for (const row of rows) {
      const value = key ? row.props[key] : null;
      const values = (Array.isArray(value) ? value : [value]).map(text).filter(Boolean);
      if (!values.length) add("", row);
      for (const v of values) add(v, row);
    }
    const named = order.filter((v) => v !== "");
    return named.concat(of.has("") ? [""] : []).map((value) => ({ value, rows: of.get(value) }));
  }

  /** A row's property after it is dragged from list `from` to list `to`:
   *  a list loses `from` and gains `to`; anything else becomes `to`. */
  function regroup(value, from, to) {
    if (Array.isArray(value)) {
      const kept = value.map(text).filter((v) => v !== from);
      if (to && !kept.includes(to)) kept.push(to);
      return kept;
    }
    return to || null;
  }

  /** The date property a calendar places rows by: the block's, else the
   *  first date property. */
  function dateKey(spec, types) {
    return spec.date || Object.keys(types).find((k) => types[k] === "date") || null;
  }

  // ------------------------------------------------------------------
  // Notion's export: a database is a CSV beside a folder of its pages,
  // each name ending in a 32-character id.
  // ------------------------------------------------------------------

  /** RFC 4180 CSV as rows of cells; a leading BOM goes. */
  function parseCsv(source) {
    const s = String(source).replace(/^﻿/, "");
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (quoted) {
        if (c === '"' && s[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") {
        row.push(cell);
        cell = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && s[i + 1] === "\n") i++;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else cell += c;
    }
    if (cell !== "" || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows.filter((r) => r.some((c) => c !== ""));
  }

  /** A Notion name without its id: "Week1 1a2b…(32 hex)" is "Week1". */
  const withoutId = (name) => name.replace(/\s+[0-9a-f]{32}$/i, "").trim();

  const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

  /** A Notion cell as a front matter value: its dates as 2026-01-04 (a
   *  range's first day), Yes/No as true/false, numbers as numbers, and a
   *  multi-select's "a, b" as a list when the column holds lists. */
  function cellValue(cell, asList) {
    const v = cell.trim();
    if (v === "") return null;
    const date = /^([A-Z][a-z]+) (\d{1,2}), (\d{4})/.exec(v);
    if (date && MONTHS[date[1].toLowerCase()]) {
      const pad = (n) => String(n).padStart(2, "0");
      return date[3] + "-" + pad(MONTHS[date[1].toLowerCase()]) + "-" + pad(Number(date[2]));
    }
    if (/^\d{4}\/\d{2}\/\d{2}/.test(v)) return v.slice(0, 10).replace(/\//g, "-");
    if (v === "Yes" || v === "No") return v === "Yes";
    if (asList) return v.split(",").map((s) => s.trim()).filter(Boolean);
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    return v;
  }

  /** A Notion CSV as documents: `{ name, props }` each, the first column
   *  the name. A column whose cells hold commas in most rows is a list. */
  function fromNotionCsv(source) {
    const [head, ...body] = parseCsv(source);
    if (!head) return [];
    const keys = head.map((h) => h.trim());
    const listy = keys.map((_, i) => {
      const filled = body.map((r) => (r[i] || "").trim()).filter(Boolean);
      const commas = filled.filter((v) => v.includes(", ") && !/^[A-Z][a-z]+ \d{1,2}, \d{4}/.test(v));
      return filled.length > 0 && commas.length * 2 >= filled.length;
    });
    return body.map((cells) => {
      const props = {};
      keys.forEach((key, i) => {
        if (i === 0) return;
        const value = cellValue(cells[i] || "", listy[i]);
        if (value !== null) props[propertyName(key)] = value;
      });
      return { name: withoutId(cells[0] || "Untitled"), props };
    });
  }

  /** A Notion column's name as a front matter key: "Start Day" is
   *  "start_day". */
  function propertyName(name) {
    return (
      name
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "_")
        .replace(/^_+|_+$/g, "") || "property"
    );
  }

  root.database = {
    VIEWS,
    TYPES,
    parseSpec,
    writeSpec,
    renameKey,
    dropKey,
    options,
    folderOf,
    rowsOf,
    typesOf,
    columnsOf,
    viewRows,
    groupKey,
    groups,
    regroup,
    dateKey,
    text,
    parseCsv,
    withoutId,
    fromNotionCsv,
    propertyName,
  };
})(typeof window !== "undefined" ? window : globalThis);
