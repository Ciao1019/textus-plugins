import {
  CHUNK_SIZE,
  MAX_FILE_SIZE,
  MAX_FILES,
  MAX_MANIFEST_SIZE,
  FORMAT,
  SyncError,
  type Entry,
  type Manifest,
  type Base,
} from "./model";
import { inScope } from "./config";

export async function hash(bytes: Uint8Array): Promise<string> {
  const sum = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(sum), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function describe(bytes: Uint8Array): Promise<Entry> {
  if (bytes.length > MAX_FILE_SIZE) throw new SyncError("tooLarge");
  const blocks = [];
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    blocks.push({ hash: await hash(chunk), size: chunk.length });
  }
  return { hash: await hash(bytes), size: bytes.length, blocks };
}
export function parseManifest(raw: Uint8Array): Manifest {
  try {
    if (raw.length > MAX_MANIFEST_SIZE) throw new Error();
    const value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(raw),
    );
    if (
      value.format !== FORMAT ||
      typeof value.revision !== "string" ||
      typeof value.updatedAt !== "string" ||
      !value.files ||
      Array.isArray(value.files)
    )
      throw new Error();
    const keys = Object.keys(value.files);
    if (keys.length > MAX_FILES) throw new Error();
    const folded = new Set<string>();
    for (const path of keys) {
      const canonical = path.normalize("NFC").toLowerCase();
      if (!inScope(path) || folded.has(canonical)) throw new Error();
      folded.add(canonical);
      const e = value.files[path];
      if (
        !e ||
        !/^[a-f0-9]{64}$/.test(e.hash) ||
        !Number.isSafeInteger(e.size) ||
        e.size < 0 ||
        e.size > MAX_FILE_SIZE ||
        !Array.isArray(e.blocks) ||
        e.blocks.length > Math.ceil(MAX_FILE_SIZE / CHUNK_SIZE)
      )
        throw new Error();
      let total = 0;
      for (const b of e.blocks) {
        if (
          !b ||
          !/^[a-f0-9]{64}$/.test(b.hash) ||
          !Number.isSafeInteger(b.size) ||
          b.size <= 0 ||
          b.size > CHUNK_SIZE
        )
          throw new Error();
        total += b.size;
      }
      if (total !== e.size) throw new Error();
    }
    return value;
  } catch {
    throw new SyncError("invalidManifest");
  }
}
export function parseBase(raw: unknown): Base {
  if (raw == null) return { format: FORMAT, files: Object.create(null) };
  const b = raw as Base;
  if (
    b.format !== FORMAT ||
    !b.files ||
    Array.isArray(b.files) ||
    Object.entries(b.files).some(
      ([p, h]) => !inScope(p) || !/^[a-f0-9]{64}$/.test(h),
    )
  )
    throw new SyncError("invalidBase");
  return b;
}
