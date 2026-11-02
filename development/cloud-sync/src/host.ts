import { defaults } from "./config";
import { parseBase } from "./content";
import { synchronize } from "./engine";
import { openEncryptedStore } from "./encrypted-store";
import { Workspace } from "./local";
import { Settings } from "./settings";
import { RemoteStore, testConnection } from "./transport";
import {
  ID,
  LOCK,
  SyncError,
  checkAbort,
  type Config,
  type ConnectionInput,
  type Result,
} from "./model";

interface ViewState {
  root: string | null;
  config: Config;
  configured: boolean;
  busy: boolean;
  message: string;
  error: boolean;
  progress: number | null;
  result?: Result;
  lastRun?: string;
}

class Controller {
  private settings: Settings;
  private views = new Set<Textus.Webview>();
  private timer?: ReturnType<typeof setTimeout>;
  private abort?: AbortController;
  private disposed = false;
  private state: ViewState = {
    root: null,
    config: { ...defaults },
    configured: false,
    busy: false,
    message: "",
    error: false,
    progress: null,
  };
  constructor(
    private ctx: Textus.PluginContext,
    private api: Textus.Api,
  ) {
    this.settings = new Settings(ctx);
  }
  private t = (key: string, ...args: unknown[]) =>
    this.api.l10n.t(key, ...args);
  private send(view: Textus.Webview, message: unknown) {
    // A tab can close while a status update crosses the asynchronous bridge.
    void view.postMessage(message).catch(() => this.views.delete(view));
  }
  private broadcast() {
    for (const view of this.views)
      this.send(view, { type: "state", ...this.state });
  }
  private message(key: string, error = false, ...args: unknown[]) {
    this.state.message = this.t(key, ...args);
    this.state.error = error;
    this.broadcast();
  }
  private fail(error: unknown) {
    const e =
      error instanceof SyncError ? error : new SyncError("unknownError");
    this.message(e.code, true, ...e.args);
    // Provider response bodies and raw network errors can contain credentials.
    this.ctx.log.warn(e.code);
  }
  async refresh() {
    const root = await this.api.files.root();
    const config = root ? await this.settings.load(root) : { ...defaults };
    let configured = false;
    if (root)
      try {
        await this.settings.credentials(root, config);
        await this.settings.password(root, config);
        configured = true;
      } catch {
        /* Not configured. */
      }
    this.state = {
      root,
      config,
      configured,
      busy: this.state.busy,
      message: this.t(
        !root ? "noFolder" : configured ? "ready" : "notConfigured",
      ),
      error: false,
      progress: null,
    };
    if (root && configured) {
      const key = await this.settings.baseKey(root, config);
      const last = (await this.ctx.storage.global.get(`last:${key}`)) as {
        at: string;
        result: Result;
      } | null;
      if (last && typeof last.at === "string") {
        this.state.lastRun = last.at;
        this.state.result = last.result;
      }
    }
    this.broadcast();
    this.schedule();
  }
  private schedule() {
    clearTimeout(this.timer);
    if (
      this.disposed ||
      !this.state.config.automatic ||
      !this.state.configured ||
      !this.state.root
    )
      return;
    this.timer = setTimeout(() => {
      void this.operation("sync");
    }, this.state.config.interval * 60_000);
  }
  private async store() {
    const root = await this.api.files.root();
    if (!root) throw new SyncError("noFolder");
    if (root !== this.state.root) throw new SyncError("rootChanged");
    const config = await this.settings.load(root);
    const credentials = await this.settings.credentials(root, config);
    return {
      root,
      config,
      store: new RemoteStore(config, credentials, this.api.net.fetch),
    };
  }
  private async recover(store: RemoteStore) {
    const raw = await store.get(LOCK);
    if (!raw) {
      this.message("noLock");
      return;
    }
    let at = "—";
    try {
      const parsed = JSON.parse(new TextDecoder().decode(raw));
      if (
        typeof parsed.startedAt === "string" &&
        Number.isFinite(Date.parse(parsed.startedAt))
      )
        at = new Date(parsed.startedAt).toLocaleString(this.api.env.language);
    } catch {
      /* An unknown lock is still removable with confirmation. */
    }
    if (
      !(await this.api.ui.confirm(this.t("confirmUnlock", at), {
        danger: true,
        okLabel: this.t("unlock"),
      }))
    )
      return;
    checkAbort(this.abort?.signal);
    const current = await store.get(LOCK);
    if (
      !current ||
      new TextDecoder().decode(raw) !== new TextDecoder().decode(current)
    )
      throw new SyncError("lockLost");
    await store.remove(LOCK);
    this.message("unlocked");
  }
  async operation(kind: "sync" | "test" | "unlock") {
    if (this.state.busy || this.disposed) return;
    this.state.busy = true;
    this.state.progress = null;
    this.abort = new AbortController();
    this.message(kind === "sync" ? "scanning" : "testing");
    clearTimeout(this.timer);
    try {
      const { root, config, store } = await this.store();
      if (kind === "unlock") {
        await this.recover(store);
        return;
      }
      const key = await this.settings.baseKey(root, config);
      const pin = await this.ctx.storage.global.get(`vault:${key}`);
      if (
        pin != null &&
        (typeof pin !== "string" || !/^[a-f0-9]{64}$/.test(pin))
      )
        throw new SyncError("invalidBase");
      this.message("unlockingEncryption");
      const encrypted = await openEncryptedStore(
        store,
        await this.settings.password(root, config),
        {
          pin: pin as string | undefined,
          signal: this.abort.signal,
        },
      );
      await this.ctx.storage.global.set(`vault:${key}`, encrypted.fingerprint);
      await testConnection(encrypted);
      checkAbort(this.abort.signal);
      if (kind === "test") {
        this.message("tested");
        return;
      }
      const base = parseBase(await this.ctx.storage.global.get(key));
      const result = await synchronize({
        store: encrypted,
        local: new Workspace(
          this.api,
          root,
          this.ctx.storage.global,
          this.abort.signal,
        ),
        base,
        signal: this.abort.signal,
        saveBase: (next) => this.ctx.storage.global.set(key, next),
        progress: (phase, current, total) => {
          this.state.progress = total ? current / total : null;
          this.message(phase, false, current, total);
        },
      });
      const at = new Date().toISOString();
      await this.ctx.storage.global.set(`last:${key}`, { at, result });
      if ((await this.api.files.root()) !== root) {
        await this.refresh();
        return;
      }
      this.state.result = result;
      this.state.lastRun = at;
      // Only what happened: "uploaded 2, 1 conflict copy".
      const parts = (
        [
          ["doneUploaded", result.uploaded],
          ["doneDownloaded", result.downloaded],
          ["doneConflicts", result.conflicts.length],
          ["doneDeferred", result.deferred.length],
        ] as const
      )
        .filter(([, n]) => n > 0)
        .map(([key, n]) => this.t(key, n));
      if (parts.length)
        this.message("done", false, parts.join(this.t("listSeparator")));
      else this.message("unchanged");
    } catch (error) {
      this.fail(error);
    } finally {
      this.state.busy = false;
      this.state.progress = null;
      this.abort = undefined;
      this.broadcast();
      this.schedule();
    }
  }
  private async receive(message: unknown) {
    if (!message || typeof message !== "object") return;
    const m = message as {
      type?: string;
      config?: Partial<Config>;
      credentials?: ConnectionInput;
    };
    try {
      if (m.type === "ready") {
        this.broadcast();
        return;
      }
      if (m.type === "cancel") {
        this.abort?.abort();
        this.message("cancelling");
        return;
      }
      if (this.state.busy) throw new SyncError("busy");
      if (m.type === "save" && m.config && m.credentials) {
        const root = await this.api.files.root();
        if (!root || root !== this.state.root)
          throw new SyncError("rootChanged");
        this.state.busy = true;
        this.broadcast();
        try {
          await this.settings.save(root, m.config, m.credentials);
          await this.refresh();
          for (const view of this.views) this.send(view, { type: "saved" });
          this.message("saved");
        } finally {
          this.state.busy = false;
          this.broadcast();
        }
      } else if (
        m.type === "sync" ||
        m.type === "test" ||
        m.type === "unlock"
      ) {
        await this.operation(m.type);
      }
    } catch (error) {
      this.fail(error);
    }
  }
  async resolve(view: Textus.Webview) {
    this.views.add(view);
    view.onDidReceiveMessage((m) => {
      void this.receive(m);
    });
    view.onDidDispose(() => this.views.delete(view));
    view.html = await this.ctx.plugin.readText("panel.html");
  }
  async start() {
    const { api, ctx } = this;
    ctx.subscriptions.push(
      api.commands.register(`${ID}.open`, () =>
        api.layout.openView(`${ID}.panel`),
      ),
      api.commands.register(`${ID}.sync`, () => this.operation("sync")),
      api.views.registerWebview(`${ID}.panel`, {
        resolve: (view) => this.resolve(view),
      }),
      api.views.registerSettingsPage({ resolve: (view) => this.resolve(view) }),
      api.files.onDidChangeRoot(({ path }) => {
        if (path === this.state.root) return;
        this.abort?.abort();
        void this.refresh().catch((e) => this.fail(e));
      }),
      { dispose: () => this.stop() },
    );
    await this.refresh();
  }
  stop() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.abort?.abort();
  }
}

let controller: Controller | undefined;
export function activate(ctx: Textus.PluginContext) {
  controller = new Controller(ctx, textus);
  return controller.start();
}
export function deactivate() {
  controller?.stop();
}
