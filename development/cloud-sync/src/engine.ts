import { describe, hash, parseManifest } from "./content";
import { conflictPath, plan } from "./planner";
import {
  FORMAT,
  HEAD,
  LOCK,
  MAX_MANIFEST_SIZE,
  SyncError,
  blockKey,
  encode,
  checkAbort,
  type Base,
  type Entry,
  type LocalFiles,
  type Manifest,
  type ObjectStore,
  type Result,
} from "./model";

type Progress = (phase: string, current: number, total: number) => void;
interface Options {
  local: LocalFiles;
  store: ObjectStore;
  base: Base;
  saveBase: (base: Base) => Promise<void>;
  signal?: AbortSignal;
  progress?: Progress;
}

async function download(
  store: ObjectStore,
  entry: Entry,
  signal?: AbortSignal,
) {
  const bytes = new Uint8Array(entry.size);
  let offset = 0;
  for (const block of entry.blocks) {
    checkAbort(signal);
    const chunk = await store.get(blockKey(block.hash));
    if (
      !chunk ||
      chunk.length !== block.size ||
      (await hash(chunk)) !== block.hash
    )
      throw new SyncError("integrityError");
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if ((await hash(bytes)) !== entry.hash) throw new SyncError("integrityError");
  return bytes;
}

async function upload(
  store: ObjectStore,
  entry: Entry,
  bytes: Uint8Array,
  known: Set<string>,
  signal?: AbortSignal,
) {
  let offset = 0;
  for (const block of entry.blocks) {
    checkAbort(signal);
    if (!known.has(block.hash)) {
      const key = blockKey(block.hash);
      if (!(await store.has(key)))
        await store.put(key, bytes.subarray(offset, offset + block.size));
      // A stored block's name alone is not proof of its contents.
      const actual = await store.get(key);
      if (!actual || (await hash(actual)) !== block.hash)
        throw new SyncError("integrityError");
      known.add(block.hash);
    }
    offset += block.size;
  }
}

export async function synchronize(options: Options): Promise<Result> {
  const { local, store, signal } = options;
  const progress = options.progress ?? (() => {});
  const owner = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
  };
  checkAbort(signal);
  await local.check();
  progress("locking", 0, 0);
  if (!(await store.create(LOCK, encode(owner)))) throw new SyncError("locked");
  const ownLock = async () => {
    const raw = await store.get(LOCK);
    if (
      !raw ||
      new TextDecoder().decode(raw) !== new TextDecoder().decode(encode(owner))
    )
      throw new SyncError("lockLost");
  };
  let completed = false;
  try {
    await ownLock();
    const raw = await store.get(HEAD);
    const remote: Manifest = raw
      ? parseManifest(raw)
      : {
          format: FORMAT,
          revision: "",
          updatedAt: "",
          files: Object.create(null),
        };
    // A previously joined folder must never silently recreate a missing repository.
    if (!raw && Object.keys(options.base.files).length)
      throw new SyncError("remoteMissing");
    progress("scanning", 0, 0);
    const files = await local.scan();
    checkAbort(signal);
    const next: Manifest = { ...remote, files: { ...remote.files } };
    const base: Base = { format: FORMAT, files: { ...options.base.files } };
    const known = new Set<string>();
    const result: Result = {
      uploaded: 0,
      downloaded: 0,
      conflicts: [],
      deferred: [],
      unchanged: 0,
    };
    const actions = plan(files, remote.files, base.files);
    const names = new Map<string, string>();
    for (const a of actions) {
      const folded = a.path.normalize("NFC").toLowerCase();
      if (names.has(folded) && names.get(folded) !== a.path)
        throw new SyncError("caseCollision");
      names.set(folded, a.path);
    }
    const keepRemote = async (
      path: string,
      entry: Entry,
      bytes: Uint8Array,
    ) => {
      const candidate = conflictPath(path, entry.hash);
      let target = candidate;
      for (let attempt = 0; attempt < 4; attempt++) {
        const existing = await local.read(target);
        const remoteExisting = next.files[target];
        const collision = names.get(target.normalize("NFC").toLowerCase());
        if (
          (!collision || collision === target) &&
          (!remoteExisting || remoteExisting.hash === entry.hash) &&
          (existing
            ? (await hash(existing)) === entry.hash
            : (await local.apply(target, bytes, null)) === true)
        ) {
          next.files[target] = entry;
          base.files[target] = entry.hash;
          names.set(target.normalize("NFC").toLowerCase(), target);
          result.conflicts.push(target);
          return;
        }
        const dot = candidate.lastIndexOf(".");
        target = `${candidate.slice(0, dot)}-${crypto.randomUUID()}${candidate.slice(dot)}`;
      }
      throw new SyncError("localChanged");
    };
    for (let i = 0; i < actions.length; i++) {
      checkAbort(signal);
      await local.check();
      const { path, kind } = actions[i];
      progress("transferring", i, actions.length);
      const l = files[path],
        r = remote.files[path];
      if (kind === "equal") {
        base.files[path] = l.hash;
        result.unchanged++;
        continue;
      }
      if (kind === "download" || kind === "conflict") {
        const bytes = await download(store, r, signal);
        checkAbort(signal);
        const applied =
          kind === "download" &&
          (await local.apply(path, bytes, l?.hash ?? null));
        if (applied === "deferred") {
          result.deferred.push(path);
          continue;
        }
        if (applied === true) {
          base.files[path] = r.hash;
          result.downloaded++;
          continue;
        }
        // Binary replacements and concurrent edits are also kept as two files.
        await keepRemote(path, r, bytes);
        if (kind === "download" && !l) {
          result.deferred.push(path);
          continue;
        }
      }
      const current = await local.read(path);
      if (!l || !current || (await hash(current)) !== l.hash) {
        result.deferred.push(path);
        continue;
      }
      await upload(store, l, current, known, signal);
      next.files[path] = l;
      base.files[path] = l.hash;
      result.uploaded++;
    }
    checkAbort(signal);
    await local.check();
    await ownLock();
    progress("publishing", actions.length, actions.length);
    if (!raw || JSON.stringify(next.files) !== JSON.stringify(remote.files)) {
      next.revision = crypto.randomUUID();
      next.updatedAt = new Date().toISOString();
      const document = encode(next);
      if (document.length > MAX_MANIFEST_SIZE)
        throw new SyncError("tooManyFiles");
      parseManifest(document);
      // Content and the immutable recovery manifest land before the shared head.
      await store.put(`v1/snapshots/${next.revision}.json`, document);
      await ownLock();
      await store.put(HEAD, document);
      const committed = await store.get(HEAD);
      if (!committed || (await hash(committed)) !== (await hash(document)))
        throw new SyncError("integrityError");
    }
    await options.saveBase(base);
    completed = true;
    return result;
  } finally {
    // Cancellation cannot prevent releasing our lock. A lock belonging to a
    // replacement run is never removed, even after manual recovery elsewhere.
    try {
      await ownLock();
      await store.remove(LOCK);
    } catch {
      if (completed) throw new SyncError("unlockFailed");
    }
  }
}

export { describe };
