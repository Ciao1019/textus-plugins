import { hash } from "./content";
import { encode, MAX_MANIFEST_SIZE, SyncError } from "./model";

export const ENCRYPTION_FORMAT = "textus-cloud-sync-e2ee/1";
export const KDF_ITERATIONS = 600_000;
const MAGIC = new Uint8Array([84, 67, 83, 50]); // TCS2
const CHECK = new TextEncoder().encode("Textus encrypted workspace key check");
const encoder = new TextEncoder();

export interface EncryptionHeader {
  format: typeof ENCRYPTION_FORMAT;
  repositoryId: string;
  kdf: "PBKDF2-SHA256";
  iterations: typeof KDF_ITERATIONS;
  salt: string;
}
export interface EncryptionMetadata extends EncryptionHeader {
  verifier: string;
}
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (value: string) =>
  Uint8Array.from(value.match(/../g) ?? [], (part) => parseInt(part, 16));
const header = (m: EncryptionHeader): EncryptionHeader => ({
  format: m.format,
  repositoryId: m.repositoryId,
  kdf: m.kdf,
  iterations: m.iterations,
  salt: m.salt,
});

export function validatePassword(password: string) {
  if (password.length < 12 || password.length > 1024 || !password.trim())
    throw new SyncError("syncPasswordRequired");
}

export function parseEncryptionMetadata(raw: Uint8Array): EncryptionMetadata {
  try {
    if (raw.length > 8192) throw new Error();
    const m = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    if (m?.format === "textus-cloud-sync/1")
      throw new SyncError("legacyRemote");
    if (
      m?.format !== ENCRYPTION_FORMAT ||
      typeof m.repositoryId !== "string" ||
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(m.repositoryId) ||
      m.kdf !== "PBKDF2-SHA256" ||
      m.iterations !== KDF_ITERATIONS ||
      typeof m.salt !== "string" ||
      !/^[0-9a-f]{64}$/.test(m.salt) ||
      typeof m.verifier !== "string" ||
      !new RegExp(`^[0-9a-f]{${(CHECK.length + 32) * 2}}$`).test(m.verifier)
    )
      throw new Error();
    return { ...header(m), verifier: m.verifier };
  } catch (error) {
    if (error instanceof SyncError) throw error;
    throw new SyncError("invalidEncryptionMetadata");
  }
}

export class Cipher {
  private constructor(
    private encryptionKey: CryptoKey,
    private nameKey: CryptoKey,
    private context: string,
  ) {}
  static async derive(password: string, metadata: EncryptionHeader) {
    validatePassword(password);
    const passwordBytes = encoder.encode(password);
    const material = await crypto.subtle.importKey(
      "raw",
      passwordBytes,
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    passwordBytes.fill(0);
    const master = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: unhex(metadata.salt),
        iterations: KDF_ITERATIONS,
      },
      material,
      256,
    );
    const root = await crypto.subtle.importKey("raw", master, "HKDF", false, [
      "deriveKey",
    ]);
    new Uint8Array(master).fill(0);
    const derive = (purpose: string) => ({
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(metadata.repositoryId),
      info: encoder.encode(`${ENCRYPTION_FORMAT}/${purpose}`),
    });
    const encryptionKey = await crypto.subtle.deriveKey(
      derive("content"),
      root,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const nameKey = await crypto.subtle.deriveKey(
      derive("names"),
      root,
      { name: "HMAC", hash: "SHA-256", length: 256 },
      false,
      ["sign"],
    );
    return new Cipher(encryptionKey, nameKey, JSON.stringify(header(metadata)));
  }
  async seal(key: string, plain: Uint8Array) {
    if (plain.length > MAX_MANIFEST_SIZE) throw new SyncError("tooManyFiles");
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const body = new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv,
          tagLength: 128,
          additionalData: encoder.encode(`${this.context}\n${key}`),
        },
        this.encryptionKey,
        plain.slice().buffer,
      ),
    );
    const result = new Uint8Array(16 + body.length);
    result.set(MAGIC);
    result.set(iv, 4);
    result.set(body, 16);
    return result;
  }
  async open(key: string, encrypted: Uint8Array) {
    try {
      if (
        encrypted.length < 32 ||
        encrypted.length > MAX_MANIFEST_SIZE + 32 ||
        MAGIC.some((byte, i) => byte !== encrypted[i])
      )
        throw new Error();
      return new Uint8Array(
        await crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: encrypted.slice(4, 16),
            tagLength: 128,
            additionalData: encoder.encode(`${this.context}\n${key}`),
          },
          this.encryptionKey,
          encrypted.slice(16).buffer,
        ),
      );
    } catch {
      throw new SyncError("encryptedDataInvalid");
    }
  }
  async name(key: string) {
    return hex(
      new Uint8Array(
        await crypto.subtle.sign("HMAC", this.nameKey, encoder.encode(key)),
      ),
    );
  }
}

export async function newEncryption(password: string) {
  const h: EncryptionHeader = {
    format: ENCRYPTION_FORMAT,
    repositoryId: crypto.randomUUID(),
    kdf: "PBKDF2-SHA256",
    iterations: KDF_ITERATIONS,
    salt: hex(crypto.getRandomValues(new Uint8Array(32))),
  };
  const cipher = await Cipher.derive(password, h);
  const metadata: EncryptionMetadata = {
    ...h,
    verifier: hex(await cipher.seal("key-check", CHECK)),
  };
  return { cipher, metadata, fingerprint: await hash(encode(metadata)) };
}

export async function unlockEncryption(
  raw: Uint8Array,
  password: string,
  pin?: string,
) {
  const metadata = parseEncryptionMetadata(raw);
  const fingerprint = await hash(encode(metadata));
  if (pin && pin !== fingerprint) throw new SyncError("encryptionChanged");
  const cipher = await Cipher.derive(password, metadata);
  try {
    const check = await cipher.open("key-check", unhex(metadata.verifier));
    if (check.length !== CHECK.length || CHECK.some((b, i) => b !== check[i]))
      throw new Error();
  } catch {
    throw new SyncError("invalidSyncPassword");
  }
  return { cipher, metadata, fingerprint };
}
