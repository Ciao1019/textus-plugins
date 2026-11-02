import { expect, it, vi } from "vitest";
import { ENCRYPTED_HEAD, openEncryptedStore } from "./encrypted-store";
import { hash } from "./content";
import { CHUNK_SIZE, HEAD, LOCK, blockKey, encode } from "./model";
import { MemoryLocal, MemoryStore, bytes, text } from "./test-fixtures";

const password = "test-only long sync passphrase";

it("encrypts filenames and file content while allowing two devices to sync and resolve conflicts", async () => {
  const raw = new MemoryStore();
  const first = await openEncryptedStore(raw, password);
  const a = new MemoryLocal({ "private-name.md": "private file contents" });
  await a.sync(first);
  const everything = [...raw.values]
    .map(([key, value]) => key + text(value))
    .join("\n");
  for (const plain of [
    password,
    "private-name.md",
    "private file contents",
    await hash(bytes("private file contents")),
  ])
    expect(everything).not.toContain(plain);
  expect(raw.values.has(ENCRYPTED_HEAD)).toBe(true);
  const b = new MemoryLocal();
  const second = await openEncryptedStore(raw, password);
  await b.sync(second);
  expect(text(b.files.get("private-name.md"))).toBe("private file contents");
  a.files.set("private-name.md", bytes("edit A"));
  b.files.set("private-name.md", bytes("edit B"));
  await a.sync(first);
  await b.sync(second);
  await a.sync(first);
  expect([...a.files].sort()).toEqual([...b.files].sort());
  expect([...a.files.values()].map(text).sort()).toEqual(["edit A", "edit B"]);
});

it("deduplicates encrypted blocks without exposing their original SHA-256 identifiers", async () => {
  const raw = new MemoryStore(),
    store = await openEncryptedStore(raw, password);
  const local = new MemoryLocal({ "a.md": "same", "b.md": "same" });
  await local.sync(store);
  expect(
    [...raw.values.keys()].filter((k) => k.startsWith("v2/blocks/")),
  ).toHaveLength(1);
  const before = [...raw.values].map(([k, v]) => [k, v.slice()]);
  await local.sync(store);
  expect([...raw.values]).toEqual(before);
});

it("rejects an incorrect password before creating or changing remote objects", async () => {
  const raw = new MemoryStore();
  await openEncryptedStore(raw, password);
  const create = vi.spyOn(raw, "create"),
    put = vi.spyOn(raw, "put"),
    remove = vi.spyOn(raw, "remove");
  await expect(
    openEncryptedStore(raw, "wrong password is still long"),
  ).rejects.toThrow("invalidSyncPassword");
  expect(create).not.toHaveBeenCalled();
  expect(put).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});

it("stops before changing local files or baselines when the encrypted manifest is tampered with", async () => {
  const raw = new MemoryStore(),
    store = await openEncryptedStore(raw, password);
  await new MemoryLocal({ "a.md": "private" }).sync(store);
  raw.values.get(ENCRYPTED_HEAD)![20] ^= 1;
  const b = new MemoryLocal();
  await expect(b.sync(store)).rejects.toThrow("encryptedDataInvalid");
  expect(b.files.size).toBe(0);
  expect(Object.keys(b.base.files)).toHaveLength(0);
  expect(raw.values.has(LOCK)).toBe(false);
});

it("rejects a substituted or corrupted block before writing it locally", async () => {
  const raw = new MemoryStore(),
    store = await openEncryptedStore(raw, password);
  await new MemoryLocal({ "a.md": "private" }).sync(store);
  const key = [...raw.values.keys()].find((k) => k.startsWith("v2/blocks/"))!;
  raw.values.get(key)![16] ^= 1;
  const b = new MemoryLocal();
  await expect(b.sync(store)).rejects.toThrow("encryptedDataInvalid");
  expect(b.files.size).toBe(0);
  expect(Object.keys(b.base.files)).toHaveLength(0);
  await expect(
    store.get(blockKey(await hash(bytes("private")))),
  ).rejects.toThrow("encryptedDataInvalid");
});

