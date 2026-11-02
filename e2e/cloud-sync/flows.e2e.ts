import { expect, test, type Browser, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import JSZip from "jszip";

const plugin = resolve("plugins/catvinci.cloud-sync");
const syncPassword = "test-only encrypted workspace passphrase";
const current = JSON.parse(
  readFileSync(`${plugin}/textus-plugin.json`, "utf8"),
);
const zip = await JSZip.loadAsync(
  readFileSync(`dist/${current.id}-${current.version}.zip`),
);
const manifest = JSON.parse(
  await zip.file("textus-plugin.json")!.async("string"),
);
const files = Object.fromEntries(
  await Promise.all(
    Object.values(zip.files)
      .filter((file) => !file.dir)
      .map(async (file) => [file.name, await file.async("string")]),
  ),
);

async function evidence(page: Page, name: string, focus = "header") {
  if (process.env.CAPTURE_EVIDENCE !== "1") return;
  const browser = test.info().project.name;
  const directory = resolve("docs/cloud-sync/screenshots");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    resolve(directory, `${browser}-version.txt`),
    `${page.context().browser()!.version()}\n`,
  );
  if (browser !== "webkit") return;
  await page
    .frameLocator(".plugin-webview-frame")
    .locator(focus)
    .evaluate((element) => element.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: resolve(directory, `${name}-${browser}.png`) });
}

