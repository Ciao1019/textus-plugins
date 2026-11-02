import {
  createDecipheriv,
  createHmac,
  hkdfSync,
  pbkdf2Sync,
} from "node:crypto";
import { expect, it } from "vitest";
import {
  ENCRYPTION_FORMAT,
  KDF_ITERATIONS,
  newEncryption,
  parseEncryptionMetadata,
  unlockEncryption,
} from "./encryption";
import { bytes, text } from "./test-fixtures";
import { encode, HEAD } from "./model";

const password = "test-only long sync passphrase";

it("matches independent Node PBKDF2, HKDF, HMAC and AES-256-GCM implementations", async () => {
  const { cipher, metadata } = await newEncryption(password);
  const encrypted = await cipher.seal(HEAD, bytes("private manifest"));
  const { verifier: _verifier, ...header } = metadata;
  const master = pbkdf2Sync(
    password,
    Buffer.from(metadata.salt, "hex"),
    600000,
    32,
    "sha256",
  );
  const content = Buffer.from(
    hkdfSync(
      "sha256",
      master,
      metadata.repositoryId,
      `${ENCRYPTION_FORMAT}/content`,
      32,
    ),
  );
  const decipher = createDecipheriv(
    "aes-256-gcm",
    content,
    encrypted.slice(4, 16),
  );
  decipher.setAAD(Buffer.from(JSON.stringify(header) + "\n" + HEAD));
  decipher.setAuthTag(encrypted.slice(-16));
  expect(
    Buffer.concat([
      decipher.update(encrypted.slice(16, -16)),
      decipher.final(),
    ]).toString(),
  ).toBe("private manifest");
  const names = Buffer.from(
    hkdfSync(
      "sha256",
      master,
      metadata.repositoryId,
      `${ENCRYPTION_FORMAT}/names`,
      32,
    ),
  );
  expect(await cipher.name("block-id")).toBe(
    createHmac("sha256", names).update("block-id").digest("hex"),
  );
});

it("uses fresh nonces and authenticates the object identity, ciphertext, and nonce", async () => {
  const { cipher } = await newEncryption(password);
  const plain = bytes("same content"),
    a = await cipher.seal(HEAD, plain),
    b = await cipher.seal(HEAD, plain);
  expect(a).not.toEqual(b);
  expect(text(await cipher.open(HEAD, a))).toBe("same content");
  await expect(cipher.open("v1/snapshots/other.json", a)).rejects.toThrow(
    "encryptedDataInvalid",
  );
  for (const index of [0, 4, 16, a.length - 1]) {
    const damaged = a.slice();
    damaged[index] ^= 1;
    await expect(cipher.open(HEAD, damaged)).rejects.toThrow(
      "encryptedDataInvalid",
    );
  }
  await expect(cipher.open(HEAD, a.slice(0, -1))).rejects.toThrow(
    "encryptedDataInvalid",
  );
  await expect(cipher.open(HEAD, plain)).rejects.toThrow(
    "encryptedDataInvalid",
  );
});

it("opens on another device with the exact password, including Unicode and spaces", async () => {
  const exact = "  同步密码不要自动去掉空格 🔒  ";
  const first = await newEncryption(exact);
  const second = await unlockEncryption(
    encode(first.metadata),
    exact,
    first.fingerprint,
  );
  expect(
    text(
      await second.cipher.open(
        HEAD,
        await first.cipher.seal(HEAD, bytes("hello")),
      ),
    ),
  ).toBe("hello");
  await expect(
    unlockEncryption(encode(first.metadata), exact.trim()),
  ).rejects.toThrow("invalidSyncPassword");
});

it("rejects wrong passwords and changed pinned encryption metadata", async () => {
  const original = await newEncryption(password);
  await expect(
    unlockEncryption(encode(original.metadata), "wrong-password-long-enough"),
  ).rejects.toThrow("invalidSyncPassword");
  const modified = { ...original.metadata, salt: "00".repeat(32) };
  await expect(
    unlockEncryption(encode(modified), password, original.fingerprint),
  ).rejects.toThrow("encryptionChanged");
  await expect(unlockEncryption(encode(modified), password)).rejects.toThrow(
    "invalidSyncPassword",
  );
});

it("uses separate repository keys and rejects cross-repository ciphertext", async () => {
  const a = await newEncryption(password),
    b = await newEncryption(password);
  expect(a.metadata.salt).not.toBe(b.metadata.salt);
  expect(await a.cipher.name("same-block")).not.toBe(
    await b.cipher.name("same-block"),
  );
  await expect(
    b.cipher.open(HEAD, await a.cipher.seal(HEAD, bytes("a"))),
  ).rejects.toThrow("encryptedDataInvalid");
});

it("bounds untrusted KDF parameters and rejects plaintext or malformed descriptors", async () => {
  const { metadata } = await newEncryption(password);
  expect(parseEncryptionMetadata(encode(metadata)).iterations).toBe(
    KDF_ITERATIONS,
  );
  for (const patch of [
    { iterations: 1 },
    { iterations: 2 ** 32 },
    { salt: "invalid" },
    { kdf: "unknown" },
    { verifier: "00" },
    { format: "future" },
  ])
    expect(() =>
      parseEncryptionMetadata(encode({ ...metadata, ...patch })),
    ).toThrow("invalidEncryptionMetadata");
  expect(() =>
    parseEncryptionMetadata(encode({ format: "textus-cloud-sync/1" })),
  ).toThrow("legacyRemote");
  expect(() => parseEncryptionMetadata(new Uint8Array(8193))).toThrow(
    "invalidEncryptionMetadata",
  );
  await expect(newEncryption("short")).rejects.toThrow("syncPasswordRequired");
});
