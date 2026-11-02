import { hash } from "./content";

type Storage = Pick<Textus.StoragePlace, "get" | "set">;

/** Exact, durable markers distinguish interrupted downloads from user files. */
export class Reservations {
  private key: Promise<string>;
  private loaded?: Promise<Record<string, string>>;
  constructor(
    private storage: Storage,
    root: string,
  ) {
    this.key = hash(new TextEncoder().encode(root)).then((h) => `pending:${h}`);
  }
  private all() {
    return (this.loaded ??= this.key.then(async (key) => {
      const raw = await this.storage.get(key);
      const entries: Record<string, string> = Object.create(null);
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        for (const [path, marker] of Object.entries(raw)) {
          if (
            typeof marker === "string" &&
            /^Textus pending download [0-9a-f-]{36}\n$/.test(marker)
          )
            entries[path] = marker;
        }
      }
      return entries;
    }));
  }
  async get(path: string) {
    return (await this.all())[path];
  }
  async reserve(path: string) {
    const entries = await this.all();
    const marker =
      entries[path] ?? `Textus pending download ${crypto.randomUUID()}\n`;
    entries[path] = marker;
    await this.storage.set(await this.key, entries);
    return marker;
  }
  async clear(path: string) {
    const entries = await this.all();
    if (!(path in entries)) return;
    delete entries[path];
    await this.storage.set(await this.key, entries);
  }
  matches(bytes: Uint8Array, marker: string) {
    return (
      bytes.length === marker.length &&
      new TextDecoder().decode(bytes) === marker
    );
  }
}
