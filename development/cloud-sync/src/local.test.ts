import { expect, it, vi } from "vitest";
import { Workspace } from "./local";
import { hash } from "./content";
import { bytes } from "./test-fixtures";

function fixture() {
  const files = new Map<string, Uint8Array>([["/notes/a.md", bytes("before")]]);
  const saved = new Map<string, unknown>();
  const storage = {
    get: async (key: string) => structuredClone(saved.get(key)),
    set: async (key: string, value: unknown) => {
      saved.set(key, structuredClone(value));
    },
  };
  let root = "/notes",
    open = false;
  const api = {
    files: {
      root: async () => root,
      list: async (p: string) =>
        [...files.keys()]
          .filter(
            (key) =>
              key.startsWith(p + "/") && !key.slice(p.length + 1).includes("/"),
          )
          .map((key) => ({ name: key.slice(p.length + 1), isDir: false })),
      stat: async (p: string) =>
        files.has(p) ? { isDir: false, size: files.get(p)!.length } : null,
      read: async (p: string) => files.get(p)!,
      create: vi.fn(async (p: string, t = "") => {
        if (files.has(p)) throw Error("exists");
        files.set(p, bytes(t));
      }),
      write: vi.fn(async (p: string, b: Uint8Array) => {
        files.set(p, b);
      }),
      process: vi.fn(async (p: string, fn: (t: string) => string) => {
        const next = fn(new TextDecoder().decode(files.get(p)));
        files.set(p, bytes(next));
        return next;
      }),
    },
    layout: { tabs: async () => (open ? [{ path: "/notes/a.md" }] : []) },
  };
  return {
    api,
    files,
    storage,
    saved,
    local: new Workspace(api as unknown as Textus.Api, "/notes", storage),
    changeRoot: () => {
      root = "/other";
    },
    open: () => {
      open = true;
    },
  };
}
it("updates closed text through Textus's version-checked processor", async () => {
  const f = fixture();
  expect(
    await f.local.apply("a.md", bytes("after"), await hash(bytes("before"))),
  ).toBe(true);
  expect(f.api.files.process).toHaveBeenCalledOnce();
  expect(f.api.files.write).not.toHaveBeenCalled();
});
it("does not touch an open document or advance the operation", async () => {
  const f = fixture();
  f.open();
  expect(
    await f.local.apply("a.md", bytes("after"), await hash(bytes("before"))),
  ).toBe("deferred");
  expect(f.api.files.process).not.toHaveBeenCalled();
});
it("never replaces existing binary data even if the expected version matches", async () => {
  const f = fixture();
  f.files.set("/notes/a.png", bytes("before"));
  expect(
    await f.local.apply("a.png", bytes("after"), await hash(bytes("before"))),
  ).toBe(false);
  expect(f.api.files.write).not.toHaveBeenCalled();
});
it("uses exclusive creation for a new binary destination", async () => {
  const f = fixture();
  expect(
    await f.local.apply("a.png", new Uint8Array([0, 128, 255]), null),
  ).toBe(true);
  expect(f.api.files.create).toHaveBeenCalledWith(
    "/notes/a.png",
    expect.stringMatching(/^Textus pending download /),
  );
  expect(f.files.get("/notes/a.png")).toEqual(new Uint8Array([0, 128, 255]));
});
it("resumes a failed binary download after restart without publishing its reservation", async () => {
  const f = fixture();
  const data = new Uint8Array([0, 128, 255]);
  f.api.files.write.mockRejectedValueOnce(Error("disk full"));
  await expect(f.local.apply("a.png", data, null)).rejects.toThrow(
    "localWriteError",
  );
  expect(f.files.get("/notes/a.png")!.length).toBeGreaterThan(0);
  const restarted = new Workspace(
    f.api as unknown as Textus.Api,
    "/notes",
    f.storage,
  );
  expect((await restarted.scan())["a.png"]).toBeUndefined();
  expect(await restarted.apply("a.png", data, null)).toBe(true);
  expect(f.api.files.create).toHaveBeenCalledOnce();
  expect(await restarted.read("a.png")).toEqual(data);
  expect([...f.saved.values()]).toEqual([{}]);
});
it("preserves an empty user file that replaces an interrupted download marker", async () => {
  const f = fixture();
  f.api.files.write.mockRejectedValueOnce(Error("disk full"));
  await expect(f.local.apply("a.png", bytes("remote"), null)).rejects.toThrow(
    "localWriteError",
  );
  f.files.set("/notes/a.png", new Uint8Array());
  const restarted = new Workspace(
    f.api as unknown as Textus.Api,
    "/notes",
    f.storage,
  );
  expect((await restarted.scan())["a.png"].size).toBe(0);
  expect(await restarted.apply("a.png", bytes("remote"), null)).toBe(false);
  expect(f.files.get("/notes/a.png")).toEqual(new Uint8Array());
});
it("does not overwrite a binary created by another writer during exclusive creation", async () => {
  const f = fixture();
  f.api.files.create.mockImplementationOnce(async (p) => {
    f.files.set(p, bytes("other writer"));
    throw Error("exists");
  });
  expect(await f.local.apply("a.png", bytes("remote"), null)).toBe(false);
  expect(f.files.get("/notes/a.png")).toEqual(bytes("other writer"));
  expect(f.api.files.write).not.toHaveBeenCalled();
  expect([...f.saved.values()]).toEqual([{}]);
});
it("refuses stale reads and folder switches without writing", async () => {
  const f = fixture();
  expect(
    await f.local.apply("a.md", bytes("after"), await hash(bytes("older"))),
  ).toBe(false);
  f.changeRoot();
  await expect(f.local.apply("a.md", bytes("after"), null)).rejects.toThrow(
    "rootChanged",
  );
  expect(f.api.files.process).not.toHaveBeenCalled();
});
