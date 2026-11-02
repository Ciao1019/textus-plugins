import { descend, inScope, isText } from "./config";
import { describe, hash } from "./content";
import { Reservations } from "./reservations";
import {
  MAX_FILES,
  MAX_FILE_SIZE,
  SyncError,
  checkAbort,
  type Entry,
  type LocalFiles,
} from "./model";

export class Workspace implements LocalFiles {
  private reservations: Reservations;
  constructor(
    private api: Textus.Api,
    readonly root: string,
    storage: Pick<Textus.StoragePlace, "get" | "set">,
    private signal?: AbortSignal,
  ) {
    this.reservations = new Reservations(storage, root);
  }
  async check() {
    checkAbort(this.signal);
    if ((await this.api.files.root()) !== this.root)
      throw new SyncError("rootChanged");
  }
  private path(relative: string) {
    if (!inScope(relative)) throw new SyncError("invalidPath");
    return `${this.root.replace(/[/\\]$/, "")}/${relative}`;
  }
  private async open(path: string) {
    const canonical = (p: string) => p.replace(/\\/g, "/").normalize("NFC");
    return (await this.api.layout.tabs()).some(
      (tab) => tab.path && canonical(tab.path) === canonical(path),
    );
  }
  private async readRaw(relative: string): Promise<Uint8Array | null> {
    await this.check();
    const path = this.path(relative);
    const stat = await this.api.files.stat(path);
    if (!stat) return null;
    if (stat.isDir) throw new SyncError("pathIsDirectory", [relative]);
    if (stat.size > MAX_FILE_SIZE) throw new SyncError("tooLarge", [relative]);
    const bytes = await this.api.files.read(path);
    if (bytes.length > MAX_FILE_SIZE)
      throw new SyncError("tooLarge", [relative]);
    return bytes;
  }
  async read(relative: string): Promise<Uint8Array | null> {
    const bytes = await this.readRaw(relative);
    const marker = await this.reservations.get(relative);
    if (bytes && marker) {
      if (this.reservations.matches(bytes, marker)) return null;
      // A replaced marker is real content, including a user's empty file.
      await this.reservations.clear(relative);
    }
    return bytes;
  }
  private async createBinary(relative: string, bytes: Uint8Array) {
    const path = this.path(relative);
    const marker = await this.reservations.reserve(relative);
    const existing = await this.readRaw(relative);
    if (!existing) {
      try {
        await this.api.files.create(path, marker);
      } catch {
        const current = await this.readRaw(relative);
        if (!current) throw new SyncError("localWriteError", [relative]);
        if (!this.reservations.matches(current, marker)) {
          await this.reservations.clear(relative);
          return false;
        }
      }
    }
    const reserved = await this.readRaw(relative);
    if (!reserved || !this.reservations.matches(reserved, marker)) {
      await this.reservations.clear(relative);
      return false;
    }
    await this.check();
    if (await this.open(path)) return "deferred" as const;
    try {
      await this.api.files.write(path, bytes);
    } catch {
      // Keep the marker journal and stop before publishing a partial download.
      throw new SyncError("localWriteError", [relative]);
    }
    return true;
  }
  async scan(): Promise<Record<string, Entry>> {
    const files: Record<string, Entry> = Object.create(null);
    let visits = 0;
    const add = async (rel: string) => {
      const bytes = await this.read(rel);
      if (bytes) files[rel] = await describe(bytes);
    };
    const walk = async (relative = "") => {
      await this.check();
      if (++visits > MAX_FILES || relative.split("/").length > 48)
        throw new SyncError("tooManyFiles");
      const dir = relative ? `${this.root}/${relative}` : this.root;
      for (const entry of await this.api.files.list(dir)) {
        const rel = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDir) {
          if (
            descend(rel) ||
            /^\.textus\/(library|memory|skills)(\/|$)/.test(rel)
          )
            await walk(rel);
        } else if (inScope(rel)) {
          if (++visits > MAX_FILES) throw new SyncError("tooManyFiles");
          await add(rel);
        }
      }
    };
    await walk();
    // files.list deliberately hides dot directories. Reach only Textus's
    // documented project data, never plugin state, credentials or arbitrary dotfiles.
    for (const name of ["agent.md", "style.md", "style.previous.md"]) {
      const rel = `.textus/${name}`;
      if (await this.api.files.stat(this.path(rel))) await add(rel);
    }
    for (const name of ["library", "memory", "skills"]) {
      if ((await this.api.files.stat(`${this.root}/.textus/${name}`))?.isDir)
        await walk(`.textus/${name}`);
    }
    return files;
  }
  async apply(
    relative: string,
    bytes: Uint8Array,
    expected: string | null,
  ): Promise<boolean | "deferred"> {
    await this.check();
    const path = this.path(relative);
    if (await this.open(path)) return "deferred";
    const previous = await this.read(relative);
    if ((previous ? await hash(previous) : null) !== expected) return false;
    await this.check();
    if (!previous) {
      if (!isText(relative)) {
        const created = await this.createBinary(relative, bytes);
        if (created !== true) return created;
      } else {
        try {
          const text = new TextDecoder("utf-8", {
            fatal: true,
            ignoreBOM: true,
          }).decode(bytes);
          await this.api.files.create(path, text);
        } catch {
          if (await this.api.files.stat(path)) return false;
          throw new SyncError("localWriteError", [relative]);
        }
      }
    } else {
      if (!isText(relative)) return false;
      const decoder = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      });
      const before = decoder.decode(previous),
        after = decoder.decode(bytes);
      let changed = false;
      await this.api.files.process(path, (current) => {
        changed = current === before;
        return changed ? after : current;
      });
      if (!changed) return false;
    }
    const after = await this.readRaw(relative);
    if (!after || (await hash(after)) !== (await hash(bytes)))
      return "deferred";
    await this.reservations.clear(relative);
    return true;
  }
}