interface Request {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  bodyBase64?: boolean;
}
class Remote {
  files = new Map<string, Buffer>();
  failure: number | null = null;
  methods: string[] = [];
  async request(req: Request) {
    const path = new URL(req.url).pathname,
      method = req.method;
    this.methods.push(method);
    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), v]),
    );
    const body = Buffer.from(
      req.body ?? "",
      req.bodyBase64 ? "base64" : "utf8",
    );
    const response = (status: number, data: Buffer = Buffer.alloc(0)) => ({
      status,
      headers: {},
      body: data.toString("base64"),
    });
    if (this.failure) return response(this.failure);
    if (method === "MKCOL") return response(405);
    if (method === "GET" || method === "HEAD")
      return response(
        this.files.has(path) ? 200 : 404,
        method === "GET" ? this.files.get(path) : undefined,
      );
    if (method === "PUT") {
      if (headers["if-none-match"] === "*" && this.files.has(path))
        return response(412);
      this.files.set(path, body);
      return response(201);
    }
    if (method === "MOVE") {
      const destination = new URL(headers.destination).pathname;
      if (headers.overwrite === "F" && this.files.has(destination))
        return response(409);
      this.files.set(destination, this.files.get(path)!);
      this.files.delete(path);
      return response(201);
    }
    if (method === "DELETE") {
      this.files.delete(path);
      return response(204);
    }
    return response(405);
  }
}
async function emit(page: Page, name: string, payload?: string) {
  await page.evaluate(
    ({ name, payload }) => {
      const w = window as unknown as {
        __devEmitTauriEvent: (name: string, payload?: string) => void;
      };
      w.__devEmitTauriEvent(name, payload);
    },
    { name, payload },
  );
}
async function open(
  page: Page,
  remote: Remote,
  initial: Record<string, string>,
  language = "en",
) {
  await page.addInitScript(
    ({ manifest, files, initial, language }) => {
      if (window.top !== window) return;
      const w = window as unknown as Record<string, unknown>;
      w.__devPlugins = [
        {
          id: manifest.id,
          dir: `/plugins/${manifest.id}`,
          manifest: JSON.stringify(manifest),
          dev: false,
          files,
        },
      ];
      w.__devPluginState = {
        allOn: true,
        plugins: {
          [manifest.id]: { enabled: true, granted: manifest.permissions },
        },
      };
      w.__devFs = initial;
      w.__devPickFolder = "/work/notes";
      localStorage.setItem(
        "catvinci-settings",
        JSON.stringify({
          language,
          languageChosen: true,
          onboardingShown: true,
        }),
      );
    },
    { manifest, files, initial, language },
  );
  await page.exposeFunction("fixtureCloudRequest", (request: Request) =>
    remote.request(request),
  );
  await page.goto("/");
  await page.locator('[data-active-tab="true"] .ProseMirror').waitFor();
  await page.evaluate(() => {
    const w = window as unknown as {
      __TAURI_INTERNALS__: {
        invoke: (
          name: string,
          args?: Record<string, unknown>,
        ) => Promise<unknown>;
      };
      fixtureCloudRequest: (request: unknown) => Promise<unknown>;
    };
    const original = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = (name, args) =>
      name === "plugin_http"
        ? w.fixtureCloudRequest(args?.request)
        : original(name, args);
  });
  await emit(page, "menu-open-folder");
  await expect(page.locator(".sidebar .tree-root-label")).toHaveText("notes");
  await emit(page, "menu-plugin-command", `${manifest.id}.open`);
  const panel = page.frameLocator(".plugin-webview-frame");
  await expect(panel.locator("[data-provider=s3]")).toBeEnabled();
  return panel;
}
async function configure(
  page: Page,
  provider: "s3" | "webdav" | "nutstore",
  password = syncPassword,
) {
  const panel = page.frameLocator(".plugin-webview-frame");
  await panel.locator(`[data-provider=${provider}]`).click();
  if (provider !== "nutstore")
    await panel.locator("#endpoint").fill("https://fixture.invalid/dav");
  if (provider === "s3") await panel.locator("#bucket").fill("test-bucket");
  await panel.locator("#account").fill("fixture-account");
  await panel.locator("#secret").fill("fixture-secret");
  await panel.locator("#sync-password").fill(password);
  await panel.locator("#confirm-password").fill(password);
  await panel.locator("#save").click();
  await expect(panel.locator("#secret")).toHaveValue("");
  await expect(panel.locator("#sync-password")).toHaveValue("");
  await expect(panel.locator("#confirm-password")).toHaveValue("");
  await expect(panel.locator("#sync")).toBeEnabled();
  return panel;
}
async function sync(page: Page) {
  const panel = page.frameLocator(".plugin-webview-frame");
  await panel.locator("#sync").click();
  await expect(panel.locator("#status")).toContainText(
    /Synced|No changes|同步完成|所有文件已同步/,
  );
  await expect(panel.locator("#sync")).toBeEnabled();
}
async function device(
  browser: Browser,
  baseURL: string,
  remote: Remote,
  docs: Record<string, string>,
) {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1180, height: 820 },
  });
  const page = await context.newPage();
  await open(page, remote, docs);
  return { context, page };
}

for (const provider of ["s3", "webdav", "nutstore"] as const) {
  test(`${provider}: the packaged plugin saves secrets, connects, and syncs through Textus's sandbox`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const remote = new Remote();
    await open(page, remote, { "/work/notes/note.md": "# Hello from Textus" });
    const panel = await configure(page, provider);
    await panel.locator("#test").click();
    await expect(panel.locator("#status")).toContainText("Connection passed");
    await sync(page);
    await evidence(page, `${provider}-sync-success`);
    expect(
      [...remote.files.keys()].some((key) => key.endsWith("/v2/head.bin")),
    ).toBe(true);
    const state = await page.evaluate(() =>
      JSON.stringify(
        (window as unknown as Record<string, unknown>).__devPluginStore,
      ),
    );
    expect(state).not.toContain("fixture-secret");
    expect(state).not.toContain("fixture-account");
    expect(state).not.toContain(syncPassword);
    const remoteBytes = [...remote.files.values()]
      .map((b) => b.toString())
      .join("\n");
    for (const value of [syncPassword, "note.md", "# Hello from Textus"])
      expect(remoteBytes).not.toContain(value);
    expect(
      [...remote.files.values()].map((b) => b.toString()).join("\n"),
    ).not.toContain("fixture-secret");
    await sync(page);
    await expect(panel.locator("#status")).toHaveText("No changes to sync.");
    expect(errors).toEqual([]);
  });
}

