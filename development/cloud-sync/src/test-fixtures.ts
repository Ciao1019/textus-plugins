import { describe, hash } from "./content";
import {
  emptyBase,
  type Base,
  type Entry,
  type LocalFiles,
  type ObjectStore,
} from "./model";
import { synchronize } from "./engine";

export const bytes = (text: string) => new TextEncoder().encode(text);
export const text = (value: Uint8Array | null | undefined) =>
  value && new TextDecoder().decode(value);
export class MemoryStore implements ObjectStore {
  values = new Map<string, Uint8Array>();
  puts: string[] = [];
  async get(key: string) {
    return this.values.get(key)?.slice() ?? null;
  }
  async has(key: string) {
    return this.values.has(key);
  }
  async put(key: string, value: Uint8Array) {
    this.puts.push(key);
    this.values.set(key, value.slice());
  }
  async create(key: string, value: Uint8Array) {
    if (this.values.has(key)) return false;
    this.values.set(key, value.slice());
    return true;
  }
  async remove(key: string) {
    this.values.delete(key);
  }
}
export class MemoryLocal implements LocalFiles {
  files = new Map<string, Uint8Array>();
  deferred = new Set<string>();
  binary = new Set<string>();
  base: Base = emptyBase();
  beforeApply?: () => void;
  constructor(files: Record<string, string> = {}) {
    for (const [p, t] of Object.entries(files)) this.files.set(p, bytes(t));
  }
  async check() {}
  async scan() {
    const entries: Record<string, Entry> = {};
    for (const [p, value] of this.files) entries[p] = await describe(value);
    return entries;
  }
  async read(path: string) {
    return this.files.get(path)?.slice() ?? null;
  }
  async apply(path: string, value: Uint8Array, expected: string | null) {
    this.beforeApply?.();
    if (this.deferred.has(path)) return "deferred" as const;
    const old = this.files.get(path);
    if (
      (old ? await hash(old) : null) !== expected ||
      (this.binary.has(path) && !!old)
    )
      return false;
    this.files.set(path, value.slice());
    return true;
  }
  async sync(store: ObjectStore, signal?: AbortSignal) {
    return synchronize({
      local: this,
      store,
      base: this.base,
      signal,
      saveBase: async (base) => {
        this.base = base;
      },
    });
  }
}