it("refuses legacy plaintext targets and makes old clients refuse encrypted targets", async () => {
  const plain = new MemoryStore();
  await new MemoryLocal({ "a.md": "old" }).sync(plain);
  const before = [...plain.values];
  await expect(openEncryptedStore(plain, password)).rejects.toThrow(
    "legacyRemote",
  );
  expect([...plain.values]).toEqual(before);
  const raw = new MemoryStore();
  await openEncryptedStore(raw, password);
  const oldClient = new MemoryLocal({
    "secret.md": "must not upload plaintext",
  });
  await expect(oldClient.sync(raw)).rejects.toThrow("invalidManifest");
  expect([...raw.values.keys()]).toEqual([HEAD]);
});

it("does not recreate a missing descriptor for a pinned or populated repository", async () => {
  const raw = new MemoryStore(),
    store = await openEncryptedStore(raw, password);
  raw.values.delete(HEAD);
  await expect(
    openEncryptedStore(raw, password, { pin: store.fingerprint }),
  ).rejects.toThrow("encryptionMetadataMissing");
  raw.values.set(ENCRYPTED_HEAD, bytes("previous encrypted head"));
  await expect(openEncryptedStore(raw, password)).rejects.toThrow(
    "encryptionMetadataMissing",
  );
  expect(raw.values.has(HEAD)).toBe(false);
});

it("does not initialize while another device holds the shared lock", async () => {
  const raw = new MemoryStore();
  raw.values.set(LOCK, encode({ id: "another device" }));
  await expect(openEncryptedStore(raw, password)).rejects.toThrow("locked");
  expect(raw.values.has(HEAD)).toBe(false);
  expect([...raw.values.keys()]).toEqual([LOCK]);
});

it("reuses the same descriptor after an interrupted first sync", async () => {
  const raw = new MemoryStore(),
    first = await openEncryptedStore(raw, password);
  const before = raw.values.get(HEAD)!.slice();
  const second = await openEncryptedStore(raw, password, {
    pin: first.fingerprint,
  });
  await new MemoryLocal({ "a.md": "retry" }).sync(second);
  expect(raw.values.get(HEAD)).toEqual(before);
  expect(second.fingerprint).toBe(first.fingerprint);
});
it("refuses a stale unlocked store after its encryption descriptor disappears", async () => {
  const raw = new MemoryStore(),
    store = await openEncryptedStore(raw, password);
  raw.values.delete(HEAD);
  await expect(store.put(HEAD, bytes("manifest"))).rejects.toThrow(
    "encryptionMetadataMissing",
  );
  expect(raw.values.has(ENCRYPTED_HEAD)).toBe(false);
});
it("round-trips a binary attachment across encrypted chunk boundaries", async () => {
  const raw = new MemoryStore(),
    first = await openEncryptedStore(raw, password);
  const a = new MemoryLocal(),
    binary = new Uint8Array(CHUNK_SIZE + 257);
  for (let i = 0; i < binary.length; i++) binary[i] = i % 256;
  a.files.set("attachment.pdf", binary);
  await a.sync(first);
  expect(
    [...raw.values.keys()].filter((key) => key.startsWith("v2/blocks/")),
  ).toHaveLength(2);
  const b = new MemoryLocal();
  await b.sync(await openEncryptedStore(raw, password));
  expect(Buffer.compare(b.files.get("attachment.pdf")!, binary)).toBe(0);
});
it("concurrent initialization chooses one descriptor and lets the other device retry", async () => {
  const raw = new MemoryStore();
  const outcomes = await Promise.allSettled([
    openEncryptedStore(raw, password),
    openEncryptedStore(raw, password),
  ]);
  const successful = outcomes.filter((r) => r.status === "fulfilled");
  expect(successful.length).toBeGreaterThan(0);
  for (const r of outcomes)
    if (r.status === "rejected")
      expect(r.reason).toMatchObject({ message: "locked" });
  const retry = await openEncryptedStore(raw, password);
  for (const r of successful)
    expect(r.value.fingerprint).toBe(retry.fingerprint);
  expect([...raw.values.keys()]).toEqual([HEAD]);
});
