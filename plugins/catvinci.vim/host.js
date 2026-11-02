// Vim in the Textus editor: normal, insert, visual and visual-line mode,
// counts, motions, operators, a register, dot repeat, flash (s and a
// character, then a label, jumps anywhere on screen), the command line in
// the command palette (:w, :q, :wq, :12) and key mappings written as in a
// vimrc (inoremap jj <Esc>). Keys come from the editor while this plugin holds the keyboard
// (textus.editor.captureKeys); every change is an editor action
// (textus.editor.exec), done as typing is and undone with u. A Markdown
// document is not a plain file: a "line" here is a paragraph, a heading,
// a list item - or a code block's line.

// The interface language arrives once the plugin is running: read when
// a label is made, not as this file loads.

var on = true;
var mode = "normal"; // normal | insert | visual | vline
var count = "";
var pending = ""; // an operator (d c y), "g", or a key waiting for its char (f t F T r)
var operator = null;
var register = { text: "", linewise: false };
var lastFind = null; // { char, forward, till }
var vlineCount = 1;
var flash = null; // { query, letters, op } while s is collecting
var cmdline = null; // the command line's text while a mapping's : runs
var feeding = 0; // above 0 while a mapping's keys are fed
var note = ""; // a line for the status until the next key (an unknown command)
var settings = { flash: true, escape: "", mappings: "" };

// Dot repeat: the keys of the last change made in normal mode, from its
// count to the key that finished it.
var recording = null;
var lastChange = null;
var replaying = false;
var CHANGES = "dcxXrpPDCS~";

var status = null;

var MOTIONS = {
  h: "left",
  ArrowLeft: "left",
  Backspace: "left",
  l: "right",
  ArrowRight: "right",
  " ": "right",
  j: "down",
  ArrowDown: "down",
  Enter: "down",
  k: "up",
  ArrowUp: "up",
  w: "wordStart",
  W: "wordStart",
  b: "wordBack",
  B: "wordBack",
  e: "wordEnd",
  E: "wordEnd",
  0: "lineStart",
  Home: "lineStart",
  "^": "lineFirstChar",
  $: "lineEnd",
  End: "lineEnd",
  "{": "paragraphPrev",
  "}": "paragraphNext",
  G: "docEnd",
};
// Motions an operator takes the character under the end of, as Vim does.
var INCLUSIVE = { wordEnd: true, lineEnd: true, findChar: true };

function exec(op) {
  return textus.editor.keys.exec(op);
}

function label() {
  if (cmdline !== null) return ":" + cmdline;
  var text = "-- " + textus.l10n.t(mode) + " --";
  var typed = count + pending + (flash ? "s" + flash.query : "");
  if (note) return text + " " + note;
  return typed ? text + " " + typed : text;
}

function showStatus() {
  if (!on) {
    if (status) status.dispose();
    status = null;
    return;
  }
  status = textus.ui.statusItem("mode", {
    text: label(),
    tooltip: textus.l10n.t("statusTip"),
    command: "catvinci.vim.toggle",
  });
}

function captureFor(m) {
  if (!on) return textus.editor.keys.capture(null);
  if (m === "insert") {
    // Escape, and every key an insert-mode mapping starts with or goes on
    // with (jj, jk): the rest are typed by the editor itself.
    var keys = ["Escape", "ctrl+["];
    maps.i.forEach(function (m) {
      m.lhs.forEach(function (k) {
        if (keys.indexOf(k) < 0) keys.push(k);
      });
    });
    return textus.editor.keys.capture({ mode: "some", keys: keys });
  }
  // Every key, and these Ctrl ones the app would otherwise keep.
  return textus.editor.keys.capture({
    mode: "all",
    keys: ["ctrl+r", "ctrl+d", "ctrl+u", "ctrl+["],
  });
}

function setMode(m) {
  // The text typed in insert mode isn't seen here: a change that goes on
  // into it (c, s) isn't one dot can repeat.
  if (m === "insert" && !replaying) recording = null;
  mode = m;
  count = "";
  pending = "";
  operator = null;
  flash = null;
  cmdline = null;
  typedMap = [];
  captureFor(m);
  showStatus();
  return exec({ op: "cursor", style: m === "insert" ? "bar" : "block" }).catch(
    function () {},
  );
}