test("two Textus devices exchange changes and preserve a concurrent edit as a conflict copy", async ({
  browser,
  baseURL,
}) => {
  const remote = new Remote();
  const a = await device(browser, baseURL!, remote, {
    "/work/notes/note.md": "base",
  });
  const b = await device(browser, baseURL!, remote, {});
  try {
    await configure(a.page, "webdav");
    await configure(b.page, "webdav");
    await sync(a.page);
    await sync(b.page);
    await a.page.evaluate(() => {
      (window as unknown as { __devFs: Record<string, string> }).__devFs[
        "/work/notes/note.md"
      ] = "edit A";
    });
    await b.page.evaluate(() => {
      (window as unknown as { __devFs: Record<string, string> }).__devFs[
        "/work/notes/note.md"
      ] = "edit B";
    });
    await sync(a.page);
    await sync(b.page);
    await evidence(b.page, "conflict-copies");
    await sync(a.page);
    const aFiles = await a.page.evaluate(
      () => (window as unknown as Record<string, unknown>).__devFs,
    );
    const bFiles = await b.page.evaluate(
      () => (window as unknown as Record<string, unknown>).__devFs,
    );
    expect(aFiles).toEqual(bFiles);
    expect(Object.values(aFiles as object).sort()).toEqual([
      "edit A",
      "edit B",
    ]);
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

test("configuration errors preserve input and Chinese UI fits narrow and dark views", async ({
  page,
}) => {
  const remote = new Remote();
  const panel = await open(
    page,
    remote,
    { "/work/notes/note.md": "# 示例" },
    "zh",
  );
  await panel.locator("[data-provider=nutstore]").click();
  await expect(panel.locator("#endpoint")).toHaveValue(
    "https://dav.jianguoyun.com/dav",
  );
  await panel.locator("#account").fill("fixture-account");
  await panel.locator("#secret").fill("fixture-secret");
  await panel.locator("#sync-password").fill(syncPassword);
  await panel.locator("#confirm-password").fill(syncPassword);
  await panel.locator("#prefix").fill("../unsafe");
  await panel.locator("#save").click();
  await expect(panel.locator("#status")).toContainText("请输入相对目录");
  await expect(panel.locator("#secret")).toHaveValue("fixture-secret");
  await panel.locator("#prefix").fill("textus/笔记");
  await panel.locator("#save").click();
  await expect(panel.locator("#secret")).toHaveValue("");
  await page.setViewportSize({ width: 560, height: 780 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const width = await panel.locator("body").evaluate((body) => ({
    content: body.scrollWidth,
    view: body.clientWidth,
  }));
  expect(width.content).toBeLessThanOrEqual(width.view);
  await page.screenshot({
    path: `test-results/cloud-sync-${test.info().project.name}-narrow.png`,
    fullPage: true,
  });
  await evidence(page, "chinese-dark-narrow", "#sync-password");
  remote.failure = 403;
  await panel.locator("#test").click();
  await expect(panel.locator("#status")).toContainText("认证或权限不足");
  await expect(panel.locator("#sync")).toBeEnabled();
});

test("automatic sync runs on its configured interval and Enter saves through the sandbox bridge", async ({
  page,
}) => {
  const remote = new Remote();
  await open(page, remote, { "/work/notes/note.md": "# Automatic" });
  const panel = await configure(page, "webdav");
  await page.clock.install();
  await panel.locator("#automatic").check();
  await panel.locator("#interval").fill("5");
  await panel.locator("#interval").press("Enter");
  await expect(panel.locator("#sync")).toBeEnabled();
  await page.clock.fastForward(5 * 60_000 + 10);
  await expect(panel.locator("#status")).toContainText("uploaded 1");
  expect(
    [...remote.files.keys()].some((key) => key.endsWith("/v2/head.bin")),
  ).toBe(true);
});

test("a wrong sync password leaves both devices unchanged, then the correct password decrypts", async ({
  browser,
  baseURL,
}) => {
  const remote = new Remote();
  const a = await device(browser, baseURL!, remote, {
    "/work/notes/private-name.md": "private document",
  });
  const b = await device(browser, baseURL!, remote, {});
  try {
    await configure(a.page, "webdav");
    await sync(a.page);
    const panel = await configure(
      b.page,
      "webdav",
      "wrong but sufficiently long password",
    );
    const before = [...remote.files].map(([k, v]) => [k, Buffer.from(v)]);
    await panel.locator("#sync").click();
    await expect(panel.locator("#status")).toContainText(
      "sync password is incorrect",
    );
    await expect(panel.locator("#sync")).toBeEnabled();
    await evidence(b.page, "wrong-password");
    expect([...remote.files]).toEqual(before);
    expect(
      await b.page.evaluate(
        () => (window as unknown as Record<string, unknown>).__devFs,
      ),
    ).toEqual({});
    await panel.locator("#sync-password").fill(syncPassword);
    await panel.locator("#confirm-password").fill(syncPassword);
    await panel.locator("#save").click();
    await expect(panel.locator("#sync-password")).toHaveValue("");
    await sync(b.page);
    expect(
      await b.page.evaluate(
        () => (window as unknown as Record<string, unknown>).__devFs,
      ),
    ).toEqual({ "/work/notes/private-name.md": "private document" });
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

test("a tampered encrypted manifest never writes local documents", async ({
  browser,
  baseURL,
}) => {
  const remote = new Remote();
  const a = await device(browser, baseURL!, remote, {
    "/work/notes/note.md": "private",
  });
  const b = await device(browser, baseURL!, remote, {});
  try {
    await configure(a.page, "s3");
    await sync(a.page);
    const key = [...remote.files.keys()].find((k) =>
      k.endsWith("/v2/head.bin"),
    )!;
    remote.files.get(key)![20] ^= 1;
    const panel = await configure(b.page, "s3");
    await panel.locator("#sync").click();
    await expect(panel.locator("#status")).toContainText(
      "Encrypted data failed authentication",
    );
    await evidence(b.page, "tamper-rejected");
    expect(
      await b.page.evaluate(
        () => (window as unknown as Record<string, unknown>).__devFs,
      ),
    ).toEqual({});
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

test("password confirmation errors retain input and an old plaintext directory is refused", async ({
  page,
}) => {
  const remote = new Remote();
  const panel = await open(page, remote, { "/work/notes/note.md": "private" });
  await panel.locator("[data-provider=webdav]").click();
  await panel.locator("#endpoint").fill("https://fixture.invalid/dav");
  await panel.locator("#account").fill("fixture-account");
  await panel.locator("#secret").fill("fixture-secret");
  await panel.locator("#sync-password").fill(syncPassword);
  await panel.locator("#confirm-password").fill("a different password");
  await panel.locator("#save").click();
  await expect(panel.locator("#status")).toContainText(
    "sync passwords do not match",
  );
  await expect(panel.locator("#sync-password")).toHaveValue(syncPassword);
  await panel.locator("#confirm-password").fill(syncPassword);
  await panel.locator("#save").click();
  await expect(panel.locator("#sync-password")).toHaveValue("");
  const old = Buffer.from(
    JSON.stringify({
      format: "textus-cloud-sync/1",
      revision: "old",
      updatedAt: "",
      files: {},
    }),
  );
  remote.files.set("/dav/textus/notes/v1/head.json", old);
  await panel.locator("#sync").click();
  await expect(panel.locator("#status")).toContainText(
    "contains unencrypted v0.1 data",
  );
  expect([...remote.files]).toEqual([["/dav/textus/notes/v1/head.json", old]]);
});
