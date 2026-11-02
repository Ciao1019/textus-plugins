import {
  Cipher,
  newEncryption,
  parseEncryptionMetadata,
  unlockEncryption,
  validatePassword,
} from "./encryption";
import { hash } from "./content";
import {
  HEAD,
  LOCK,
  SyncError,
  checkAbort,
  encode,
  type ObjectStore,
} from "./model";
import { testConnection } from "./transport";

export const ENCRYPTED_HEAD = "v2/head.bin";

/** Logical v1 keys stay inside the client; only authenticated ciphertext leaves it. */
export class EncryptedStore implements ObjectStore {
  constructor(
    private raw: ObjectStore,
    private cipher: Cipher,
    readonly fingerprint: string,
  ) {}
  private async verifyDescriptor() {
    const descriptor = await this.raw.get(HEAD);
    if (!descriptor) throw new SyncError("encryptionMetadataMissing");
    if (
      (await hash(encode(parseEncryptionMetadata(descriptor)))) !==
      this.fingerprint
    )
      throw new SyncError("encryptionChanged");
  }
  private async physical(key: string) {
    if (key === LOCK) return LOCK;
    if (key === HEAD) return ENCRYPTED_HEAD;
    if (/^v1\/blocks\/[a-f0-9]{2}\/[a-f0-9]{64}$/.test(key)) {
      const id = await this.cipher.name(key);
      return `v2/blocks/${id.slice(0, 2)}/${id}`;
    }
    const snapshot = /^v1\/snapshots\/([0-9a-f-]{36})\.json$/.exec(key);
    if (snapshot) return `v2/snapshots/${snapshot[1]}.bin`;
    const probe = /^v1\/probes\/([0-9a-f-]{36})$/.exec(key);
    if (probe) return `v2/probes/${probe[1]}.bin`;
    throw new SyncError("invalidPath");
  }
  async get(key: string) {
    if (key === HEAD) await this.verifyDescriptor();
    const raw = await this.raw.get(await this.physical(key));
    return raw && key !== LOCK ? this.cipher.open(key, raw) : raw;
  }
  async has(key: string) {
    return this.raw.has(await this.physical(key));
  }
  async put(key: string, value: Uint8Array) {
    if (key === LOCK) throw new SyncError("invalidPath");
    if (key === HEAD) await this.verifyDescriptor();
    await this.raw.put(
      await this.physical(key),
      await this.cipher.seal(key, value),
    );
  }
  async create(key: string, value: Uint8Array) {
    return this.raw.create(
      await this.physical(key),
      key === LOCK ? value : await this.cipher.seal(key, value),
    );
  }
  async remove(key: string) {
    await this.raw.remove(await this.physical(key));
  }
}

export async function openEncryptedStore(
  raw: ObjectStore,
  password: string,
  options: { pin?: string; signal?: AbortSignal } = {},
): Promise<EncryptedStore> {
  validatePassword(password);
  checkAbort(options.signal);
  const existing = await raw.get(HEAD);
  if (existing) {
    const unlocked = await unlockEncryption(existing, password, options.pin);
    checkAbort(options.signal);
    return new EncryptedStore(raw, unlocked.cipher, unlocked.fingerprint);
  }
  if (options.pin || (await raw.has(ENCRYPTED_HEAD)))
    throw new SyncError("encryptionMetadataMissing");
  // Before initializing any repository, prove that its server respects exclusion.
  await testConnection(raw);
  checkAbort(options.signal);
  const owner = encode({
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
  });
  if (!(await raw.create(LOCK, owner))) throw new SyncError("locked");
  const ownLock = async () => {
    const current = await raw.get(LOCK);
    if (
      !current ||
      current.length !== owner.length ||
      owner.some((b, i) => b !== current[i])
    )
      throw new SyncError("lockLost");
  };
  let completed = false;
  try {
    await ownLock();
    checkAbort(options.signal);
    const appeared = await raw.get(HEAD);
    const unlocked = appeared
      ? await unlockEncryption(appeared, password, options.pin)
      : await newEncryption(password);
    checkAbort(options.signal);
    await ownLock();
    if (!appeared) {
      // This deliberately occupies the old head: v0.1 clients reject its format
      // before reading any workspace data. A crash never leaves a plaintext fallback.
      if (!(await raw.create(HEAD, encode(unlocked.metadata))))
        throw new SyncError("lockLost");
      const written = await raw.get(HEAD);
      if (!written) throw new SyncError("encryptionMetadataMissing");
      await unlockEncryption(written, password, unlocked.fingerprint);
    }
    completed = true;
    return new EncryptedStore(raw, unlocked.cipher, unlocked.fingerprint);
  } finally {
    try {
      await ownLock();
      await raw.remove(LOCK);
    } catch {
      if (completed) throw new SyncError("unlockFailed");
    }
  }
}