function takeCount() {
  var n = count ? parseInt(count, 10) : 1;
  count = "";
  return n;
}

/** Keeps the keys of a change as it is typed. */
function record(key) {
  if (replaying) return;
  if (recording) {
    recording.push(key);
    return;
  }
  var starts = CHANGES.indexOf(key) >= 0 || (key === "s" && !settings.flash);
  if (mode === "normal" && !operator && !pending && starts && key.length === 1)
    recording = (count ? count.split("") : []).concat([key]);
}

/** A change is done once nothing is pending in normal mode: it is what
 *  dot repeats. */
function endChange() {
  if (replaying || !recording) return;
  if (mode === "normal" && !pending && !operator) {
    lastChange = recording;
    recording = null;
  }
}

async function remember(text, linewise) {
  register = { text: text || "", linewise: !!linewise };
}

// --- Key mappings (a vimrc's map lines) --------------------------------

// lhs and rhs as keys the way the editor names them: "j", "Escape",
// "ctrl+w", " ".
var maps = { n: [], v: [], i: [] };
var MAP_TIMEOUT = 1000; // Vim's timeoutlen

var KEY_NAMES = {
  esc: "Escape",
  cr: "Enter",
  enter: "Enter",
  return: "Enter",
  space: " ",
  bs: "Backspace",
  tab: "Tab",
  del: "Delete",
  left: "ArrowLeft",
  right: "ArrowRight",
  up: "ArrowUp",
  down: "ArrowDown",
  home: "Home",
  end: "End",
  lt: "<",
  bar: "|",
  bslash: "\\",
};

/** "jj", "<Esc>", "<C-w>v", "<leader>w" as keys. */
function parseKeys(text, leader) {
  var keys = [];
  var i = 0;
  while (i < text.length) {
    var close = text[i] === "<" ? text.indexOf(">", i) : -1;
    if (close > i) {
      var name = text.slice(i + 1, close).toLowerCase();
      var ctrl = /^c-(.)$/.exec(name);
      if (name === "leader") keys = keys.concat(leader);
      else if (ctrl) keys.push("ctrl+" + ctrl[1]);
      else if (KEY_NAMES[name]) keys.push(KEY_NAMES[name]);
      else keys = keys.concat(text.slice(i, close + 1).split(""));
      i = close + 1;
    } else {
      keys.push(text[i]);
      i++;
    }
  }
  return keys;
}

var MAP_MODES = {
  map: "nv",
  noremap: "nv",
  nmap: "n",
  nnoremap: "n",
  vmap: "v",
  vnoremap: "v",
  xmap: "v",
  xnoremap: "v",
  imap: "i",
  inoremap: "i",
  "map!": "i",
  "noremap!": "i",
};

/** The mappings in `text`, a vimrc's lines: map, noremap, nnoremap,
 *  inoremap, vnoremap… and let mapleader. Anything else is passed over. */
