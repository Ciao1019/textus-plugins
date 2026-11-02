import { expect, it } from "vitest";
import { normalizeConfig } from "./config";
import { Settings } from "./settings";

function fixture() {
  const global = new Map<string, unknown>(),
    secrets = new Map<string, string>();
  const ctx = {
    storage: {
      global: {
        get: async (k: string) => global.get(k),
        set: async (k: string, v: unknown) => {
          global.set(k, v);
        },
      },
    },
    secrets: {
      get: async (k: string) => secrets.get(k),
      set: async (k: string, v: string) => {
        secrets.set(k, v);
      },
    },
  };
  return {
    global,
    secrets,
    settings: new Settings(ctx as unknown as Textus.PluginContext),
  };
}
const config = normalizeConfig({
  provider: "webdav",
  endpoint: "https://dav.example",
});
const encryption = {
  syncPassword: "test-only long passphrase",
  confirmPassword: "test-only long passphrase",
};
it("keeps credentials out of global config and never exposes them from load", async () => {
  const f = fixture();
  await f.settings.save("/notes", config, {
    ...encryption,
    account: "alice@example.com",
    secret: "test-secret",
  });
  expect(JSON.stringify([...f.global])).not.toContain("test-secret");
  expect(JSON.stringify([...f.global])).not.toContain(encryption.syncPassword);
  expect(await f.settings.password("/notes", config)).toBe(
    encryption.syncPassword,
  );
  expect(JSON.stringify([...f.global])).not.toContain("alice@example.com");
  expect(await f.settings.load("/notes")).toEqual(config);
  expect(f.secrets.size).toBe(1);
});
it("requires fresh credentials when the destination or account changes", async () => {
  const f = fixture();
  await f.settings.save("/notes", config, {
    ...encryption,
    account: "alice",
    secret: "test-secret",
  });
  await expect(
    f.settings.save(
      "/notes",
      { ...config, endpoint: "https://other.example" },
      { account: "", secret: "" },
    ),
  ).rejects.toThrow("credentialsRequired");
  await expect(
    f.settings.save("/notes", config, { account: "bob", secret: "" }),
  ).rejects.toThrow("credentialsRequired");
});
it("keeps connections and baselines isolated by workspace and remote target", async () => {
  const f = fixture();
  for (const [root, c] of [
    ["/notes", config],
    ["/other", config],
    ["/notes", { ...config, prefix: "other" }],
  ] as const)
    await f.settings.save(root, c, {
      account: "alice",
      secret: "test-secret",
      ...encryption,
    });
  expect(await f.settings.baseKey("/notes", config)).not.toBe(
    await f.settings.baseKey("/other", config),
  );
  expect(await f.settings.baseKey("/notes", config)).not.toBe(
    await f.settings.baseKey("/notes", { ...config, prefix: "other" }),
  );
  const firstAccount = await f.settings.baseKey("/notes", config);
  await f.settings.save("/notes", config, {
    account: "bob",
    secret: "different-secret",
  });
  expect(await f.settings.baseKey("/notes", config)).not.toBe(firstAccount);
});
it("requires matching sync passwords before saving anything and preserves them on blank edits", async () => {
  const f = fixture();
  await expect(
    f.settings.save("/notes", config, {
      account: "alice",
      secret: "test-secret",
    }),
  ).rejects.toThrow("syncPasswordRequired");
  await expect(
    f.settings.save("/notes", config, {
      account: "alice",
      secret: "test-secret",
      ...encryption,
      confirmPassword: "different",
    }),
  ).rejects.toThrow("syncPasswordMismatch");
  expect(f.secrets.size).toBe(0);
  expect(f.global.size).toBe(0);
  await f.settings.save("/notes", config, {
    account: "alice",
    secret: "test-secret",
    ...encryption,
  });
  await f.settings.save(
    "/notes",
    { ...config, automatic: true },
    { account: "", secret: "", syncPassword: "", confirmPassword: "" },
  );
  expect(await f.settings.password("/notes", config)).toBe(
    encryption.syncPassword,
  );
});
it("requires adding a sync password to an old connection and uses a separate encrypted baseline", async () => {
  const f = fixture();
  await f.settings.save("/notes", config, {
    account: "alice",
    secret: "test-secret",
    ...encryption,
  });
  const key = [...f.secrets.keys()][0];
  f.secrets.set(
    key,
    JSON.stringify({ account: "alice", secret: "test-secret" }),
  );
  await expect(f.settings.password("/notes", config)).rejects.toThrow(
    "syncPasswordRequired",
  );
  await f.settings.save("/notes", config, {
    account: "",
    secret: "",
    ...encryption,
  });
  expect(await f.settings.password("/notes", config)).toBe(
    encryption.syncPassword,
  );
  expect(await f.settings.baseKey("/notes", config)).toMatch(
    /^encrypted-base:/,
  );
});
it("does not reuse a service credential as the sync password", async () => {
  const f = fixture();
  await expect(
    f.settings.save("/notes", config, {
      account: "alice",
      secret: encryption.syncPassword,
      ...encryption,
    }),
  ).rejects.toThrow("syncPasswordSeparate");
  expect(f.secrets.size).toBe(0);
});
