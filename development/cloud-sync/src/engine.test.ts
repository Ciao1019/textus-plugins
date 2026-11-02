import { describe as suite, expect, it } from "vitest";
import { hash, parseManifest } from "./content";
import { synchronize } from "./engine";
import { CHUNK_SIZE, HEAD, LOCK, blockKey, encode, emptyBase } from "./model";
import { MemoryLocal, MemoryStore, bytes, text } from "./test-fixtures";

suite("workspace synchronization", () => {
  it("copies saved documents and attachments to a second device and skips unchanged content", async () => {
    const remote = new MemoryStore();
    const a = new MemoryLocal({
      "notes/你好.md": "first",
      "images/a.png": "binary",
    });
    const b = new MemoryLocal();
    expect((await a.sync(remote)).uploaded).toBe(2);
    expect((await b.sync(remote)).downloaded).toBe(2);
    expect(b.files).toEqual(a.files);
    const writes = remote.puts.length;
    expect((await a.sync(remote)).unchanged).toBe(2);
    expect(remote.puts.length).toBe(writes);
  });
  it("uses the baseline to send independent edits in both directions", async () => {
    const remote = new MemoryStore();
    const a = new MemoryLocal({ "a.md": "a", "b.md": "b" }),
      b = new MemoryLocal();
    await a.sync(remote);
    await b.sync(remote);
    a.files.set("a.md", bytes("new A"));
    b.files.set("b.md", bytes("new B"));
    await a.sync(remote);
    const result = await b.sync(remote);
    expect(result).toMatchObject({ uploaded: 1, downloaded: 1, conflicts: [] });
    await a.sync(remote);
    expect(a.files).toEqual(b.files);
  });
  it("preserves both concurrent versions and converges without creating more conflict copies", async () => {
    const remote = new MemoryStore();
    const a = new MemoryLocal({ "note.md": "base" }),
      b = new MemoryLocal();
    await a.sync(remote);
    await b.sync(remote);
    a.files.set("note.md", bytes("A edit"));
    b.files.set("note.md", bytes("B edit"));
    await a.sync(remote);
    const result = await b.sync(remote);
    expect(result.conflicts).toHaveLength(1);
    expect(text(b.files.get(result.conflicts[0]))).toBe("A edit");
    expect(text(b.files.get("note.md"))).toBe("B edit");
    await a.sync(remote);
    await b.sync(remote);
    expect(a.files).toEqual(b.files);
    expect(a.files.size).toBe(2);
  });
  it("keeps both versions on first sync when existing files disagree", async () => {
    const remote = new MemoryStore();
    await new MemoryLocal({ "note.md": "remote" }).sync(remote);
    const local = new MemoryLocal({ "note.md": "local" });
    expect((await local.sync(remote)).conflicts).toHaveLength(1);
    expect([...local.files.values()].map(text).sort()).toEqual([
      "local",
      "remote",
    ]);
  });
  it("never overwrites a pre-existing conflict copy with unrelated contents", async () => {
    const remote = new MemoryStore();
    await new MemoryLocal({ "note.md": "remote" }).sync(remote);
    const suffix = (await hash(bytes("remote"))).slice(0, 8);
    const name = `Sync conflicts/note (${suffix}).md`;
    const local = new MemoryLocal({ "note.md": "local", [name]: "keep" });
    const result = await local.sync(remote);
    expect(text(local.files.get(name))).toBe("keep");
    expect(result.conflicts[0]).not.toBe(name);
    expect(text(local.files.get(result.conflicts[0]))).toBe("remote");
  });
  it("defers open destinations without advancing their baseline or changing the remote file", async () => {
    const remote = new MemoryStore();
    const a = new MemoryLocal({ "note.md": "base" }),
      b = new MemoryLocal();
    await a.sync(remote);
    await b.sync(remote);
    a.files.set("note.md", bytes("new"));
    await a.sync(remote);
    const base = { ...b.base.files };
    b.deferred.add("note.md");
    const result = await b.sync(remote);
    expect(result.deferred).toEqual(["note.md"]);
    expect(b.base.files).toEqual(base);
    expect(text(b.files.get("note.md"))).toBe("base");
    b.deferred.clear();
    await b.sync(remote);
    expect(text(b.files.get("note.md"))).toBe("new");
  });
  it("treats binary replacement as keep-both instead of overwriting the attachment", async () => {
    const remote = new MemoryStore();
    const a = new MemoryLocal({ "a.png": "base" }),
      b = new MemoryLocal();
    await a.sync(remote);
    await b.sync(remote);
    a.files.set("a.png", bytes("new"));
    await a.sync(remote);
    b.binary.add("a.png");
    const result = await b.sync(remote);
    expect(result.conflicts).toHaveLength(1);
    expect(text(b.files.get("a.png"))).toBe("base");
    expect(text(b.files.get(result.conflicts[0]))).toBe("new");
  });
  it("does not turn a local deletion into remote data loss", async () => {
    const remote = new MemoryStore(),
      a = new MemoryLocal({ "a.md": "keep" });
    await a.sync(remote);
    a.files.delete("a.md");
    await a.sync(remote);
    expect(text(a.files.get("a.md"))).toBe("keep");
  });
  it("publishes no partial manifest or baseline when a block upload fails, then resumes", async () => {
    const remote = new MemoryStore(),
      a = new MemoryLocal({ "a.md": "old" });
    await a.sync(remote);
    const head = await remote.get(HEAD),
      base = a.base;
    a.files.set("a.md", bytes("new"));
    const put = remote.put.bind(remote);
    remote.put = async (key, value) => {
      if (key.includes("/blocks/")) throw Error("offline");
      await put(key, value);
    };
    await expect(a.sync(remote)).rejects.toThrow("offline");
    expect(await remote.get(HEAD)).toEqual(head);
    expect(a.base).toBe(base);
    expect(await remote.has(LOCK)).toBe(false);
    remote.put = put;
    expect((await a.sync(remote)).uploaded).toBe(1);
  });
  it("rejects a corrupt remote block before changing local content", async () => {
    const remote = new MemoryStore();
    await new MemoryLocal({ "a.md": "valid" }).sync(remote);
    remote.values.set(blockKey(await hash(bytes("valid"))), bytes("corrupt"));
    const b = new MemoryLocal();
    await expect(b.sync(remote)).rejects.toThrow("integrityError");
    expect(b.files.size).toBe(0);
    expect(b.base).toEqual(emptyBase());
  });
  it("refuses concurrent writers and preserves a lock belonging to another run", async () => {
    const remote = new MemoryStore();
    const lock = encode({ id: "other" });
    remote.values.set(LOCK, lock);
    await expect(new MemoryLocal({ "a.md": "a" }).sync(remote)).rejects.toThrow(
      "locked",
    );
    expect(await remote.get(LOCK)).toEqual(lock);
    expect(await remote.has(HEAD)).toBe(false);
  });
  it("detects manual lock replacement before publishing and leaves the new lock alone", async () => {
    const remote = new MemoryStore(),
      local = new MemoryLocal({ "a.md": "a" });
    await expect(
      synchronize({
        local,
        store: remote,
        base: emptyBase(),
        saveBase: async () => {},
        progress: (phase) => {
          if (phase === "transferring")
            remote.values.set(LOCK, encode({ id: "replacement" }));
        },
      }),
    ).rejects.toThrow("lockLost");
    expect(await remote.has(HEAD)).toBe(false);
    expect(text(await remote.get(LOCK))).toContain("replacement");
  });
  it("cancellation releases the lock and leaves the baseline unadvanced", async () => {
    const remote = new MemoryStore(),
      local = new MemoryLocal({ "a.md": "a" }),
      abort = new AbortController();
    await expect(
      synchronize({
        local,
        store: remote,
        base: local.base,
        signal: abort.signal,
        saveBase: async () => {
          throw new Error("must not save");
        },
        progress: (phase) => {
          if (phase === "scanning") abort.abort();
        },
      }),
    ).rejects.toThrow("cancelled");
    expect(await remote.has(LOCK)).toBe(false);
    expect(await remote.has(HEAD)).toBe(false);
  });
  it("deduplicates blocks shared between files and verifies the assembled binary", async () => {
    const remote = new MemoryStore(),
      a = new MemoryLocal();
    const data = new Uint8Array(CHUNK_SIZE * 2 + 17).fill(37);
    a.files.set("a.pdf", data);
    a.files.set("b.pdf", data);
    await a.sync(remote);
    expect(remote.puts.filter((p) => p.includes("/blocks/"))).toHaveLength(2);
    const b = new MemoryLocal();
    await b.sync(remote);
    expect(Buffer.compare(b.files.get("a.pdf")!, data)).toBe(0);
  });
  it("keeps every published manifest as a recoverable snapshot", async () => {
    const remote = new MemoryStore(),
      a = new MemoryLocal({ "a.md": "first" });
    await a.sync(remote);
    const previous = parseManifest((await remote.get(HEAD))!);
    a.files.set("a.md", bytes("second"));
    await a.sync(remote);
    expect(
      parseManifest(
        (await remote.get(`v1/snapshots/${previous.revision}.json`))!,
      ),
    ).toEqual(previous);
  });
  it("stops when a previously joined remote repository disappears", async () => {
    const remote = new MemoryStore(),
      a = new MemoryLocal({ "a.md": "first" });
    await a.sync(remote);
    remote.values.delete(HEAD);
    await expect(a.sync(remote)).rejects.toThrow("remoteMissing");
    expect(await remote.has(HEAD)).toBe(false);
  });
  it("refuses case-colliding paths before any download", async () => {
    const remote = new MemoryStore();
    await new MemoryLocal({ "Note.md": "remote" }).sync(remote);
    const local = new MemoryLocal({ "note.md": "local" });
    await expect(local.sync(remote)).rejects.toThrow("caseCollision");
    expect(local.files.size).toBe(1);
  });
  it("retains a local edit made between scanning and applying a download", async () => {
    const remote = new MemoryStore(),
      a = new MemoryLocal({ "a.md": "base" }),
      b = new MemoryLocal();
    await a.sync(remote);
    await b.sync(remote);
    a.files.set("a.md", bytes("remote"));
    await a.sync(remote);
    b.beforeApply = () => {
      b.files.set("a.md", bytes("edited while syncing"));
      b.beforeApply = undefined;
    };
    const result = await b.sync(remote);
    expect(text(b.files.get("a.md"))).toBe("edited while syncing");
    expect(result.deferred).toEqual(["a.md"]);
    expect(text(b.files.get(result.conflicts[0]))).toBe("remote");
  });
});