function parseMappings(text) {
  var found = { n: [], v: [], i: [] };
  var leader = ["\\"];
  String(text || "")
    .split(/\r?\n/)
    .forEach(function (raw) {
      var line = raw.trim();
      if (!line || line[0] === '"') return;
      var lead = /^let\s+mapleader\s*=\s*(["'])(.*)\1\s*$/.exec(line);
      if (lead) {
        leader = parseKeys(lead[2].replace(/^\\</, "<"), []);
        return;
      }
      var words = line.split(/\s+/);
      var modes = MAP_MODES[words[0]];
      if (!modes) return;
      var rest = words.slice(1);
      while (rest.length && /^<(silent|buffer|nowait|expr|unique)>$/i.test(rest[0]))
        rest.shift();
      if (rest.length < 2) return;
      var lhs = parseKeys(rest[0], leader);
      var rhs = parseKeys(rest.slice(1).join(" "), leader);
      modes.split("").forEach(function (m) {
        found[m].push({ lhs: lhs, rhs: rhs });
      });
    });
  return found;
}

function readMappings() {
  maps = parseMappings(settings.mappings);
  // The older setting: two letters that leave insert mode.
  var esc = settings.escape;
  if (esc && esc.length === 2)
    maps.i.push({ lhs: [esc[0], esc[1]], rhs: ["Escape"] });
}

function same(a, b) {
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function startsWith(keys, start) {
  return keys.length > start.length && same(keys.slice(0, start.length), start);
}

// Normal and visual mode: the keys typed so far of a mapping not yet whole.
var typedMap = [];
var mapTimer = null;

/** Whether normal or visual mode's mappings may take this key: not
 *  inside something that waits for its own keys (an operator's motion,
 *  f's character, flash, the command line). */
function mappable() {
  return (
    !replaying && !flash && cmdline === null && !pending && !operator
  );
}

/** Runs keys as typed, unmapped (a mapping's right-hand side). */
async function feed(keys) {
  feeding++;
  try {
    for (var i = 0; i < keys.length; i++) await dispatch(keys[i]);
  } finally {
    feeding--;
  }
}

async function mapKey(key) {
  var list = maps[mode === "normal" ? "n" : "v"];
  var typed = typedMap.concat([key]);
  var whole = list.filter(function (m) {
    return same(m.lhs, typed);
  })[0];
  var longer = list.some(function (m) {
    return startsWith(m.lhs, typed);
  });
  clearTimeout(mapTimer);
  if (longer) {
    // Wait for the next key; without one, what was typed as it is (or
    // the shorter mapping it makes).
    typedMap = typed;
    mapTimer = setTimeout(function () {
      enqueue(function () {
        if (!same(typedMap, typed)) return;
        typedMap = [];
        return whole ? feed(whole.rhs) : feed(typed);
      });
    }, MAP_TIMEOUT);
    return;
  }
  typedMap = [];
  if (whole) return feed(whole.rhs);
  // No mapping: the keys held back, then this one, as they are.
  for (var i = 0; i < typed.length - 1; i++) await dispatch(typed[i]);
  return dispatch(key);
}

// Insert mode: the mapping keys typed (and typed into the text) lately.
var typedInsert = [];
var typedInsertAt = 0;

async function insertMapKey(key) {
  var now = Date.now();
  if (now - typedInsertAt > MAP_TIMEOUT) typedInsert = [];
  var typed = typedInsert.concat([key]);
  var whole = maps.i.filter(function (m) {
    return same(m.lhs, typed);
  })[0];
  var longer = maps.i.some(function (m) {
    return startsWith(m.lhs, typed);
  });
  if (whole && !longer) {
    // The keys before this one went in as text: take them back, then
    // do what the mapping says.
    var back = typedInsert.filter(function (k) {
      return k.length === 1;
    }).length;
    typedInsert = [];
    if (back)
      await exec({ op: "deleteChars", count: back, back: true, copy: false });
    return feed(whole.rhs);
  }
  var begins = function (keys) {
    return maps.i.some(function (m) {
      return startsWith(m.lhs, keys) || same(m.lhs, keys);
    });
  };
  typedInsert = longer ? typed : begins([key]) ? [key] : [];
  typedInsertAt = now;
  return insertKey(key);
}

// --- Operators ----------------------------------------------------------

async function applyToSelection(op) {
  if (op === "y") {
    var copied = await exec({ op: "copy" });
    await remember(copied.text, false);
    await exec({ op: "collapse", to: "start" });
    return;
  }
  var cut = await exec({ op: "delete" });
  await remember(cut.text, false);
  if (op === "c") await setMode("insert");
}

async function operateLines(op, n) {
  if (op === "y") {
    var copied = await exec({ op: "copyLines", count: n });
    await remember(copied.text, true);
    return;
  }
  if (op === "c") {
    // The lines' text goes; one empty line stays, to write in.
    await exec({ op: "selectLines", count: n });
    var cut = await exec({ op: "delete" });
    await remember(cut.text + "\n", true);
    await setMode("insert");
    return;
  }
  var gone = await exec({ op: "deleteLines", count: n });
  await remember(gone.text, true);
  await exec({ op: "move", unit: "lineFirstChar" });
}

async function operateMotion(op, unit, n, extra) {
  if (unit === "down" || unit === "up") {
    if (unit === "up") await exec({ op: "move", unit: "up", count: n });
    return operateLines(op, n + 1);
  }
  // cw changes to the end of the word, as Vim's does; dw stops at the end
  // of the line; d} at the end of the paragraph.
  if (op === "c" && unit === "wordStart") unit = "wordEnd";
  else if (unit === "wordStart") unit = "wordStartInLine";
  else if (unit === "paragraphNext") unit = "paragraphEnd";
  var move = Object.assign(
    { op: "move", unit: unit, count: n, select: true },
    extra || {},
  );
  await exec(move);
  if (INCLUSIVE[unit])
    await exec({ op: "move", unit: "rightInsert", select: true });
  await applyToSelection(op);
}

// --- Flash --------------------------------------------------------------

async function flashKey(key) {
  if (key === "Escape" || key === "ctrl+[") return endFlash();
  if (key.length !== 1) return;
  // A label's letter jumps; any other character narrows the search.
  if (flash.query && flash.letters.indexOf(key) >= 0) return flashJump(key);
  flash.query += key;
  var shown = await exec({ op: "flash", query: flash.query });
  flash.letters = shown.letters || "";
  if (!shown.labels) return endFlash();
  // One place only: there.
  if (flash.query.length >= 2 && shown.labels === 1)
    return flashJump(flash.letters[0]);
  showStatus();
}

async function flashJump(letter) {
  var op = flash.op;
  flash = null;
  if (op) {
    // d, c or y and s: from the caret to the place.
    await exec({ op: "flashJump", label: letter, extend: true });
    await applyToSelection(op);
  } else {
    await exec({ op: "flashJump", label: letter, select: mode === "visual" });
  }
  showStatus();
}

async function endFlash() {
  flash = null;
  await exec({ op: "flashClear" });
  showStatus();
}

// --- The command line ---------------------------------------------------

async function cmdlineKey(key) {
  if (key === "Escape" || key === "ctrl+[" || key === "ctrl+c") {
    cmdline = null;
  } else if (key === "Enter") {
    var text = cmdline;
    cmdline = null;
    showStatus();
    return runCommand(text);
  } else if (key === "Backspace") {
    cmdline = cmdline ? cmdline.slice(0, -1) : null;
  } else if (key === "ctrl+u") {
    cmdline = "";
  } else if (key.length === 1) {
    cmdline += key;
  }
  showStatus();
}

var EX = [
  [":w", "exWrite"],
  [":q", "exQuit"],
  [":wq", "exWriteQuit"],
  [":u", "exUndo"],
  [":red", "exRedo"],
];

/** ":" typed: the palette with Vim's commands first. One of Textus's runs
 *  there; Vim's, or what was typed (":12"), runs here. */
async function commandPalette() {
  var range = mode === "visual" || mode === "vline" ? "'<,'>" : "";
  var got = await textus.ui.pick(
    EX.map(function (ex) {
      return { label: ex[0], description: textus.l10n.t(ex[1]), value: ex[0] };
    }),
    {
      commands: true,
      value: ":" + range,
      placeholder: textus.l10n.t("commandLine"),
    },
  );
  var text = typeof got === "string" ? got : got && got.typed;
  if (typeof text === "string") await runCommand(text.replace(/^:/, ""));
}

/** An Ex command: what Textus has of them - saving, closing the tab,
 *  going to a line, undo. */
async function runCommand(text) {
  // A visual selection's range ('<,'>) and a whole file's (%) mean this
  // document, as every command here does.
  var line = text.trim().replace(/^('<,'>|%)\s*/, "");
  if (!line) return;
  if (/^\d+$/.test(line)) {
    await exec({
      op: "move",
      unit: "docLine",
      count: parseInt(line, 10),
      visual: mode === "visual",
    });
    return;
  }
  if (line === "$") {
    await exec({ op: "move", unit: "docEnd", visual: mode === "visual" });
    return;
  }
  var name = line.split(/\s+/)[0];
  if (mode === "visual" || mode === "vline") {
    await exec({ op: "collapse", to: "head" });
    await setMode("normal");
  }
  switch (name) {
    case "w":
    case "w!":
    case "write":
    case "wa":
    case "wall":
    case "up":
    case "update":
      return textus.commands.execute("textus.save");
    case "q":
    case "q!":
    case "quit":
    case "quit!":
    case "clo":
    case "close":
    case "bd":
    case "bdelete":
      return textus.commands.execute("textus.closeTab");
    case "wq":
    case "wq!":
    case "x":
    case "xit":
    case "exi":
    case "exit":
      return textus.commands.execute("textus.closeTab", { save: true });
    case "u":
    case "undo":
      return exec({ op: "undo" });
    case "red":
    case "redo":
      return exec({ op: "redo" });
    case "noh":
    case "nohlsearch":
      return;
  }
  note = textus.l10n.t("notCommand").replace("{command}", name);
  showStatus();
}

// --- Normal and visual mode --------------------------------------------

async function normalKey(key) {
  if (cmdline !== null) return cmdlineKey(key);
  if (flash) return flashKey(key);
  if (mode === "normal") record(key);

  if (key === "Escape" || key === "ctrl+[") {
    count = "";
    pending = "";
    operator = null;
    if (!replaying) recording = null;
    if (mode === "visual" || mode === "vline") {
      await exec({ op: "collapse", to: "head" });
      await setMode("normal");
    }
    showStatus();
    return;
  }

  // An operator's text object: iw (the word), aw (the word and the
  // space after it).
  if (pending === "i" || pending === "a") {
    var around = pending === "a";
    pending = "";
    var objectOp = operator;
    operator = null;
    if (key === "w" || key === "W") {
      await exec({ op: "move", unit: "rightInsert" });
      await exec({ op: "move", unit: "wordBack" });
      if (around) {
        await exec({ op: "move", unit: "wordStart", select: true });
      } else {
        await exec({ op: "move", unit: "wordEnd", select: true });
        await exec({ op: "move", unit: "rightInsert", select: true });
      }
      await applyToSelection(objectOp);
      endChange();
    } else if (!replaying) {
      recording = null;
    }
    showStatus();
    return;
  }

  // A key waiting for its character: f t F T r.
  if (
    pending &&
    "ftFTr".indexOf(pending) >= 0 &&
    pending.length === 1 &&
    pending !== "g"
  ) {
    if (key.length !== 1) {
      pending = "";
      operator = null;
      showStatus();
      return;
    }
    var waiting = pending;
    pending = "";
    var n = takeCount();
    if (waiting === "r") {
      await exec({ op: "replaceChar", char: key });
      endChange();
      showStatus();
      return;
    }
    var find = {
      char: key,
      forward: waiting === "f" || waiting === "t",
      till: waiting === "t" || waiting === "T",
    };
    lastFind = find;
    await doMotion("findChar", n, find);
    showStatus();
    return;
  }

  if (/^[1-9]$/.test(key) || (key === "0" && count)) {
    count += key;
    showStatus();
    return;
  }

  if (pending === "g") {
    pending = "";
    // gg, or 5gg: the fifth line.
    if (key === "g") {
      if (count) await doMotion("docLine", takeCount());
      else await doMotion("docStart", 1);
    }
    showStatus();
    return;
  }

  if (key === "g") {
    pending = "g";
    showStatus();
    return;
  }

  // zz, zt, zb (and z., z<CR>, z-): the caret's line to the middle, top or
  // bottom of the window. A Textus without the op scrolls nothing.
  if (pending === "z") {
    pending = "";
    takeCount();
    var to = { z: "center", ".": "center", t: "top", Enter: "top", b: "bottom", "-": "bottom" }[key];
    if (to && !operator) await exec({ op: "scroll", to: to }).catch(function () {});
    showStatus();
    return;
  }

  if (key === "z" && !operator) {
    pending = "z";
    showStatus();
    return;
  }

  if ("fFtT".indexOf(key) >= 0) {
    pending = key;
    showStatus();
    return;
  }

  if (key === ";" || key === ",") {
    if (lastFind) {
      var repeat = Object.assign({}, lastFind);
      if (key === ",") repeat.forward = !repeat.forward;
      await doMotion("findChar", takeCount(), repeat);
    }
    showStatus();
    return;
  }

  if (key === "ctrl+d" || key === "ctrl+u") {
    await doMotion(key === "ctrl+d" ? "down" : "up", 15 * takeCount());
    showStatus();
    return;
  }

  if (key === ":" && !operator) {
    count = "";
    if (!replaying) recording = null;
    // A mapping's ":w<CR>" types on in the status line; typed, ":" opens
    // the command palette.
    if (replaying || feeding) cmdline = "";
    else await commandPalette();
    showStatus();
    return;
  }

  if (MOTIONS[key]) {
    // 12G: the twelfth line.
    if (key === "G" && count) await doMotion("docLine", takeCount());
    else await doMotion(MOTIONS[key], takeCount());
    showStatus();
    return;
  }

  if (mode === "visual" || mode === "vline") return visualKey(key);
  return normalCommand(key);
}

async function doMotion(unit, n, extra) {
  if (operator) {
    var op = operator;
    operator = null;
    await operateMotion(op, unit, n, extra);
    endChange();
    return;
  }
  if (mode === "vline") {
    if (unit === "down") vlineCount += n;
    else if (unit === "up") vlineCount = Math.max(1, vlineCount - n);
    await exec({ op: "collapse", to: "start" });
    await exec({ op: "selectLines", count: vlineCount });
    return;
  }
  var move = Object.assign(
    { op: "move", unit: unit, count: n, visual: mode === "visual" },
    extra || {},
  );
  await exec(move);
}

async function normalCommand(key) {
  var n;
  if (operator && (key === "i" || key === "a")) {
    pending = key;
    showStatus();
    return;
  }
  if (operator && key === "s" && settings.flash) {
    // ds, cs, ys and a label: to the place flash finds.
    if (!replaying) recording = null;
    flash = { query: "", letters: "", op: operator };
    operator = null;
    showStatus();
    return;
  }
  if (operator) {
    // dd, cc, yy: lines.
    if (key === operator) {
      var op = operator;
      operator = null;
      await operateLines(op, takeCount());
      endChange();
      showStatus();
      return;
    }
    operator = null;
    recording = null;
    showStatus();
    return;
  }

  switch (key) {
    case "d":
    case "c":
    case "y":
      operator = key;
      pending = "";
      showStatus();
      return;
    case "D":
      await operateMotion("d", "lineEnd", 1);
      break;
    case "C":
      await operateMotion("c", "lineEnd", 1);
      break;
    case "Y":
      await operateLines("y", takeCount());
      break;
    case "x":
    case "X": {
      var cut = await exec({
        op: "deleteChars",
        count: takeCount(),
        back: key === "X",
      });
      if (cut.text) await remember(cut.text, false);
      break;
    }
    case "r":
      pending = "r";
      showStatus();
      return;
    case "s":
      if (settings.flash) {
        recording = null;
        flash = { query: "", letters: "", op: null };
        showStatus();
        return;
      }
      await exec({ op: "deleteChars", count: takeCount() });
      recording = null;
      return setMode("insert");
    case "p":
    case "P":
      n = takeCount();
      for (var i = 0; i < n; i++) {
        if (register.linewise) {
          await exec({
            op: "pasteLines",
            text: register.text,
            above: key === "P",
          });
        } else if (register.text) {
          if (key === "p") await exec({ op: "move", unit: "rightInsert" });
          await exec({ op: "insertText", text: register.text });
          await exec({ op: "move", unit: "left" });
        }
      }
      break;
    case "u":
      n = takeCount();
      for (var u = 0; u < n; u++) await exec({ op: "undo" });
      break;
    case "~":
      // The case of the characters under the caret, flipped; the caret
      // ends after them.
      await exec({
        op: "move",
        unit: "right",
        count: takeCount(),
        select: true,
      });
      await recase("flip");
      break;
    case "ctrl+r":
      n = takeCount();
      for (var r = 0; r < n; r++) await exec({ op: "redo" });
      break;
    case ".":
      if (lastChange) {
        replaying = true;
        try {
          for (var k = 0; k < lastChange.length; k++)
            await normalKey(lastChange[k]);
        } finally {
          replaying = false;
        }
      }
      break;
    case "i":
      return setMode("insert");
    case "a":
      await exec({ op: "move", unit: "rightInsert" });
      return setMode("insert");
    case "I":
      await exec({ op: "move", unit: "lineFirstChar" });
      return setMode("insert");
    case "A":
      await exec({ op: "move", unit: "lineEndInsert" });
      return setMode("insert");
    case "o":
    case "O":
      await exec({ op: "openLine", above: key === "O" });
      return setMode("insert");
    case "v":
      await exec({ op: "visualStart" });
      return setMode("visual");
    case "V":
      vlineCount = 1;
      await exec({ op: "selectLines", count: 1 });
      return setMode("vline");
    default:
      count = "";
      if (!replaying) recording = null;
  }
  endChange();
  showStatus();
}

async function visualKey(key) {
  if (key === "d" || key === "x" || key === "y" || key === "c") {
    var op = key === "x" ? "d" : key;
    if (mode === "vline") {
      await exec({ op: "collapse", to: "start" });
      await setMode("normal");
      await operateLines(op, vlineCount);
    } else {
      await applyToSelection(op);
      if (op !== "c") await setMode("normal");
    }
    showStatus();
    return;
  }
  if (key === "s" && settings.flash) {
    flash = { query: "", letters: "", op: null };
    showStatus();
    return;
  }
  // ~ flips the selection's case, U upper-cases it, u lower-cases it -
  // within a paragraph (a visual-line selection keeps its blocks).
  if ((key === "~" || key === "U" || key === "u") && mode === "visual") {
    await recase(key === "~" ? "flip" : key === "U" ? "upper" : "lower");
    await setMode("normal");
    showStatus();
    return;
  }
  if (key === "v" || key === "V") {
    await exec({ op: "collapse", to: "head" });
    await setMode("normal");
  }
}

/** The selection's text again in another case. */
async function recase(how) {
  var copied = await exec({ op: "copy" });
  var text = copied.text || "";
  if (!text || text.indexOf("\n") >= 0) {
    await exec({ op: "collapse", to: "head" });
    return;
  }
  var next =
    how === "upper"
      ? text.toUpperCase()
      : how === "lower"
        ? text.toLowerCase()
        : text
            .split("")
            .map(function (c) {
              var up = c.toUpperCase();
              return c === up ? c.toLowerCase() : up;
            })
            .join("");
  await exec({ op: "insertText", text: next });
}

// --- Insert mode --------------------------------------------------------

async function insertKey(key) {
  if (key === "Escape" || key === "ctrl+[") {
    typedInsert = [];
    await setMode("normal");
    await exec({ op: "move", unit: "left" });
    return;
  }
  // A key typed while the editor still sent every key here (just after
  // i, cw, o...), or one a mapping starts with: typed as it is.
  if (key.length === 1) await exec({ op: "insertText", text: key });
  else if (key === "Enter") await exec({ op: "insertText", text: "\n" });
}

// --- Wiring -------------------------------------------------------------

/** One key, as typed, no mapping looked up. */
function dispatch(key) {
  return mode === "insert" ? insertKey(key) : normalKey(key);
}

var queue = Promise.resolve();
function enqueue(work) {
  queue = queue.then(work).catch(function (err) {
    console.error(err);
  });
}

function handle(key) {
  enqueue(function () {
    if (note) {
      note = "";
      showStatus();
    }
    if (mode === "insert")
      return maps.i.length ? insertMapKey(key) : insertKey(key);
    var list = maps[mode === "normal" ? "n" : "v"];
    if ((list.length && mappable()) || typedMap.length) return mapKey(key);
    return normalKey(key);
  });
}

async function readSettings() {
  settings.flash = (await textus.settings.get("flash")) !== false;
  settings.escape = String((await textus.settings.get("escape")) || "");
  settings.mappings = String((await textus.settings.get("mappings")) || "");
  readMappings();
}

exports.activate = async function () {
  await readSettings();
  textus.settings.onDidChange(function () {
    readSettings().then(function () {
      captureFor(mode);
    });
  });
  textus.editor.keys.onKey(handle);
  textus.commands.register("catvinci.vim.toggle", function () {
    on = !on;
    if (on) return setMode("normal");
    textus.editor.keys.capture(null);
    showStatus();
  });
  await setMode("normal");
};

exports.deactivate = function () {
  textus.editor.keys.capture(null);
};

// For the tests: how a vimrc's lines are read.
exports.parseMappings = parseMappings;
