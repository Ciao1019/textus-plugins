// WakaTime: your writing time in Textus on your WakaTime dashboard, beside
// your coding. Heartbeats wait in a queue that survives being offline and
// go in batches; nothing is sent until you set your API key.

/* global wakaBeat */
const t = (key, ...args) => textus.l10n.t(key, ...args);
const API = "https://api.wakatime.com/api/v1/users/current";
const BATCH = 25;
const QUEUE_MAX = 1000;

let ctx = null;
let last = null;
let queue = [];
let warned = false;
let sending = false;

const userAgent = () =>
  "Textus/" + textus.env.appVersion + " (" + textus.env.platform + ") textus-wakatime/" + ctx.plugin.version;
const auth = (key) => "Basic " + btoa(key);

async function details(path) {
  const folder = await textus.files.root().catch(() => null);
  const read = (rel) => (folder ? textus.files.readText(folder.replace(/[\\/]+$/, "") + "/" + rel).catch(() => null) : null);
  const text = await textus.editor.getText().catch(() => null);
  return {
    project: wakaBeat.project(folder, await read(".wakatime-project")),
    branch: wakaBeat.branch(await read(".git/HEAD")),
    lines: typeof text === "string" ? text.split("\n").length : undefined,
    entity: path,
  };
}

/** A heartbeat for the document in front, if this work counts and one is due. */
async function beat(isWrite, source, path) {
  const kind = wakaBeat.category(source, textus.app.state);
  if (!kind) return;
  const entity = path || (await textus.editor.getPath());
  if (!entity) return; // an unsaved document has no file to name
  const now = Date.now();
  if (!wakaBeat.due(last, entity, now, isWrite, kind)) return;
  if (!(await ctx.secrets.get("apiKey"))) return;
  last = { entity: entity, at: now, category: kind };
  const more = await details(entity);
  queue.push(wakaBeat.heartbeat(entity, now, isWrite, Object.assign(more, { category: kind })));
  if (queue.length > QUEUE_MAX) queue = queue.slice(-QUEUE_MAX);
  await ctx.storage.global.set("queue", queue);
}

/** The queue to WakaTime, 25 at a time; what can't go yet stays queued. */
async function flush() {
  if (sending || !queue.length) return;
  const key = await ctx.secrets.get("apiKey");
  if (!key) return;
  sending = true;
  try {
    while (queue.length) {
      const batch = queue.slice(0, BATCH);
      const response = await textus.net
        .fetch(API + "/heartbeats.bulk", {
          method: "POST",
          headers: { Authorization: auth(key), "Content-Type": "application/json", "User-Agent": userAgent() },
          body: JSON.stringify(batch),
        })
        .catch(() => null);
      if (!response) break; // offline: next time
      if (response.status === 401 || response.status === 403) {
        if (!warned) textus.ui.notice(t("badKey"));
        warned = true;
        break;
      }
      if (!response.ok && response.status !== 400) break;
      queue = queue.slice(batch.length);
      await ctx.storage.global.set("queue", queue);
    }
  } finally {
    sending = false;
  }
}

async function setKey() {
  const key = await textus.ui.input({
    prompt: t("keyPrompt"),
    placeholder: "waka_…",
    value: (await ctx.secrets.get("apiKey")) || "",
  });
  if (key === undefined || key === null) return;
  if (key.trim() && !wakaBeat.validKey(key)) return textus.ui.message(t("keyShape"));
  await ctx.secrets.set("apiKey", key.trim() || null);
  warned = false;
  textus.ui.notice(key.trim() ? t("keySaved") : t("keyRemoved"));
}

/** Today's total, as WakaTime counts it. */
async function today() {
  const key = await ctx.secrets.get("apiKey");
  if (!key) return textus.ui.message(t("noKey"));
  await flush();
  const response = await textus.net
    .fetch(API + "/status_bar/today", { headers: { Authorization: auth(key), "User-Agent": userAgent() } })
    .catch(() => null);
  if (!response || !response.ok) return textus.ui.message(t("todayFailed"));
  const data = await response.json();
  const text = (data && data.data && data.data.grand_total && data.data.grand_total.text) || "0 secs";
  textus.ui.notice(t("today", text));
}

exports.activate = async function (context) {
  ctx = context;
  const saved = await ctx.storage.global.get("queue");
  queue = Array.isArray(saved) ? saved : [];
  const timer = setInterval(() => void flush(), 30000);
  ctx.subscriptions.push(
    textus.commands.register("catvinci.wakatime.setKey", setKey),
    textus.commands.register("catvinci.wakatime.today", today),
    textus.commands.register("catvinci.wakatime.dashboard", () => textus.layout.openExternal("https://wakatime.com/dashboard")),
    textus.editor.onDidChange((e) => void beat(false, e && e.source)),
    textus.editor.onDidChangeSelection(() => void beat(false, "user")),
    textus.editor.onDidChangeActive((e) => e && e.path && void beat(false, "user", e.path)),
    textus.files.onDidSave((e) => void beat(e && e.trigger === "manual", "user", e && e.path)),
    // Leaving the window: what is queued goes now; nothing more counts.
    textus.app.onDidChangeState((state) => state !== "active" && void flush()),
    { dispose: () => clearInterval(timer) },
  );
};
