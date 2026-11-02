"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// development/cloud-sync/src/host.ts
var host_exports = {};
__export(host_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(host_exports);

// development/cloud-sync/src/model.ts
var ID = "catvinci.cloud-sync";
var FORMAT = "textus-cloud-sync/1";
var CHUNK_SIZE = 2 * 1024 * 1024;
var MAX_FILE_SIZE = 128 * 1024 * 1024;
var MAX_MANIFEST_SIZE = 8 * 1024 * 1024;
var MAX_FILES = 2e4;
var HEAD = "v1/head.json";
var LOCK = "v1/lock.json";
var SyncError = class extends Error {
  constructor(code, args = []) {
    super(code);
    this.code = code;
    this.args = args;
    this.name = "SyncError";
  }
};
var encode = (value) => new TextEncoder().encode(JSON.stringify(value));
var blockKey = (hash3) => `v1/blocks/${hash3.slice(0, 2)}/${hash3}`;
function checkAbort(signal) {
  if (signal?.aborted) throw new SyncError("cancelled");
}

// development/cloud-sync/src/config.ts
var defaults = {
  provider: "s3",
  endpoint: "",
  region: "us-east-1",
  bucket: "",
  prefix: "textus/my-workspace",
  pathStyle: true,
  automatic: false,
  interval: 5
};
var providers = {
  s3: { transport: "s3", endpoint: "", requestLimit: Infinity },
  webdav: { transport: "dav", endpoint: "", requestLimit: Infinity },
  nutstore: {
    transport: "dav",
    endpoint: "https://dav.jianguoyun.com/dav",
    requestLimit: 550
  }
};
function relativePath(value) {
  return value.length > 0 && value.length <= 1024 && !/[\\\x00-\x1f\x7f:*?"<>|]/.test(value) && value.split("/").every(
    (part) => part !== "" && part !== "." && part !== ".." && !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
  );
}
function normalizeConfig(input) {
  const c = { ...defaults, ...input };
  if (!Object.hasOwn(providers, c.provider))
    throw new SyncError("invalidConfig");
  c.prefix = String(c.prefix).trim().replace(/^\/+|\/+$/g, "");
  if (!relativePath(c.prefix)) throw new SyncError("invalidPrefix");
  c.region = String(c.region).trim() || "us-east-1";
  if (!/^[a-z0-9-]+$/.test(c.region)) throw new SyncError("invalidConfig");
  c.bucket = String(c.bucket).trim();
  const spec = providers[c.provider];
  c.endpoint = (spec.endpoint || String(c.endpoint).trim()).replace(/\/+$/, "");
  if (spec.transport === "s3") {
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(c.bucket) || c.bucket.includes(".."))
      throw new SyncError("invalidBucket");
    c.endpoint || (c.endpoint = `https://s3.${c.region}.amazonaws.com`);
  } else {
    c.region = "";
    c.bucket = "";
    c.pathStyle = false;
  }
  let url;
  try {
    url = new URL(c.endpoint);
  } catch {
    throw new SyncError("invalidEndpoint");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
    throw new SyncError("invalidEndpoint");
  if (url.pathname.split("/").some((p) => {
    try {
      return /[\\\x00-\x1f]/.test(decodeURIComponent(p));
    } catch {
      return true;
    }
  }))
    throw new SyncError("invalidEndpoint");
  c.endpoint = url.toString().replace(/\/+$/, "");
  c.pathStyle = c.pathStyle !== false;
  c.automatic = c.automatic === true;
  c.interval = Number(c.interval);
  if (!Number.isInteger(c.interval) || c.interval < 5 || c.interval > 1440)
    throw new SyncError("invalidInterval");
  return c;
}
function identity(c) {
  return JSON.stringify([
    providers[c.provider].transport,
    c.endpoint,
    c.bucket,
    c.region,
    c.pathStyle,
    c.prefix
  ]);
}
var documents = /\.(md|markdown|mdown|mkd|txt|csv)$/i;
var attachments = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico|heic|pdf|docx?|xlsx?|pptx?|odt|ods|odp|mp3|wav|m4a|ogg|mp4|mov|webm)$/i;
var ignored = /* @__PURE__ */ new Set(["node_modules", "dist", "build", "target", "vendor"]);
var isText = (path) => documents.test(path) || /\.svg$/i.test(path);
function inScope(path) {
  if (!relativePath(path)) return false;
  const parts = path.split("/");
  if (parts[0] === ".textus") {
    return /^\.textus\/(agent|style|style\.previous)\.md$/.test(path) || /^\.textus\/(library|memory|skills)\/.+\.md$/i.test(path) && parts.slice(1).every((p) => !p.startsWith("."));
  }
  return parts.every((p) => !p.startsWith(".") && !ignored.has(p.toLowerCase())) && (documents.test(path) || attachments.test(path));
}
function descend(path) {
  return relativePath(path) && path.split("/").every((p) => !p.startsWith(".") && !ignored.has(p.toLowerCase()));
}

// development/cloud-sync/src/content.ts
async function hash(bytes) {
  const sum = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(
    new Uint8Array(sum),
    (b) => b.toString(16).padStart(2, "0")
  ).join("");
}
async function describe(bytes) {
  if (bytes.length > MAX_FILE_SIZE) throw new SyncError("tooLarge");
  const blocks = [];
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    blocks.push({ hash: await hash(chunk), size: chunk.length });
  }
  return { hash: await hash(bytes), size: bytes.length, blocks };
}
function parseManifest(raw) {
  try {
    if (raw.length > MAX_MANIFEST_SIZE) throw new Error();
    const value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(raw)
    );
    if (value.format !== FORMAT || typeof value.revision !== "string" || typeof value.updatedAt !== "string" || !value.files || Array.isArray(value.files))
      throw new Error();
    const keys = Object.keys(value.files);
    if (keys.length > MAX_FILES) throw new Error();
    const folded = /* @__PURE__ */ new Set();
    for (const path of keys) {
      const canonical = path.normalize("NFC").toLowerCase();
      if (!inScope(path) || folded.has(canonical)) throw new Error();
      folded.add(canonical);
      const e = value.files[path];
      if (!e || !/^[a-f0-9]{64}$/.test(e.hash) || !Number.isSafeInteger(e.size) || e.size < 0 || e.size > MAX_FILE_SIZE || !Array.isArray(e.blocks) || e.blocks.length > Math.ceil(MAX_FILE_SIZE / CHUNK_SIZE))
        throw new Error();
      let total = 0;
      for (const b of e.blocks) {
        if (!b || !/^[a-f0-9]{64}$/.test(b.hash) || !Number.isSafeInteger(b.size) || b.size <= 0 || b.size > CHUNK_SIZE)
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
function parseBase(raw) {
  if (raw == null) return { format: FORMAT, files: /* @__PURE__ */ Object.create(null) };
  const b = raw;
  if (b.format !== FORMAT || !b.files || Array.isArray(b.files) || Object.entries(b.files).some(
    ([p, h]) => !inScope(p) || !/^[a-f0-9]{64}$/.test(h)
  ))
    throw new SyncError("invalidBase");
  return b;
}

// development/cloud-sync/src/planner.ts
function plan(local, remote, base) {
  return [.../* @__PURE__ */ new Set([...Object.keys(local), ...Object.keys(remote)])].sort().map((path) => {
    const l = local[path]?.hash, r = remote[path]?.hash, b = base[path];
    const kind = l === r ? "equal" : !l ? "download" : !r ? "upload" : l === b ? "download" : r === b ? "upload" : "conflict";
    return { path, kind };
  });
}
function conflictPath(path, hash3) {
  const safe = path.replace(/^\.textus\//, "Textus project/");
  const dot = safe.lastIndexOf(".");
  const end = dot > safe.lastIndexOf("/") + 1 ? dot : safe.length;
  return `Sync conflicts/${safe.slice(0, end)} (${hash3.slice(0, 8)})${safe.slice(end)}`;
}

// development/cloud-sync/src/engine.ts
async function download(store, entry, signal) {
  const bytes = new Uint8Array(entry.size);
  let offset = 0;
  for (const block of entry.blocks) {
    checkAbort(signal);
    const chunk = await store.get(blockKey(block.hash));
    if (!chunk || chunk.length !== block.size || await hash(chunk) !== block.hash)
      throw new SyncError("integrityError");
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (await hash(bytes) !== entry.hash) throw new SyncError("integrityError");
  return bytes;
}
async function upload(store, entry, bytes, known, signal) {
  let offset = 0;
  for (const block of entry.blocks) {
    checkAbort(signal);
    if (!known.has(block.hash)) {
      const key = blockKey(block.hash);
      if (!await store.has(key))
        await store.put(key, bytes.subarray(offset, offset + block.size));
      const actual = await store.get(key);
      if (!actual || await hash(actual) !== block.hash)
        throw new SyncError("integrityError");
      known.add(block.hash);
    }
    offset += block.size;
  }
}
async function synchronize(options) {
  const { local, store, signal } = options;
  const progress = options.progress ?? (() => {
  });
  const owner = {
    id: crypto.randomUUID(),
    startedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  checkAbort(signal);
  await local.check();
  progress("locking", 0, 0);
  if (!await store.create(LOCK, encode(owner))) throw new SyncError("locked");
  const ownLock = async () => {
    const raw = await store.get(LOCK);
    if (!raw || new TextDecoder().decode(raw) !== new TextDecoder().decode(encode(owner)))
      throw new SyncError("lockLost");
  };
  let completed = false;
  try {
    await ownLock();
    const raw = await store.get(HEAD);
    const remote = raw ? parseManifest(raw) : {
      format: FORMAT,
      revision: "",
      updatedAt: "",
      files: /* @__PURE__ */ Object.create(null)
    };
    if (!raw && Object.keys(options.base.files).length)
      throw new SyncError("remoteMissing");
    progress("scanning", 0, 0);
    const files = await local.scan();
    checkAbort(signal);
    const next = { ...remote, files: { ...remote.files } };
    const base = { format: FORMAT, files: { ...options.base.files } };
    const known = /* @__PURE__ */ new Set();
    const result = {
      uploaded: 0,
      downloaded: 0,
      conflicts: [],
      deferred: [],
      unchanged: 0
    };
    const actions = plan(files, remote.files, base.files);
    const names = /* @__PURE__ */ new Map();
    for (const a of actions) {
      const folded = a.path.normalize("NFC").toLowerCase();
      if (names.has(folded) && names.get(folded) !== a.path)
        throw new SyncError("caseCollision");
      names.set(folded, a.path);
    }
    const keepRemote = async (path, entry, bytes) => {
      const candidate = conflictPath(path, entry.hash);
      let target = candidate;
      for (let attempt = 0; attempt < 4; attempt++) {
        const existing = await local.read(target);
        const remoteExisting = next.files[target];
        const collision = names.get(target.normalize("NFC").toLowerCase());
        if ((!collision || collision === target) && (!remoteExisting || remoteExisting.hash === entry.hash) && (existing ? await hash(existing) === entry.hash : await local.apply(target, bytes, null) === true)) {
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
      const l = files[path], r = remote.files[path];
      if (kind === "equal") {
        base.files[path] = l.hash;
        result.unchanged++;
        continue;
      }
      if (kind === "download" || kind === "conflict") {
        const bytes = await download(store, r, signal);
        checkAbort(signal);
        const applied = kind === "download" && await local.apply(path, bytes, l?.hash ?? null);
        if (applied === "deferred") {
          result.deferred.push(path);
          continue;
        }
        if (applied === true) {
          base.files[path] = r.hash;
          result.downloaded++;
          continue;
        }
        await keepRemote(path, r, bytes);
        if (kind === "download" && !l) {
          result.deferred.push(path);
          continue;
        }
      }
      const current = await local.read(path);
      if (!l || !current || await hash(current) !== l.hash) {
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
      next.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      const document = encode(next);
      if (document.length > MAX_MANIFEST_SIZE)
        throw new SyncError("tooManyFiles");
      parseManifest(document);
      await store.put(`v1/snapshots/${next.revision}.json`, document);
      await ownLock();
      await store.put(HEAD, document);
      const committed = await store.get(HEAD);
      if (!committed || await hash(committed) !== await hash(document))
        throw new SyncError("integrityError");
    }
    await options.saveBase(base);
    completed = true;
    return result;
  } finally {
    try {
      await ownLock();
      await store.remove(LOCK);
    } catch {
      if (completed) throw new SyncError("unlockFailed");
    }
  }
}

// development/cloud-sync/src/encryption.ts
var ENCRYPTION_FORMAT = "textus-cloud-sync-e2ee/1";
var KDF_ITERATIONS = 6e5;
var MAGIC = new Uint8Array([84, 67, 83, 50]);
var CHECK = new TextEncoder().encode("Textus encrypted workspace key check");
var encoder = new TextEncoder();
var hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
var unhex = (value) => Uint8Array.from(value.match(/../g) ?? [], (part) => parseInt(part, 16));
var header = (m) => ({
  format: m.format,
  repositoryId: m.repositoryId,
  kdf: m.kdf,
  iterations: m.iterations,
  salt: m.salt
});
function validatePassword(password) {
  if (password.length < 12 || password.length > 1024 || !password.trim())
    throw new SyncError("syncPasswordRequired");
}
function parseEncryptionMetadata(raw) {
  try {
    if (raw.length > 8192) throw new Error();
    const m = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    if (m?.format === "textus-cloud-sync/1")
      throw new SyncError("legacyRemote");
    if (m?.format !== ENCRYPTION_FORMAT || typeof m.repositoryId !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(m.repositoryId) || m.kdf !== "PBKDF2-SHA256" || m.iterations !== KDF_ITERATIONS || typeof m.salt !== "string" || !/^[0-9a-f]{64}$/.test(m.salt) || typeof m.verifier !== "string" || !new RegExp(`^[0-9a-f]{${(CHECK.length + 32) * 2}}$`).test(m.verifier))
      throw new Error();
    return { ...header(m), verifier: m.verifier };
  } catch (error) {
    if (error instanceof SyncError) throw error;
    throw new SyncError("invalidEncryptionMetadata");
  }
}
var Cipher = class _Cipher {
  constructor(encryptionKey, nameKey, context) {
    this.encryptionKey = encryptionKey;
    this.nameKey = nameKey;
    this.context = context;
  }
  static async derive(password, metadata) {
    validatePassword(password);
    const passwordBytes = encoder.encode(password);
    const material = await crypto.subtle.importKey(
      "raw",
      passwordBytes,
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    passwordBytes.fill(0);
    const master = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: unhex(metadata.salt),
        iterations: KDF_ITERATIONS
      },
      material,
      256
    );
    const root = await crypto.subtle.importKey("raw", master, "HKDF", false, [
      "deriveKey"
    ]);
    new Uint8Array(master).fill(0);
    const derive = (purpose) => ({
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(metadata.repositoryId),
      info: encoder.encode(`${ENCRYPTION_FORMAT}/${purpose}`)
    });
    const encryptionKey = await crypto.subtle.deriveKey(
      derive("content"),
      root,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    const nameKey = await crypto.subtle.deriveKey(
      derive("names"),
      root,
      { name: "HMAC", hash: "SHA-256", length: 256 },
      false,
      ["sign"]
    );
    return new _Cipher(encryptionKey, nameKey, JSON.stringify(header(metadata)));
  }
  async seal(key, plain) {
    if (plain.length > MAX_MANIFEST_SIZE) throw new SyncError("tooManyFiles");
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const body = new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv,
          tagLength: 128,
          additionalData: encoder.encode(`${this.context}
${key}`)
        },
        this.encryptionKey,
        plain.slice().buffer
      )
    );
    const result = new Uint8Array(16 + body.length);
    result.set(MAGIC);
    result.set(iv, 4);
    result.set(body, 16);
    return result;
  }
  async open(key, encrypted) {
    try {
      if (encrypted.length < 32 || encrypted.length > MAX_MANIFEST_SIZE + 32 || MAGIC.some((byte, i) => byte !== encrypted[i]))
        throw new Error();
      return new Uint8Array(
        await crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: encrypted.slice(4, 16),
            tagLength: 128,
            additionalData: encoder.encode(`${this.context}
${key}`)
          },
          this.encryptionKey,
          encrypted.slice(16).buffer
        )
      );
    } catch {
      throw new SyncError("encryptedDataInvalid");
    }
  }
  async name(key) {
    return hex(
      new Uint8Array(
        await crypto.subtle.sign("HMAC", this.nameKey, encoder.encode(key))
      )
    );
  }
};
async function newEncryption(password) {
  const h = {
    format: ENCRYPTION_FORMAT,
    repositoryId: crypto.randomUUID(),
    kdf: "PBKDF2-SHA256",
    iterations: KDF_ITERATIONS,
    salt: hex(crypto.getRandomValues(new Uint8Array(32)))
  };
  const cipher = await Cipher.derive(password, h);
  const metadata = {
    ...h,
    verifier: hex(await cipher.seal("key-check", CHECK))
  };
  return { cipher, metadata, fingerprint: await hash(encode(metadata)) };
}
async function unlockEncryption(raw, password, pin) {
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

// node_modules/aws4fetch/dist/aws4fetch.esm.mjs
/**
 * @license MIT <https://opensource.org/licenses/MIT>
 * @copyright Michael Hart 2024
 */
var encoder2 = new TextEncoder();
var HOST_SERVICES = {
  appstream2: "appstream",
  cloudhsmv2: "cloudhsm",
  email: "ses",
  marketplace: "aws-marketplace",
  mobile: "AWSMobileHubService",
  pinpoint: "mobiletargeting",
  queue: "sqs",
  "git-codecommit": "codecommit",
  "mturk-requester-sandbox": "mturk-requester",
  "personalize-runtime": "personalize"
};
var UNSIGNABLE_HEADERS = /* @__PURE__ */ new Set([
  "authorization",
  "content-type",
  "content-length",
  "user-agent",
  "presigned-expires",
  "expect",
  "x-amzn-trace-id",
  "range",
  "connection"
]);
var AwsV4Signer = class {
  constructor({ method, url, headers, body, accessKeyId, secretAccessKey, sessionToken, service, region, cache, datetime, signQuery, appendSessionToken, allHeaders, singleEncode }) {
    if (url == null) throw new TypeError("url is a required option");
    if (accessKeyId == null) throw new TypeError("accessKeyId is a required option");
    if (secretAccessKey == null) throw new TypeError("secretAccessKey is a required option");
    this.method = method || (body ? "POST" : "GET");
    this.url = new URL(url);
    this.headers = new Headers(headers || {});
    this.body = body;
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.sessionToken = sessionToken;
    let guessedService, guessedRegion;
    if (!service || !region) {
      [guessedService, guessedRegion] = guessServiceRegion(this.url, this.headers);
    }
    this.service = service || guessedService || "";
    this.region = region || guessedRegion || "us-east-1";
    this.cache = cache || /* @__PURE__ */ new Map();
    this.datetime = datetime || (/* @__PURE__ */ new Date()).toISOString().replace(/[:-]|\.\d{3}/g, "");
    this.signQuery = signQuery;
    this.appendSessionToken = appendSessionToken || this.service === "iotdevicegateway";
    this.headers.delete("Host");
    if (this.service === "s3" && !this.signQuery && !this.headers.has("X-Amz-Content-Sha256")) {
      this.headers.set("X-Amz-Content-Sha256", "UNSIGNED-PAYLOAD");
    }
    const params = this.signQuery ? this.url.searchParams : this.headers;
    params.set("X-Amz-Date", this.datetime);
    if (this.sessionToken && !this.appendSessionToken) {
      params.set("X-Amz-Security-Token", this.sessionToken);
    }
    this.signableHeaders = ["host", ...this.headers.keys()].filter((header2) => allHeaders || !UNSIGNABLE_HEADERS.has(header2)).sort();
    this.signedHeaders = this.signableHeaders.join(";");
    this.canonicalHeaders = this.signableHeaders.map((header2) => header2 + ":" + (header2 === "host" ? this.url.host : (this.headers.get(header2) || "").replace(/\s+/g, " "))).join("\n");
    this.credentialString = [this.datetime.slice(0, 8), this.region, this.service, "aws4_request"].join("/");
    if (this.signQuery) {
      if (this.service === "s3" && !params.has("X-Amz-Expires")) {
        params.set("X-Amz-Expires", "86400");
      }
      params.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
      params.set("X-Amz-Credential", this.accessKeyId + "/" + this.credentialString);
      params.set("X-Amz-SignedHeaders", this.signedHeaders);
    }
    if (this.service === "s3") {
      try {
        this.encodedPath = decodeURIComponent(this.url.pathname.replace(/\+/g, " "));
      } catch (e) {
        this.encodedPath = this.url.pathname;
      }
    } else {
      this.encodedPath = this.url.pathname.replace(/\/+/g, "/");
    }
    if (!singleEncode) {
      this.encodedPath = encodeURIComponent(this.encodedPath).replace(/%2F/g, "/");
    }
    this.encodedPath = encodeRfc3986(this.encodedPath);
    const seenKeys = /* @__PURE__ */ new Set();
    this.encodedSearch = [...this.url.searchParams].filter(([k]) => {
      if (!k) return false;
      if (this.service === "s3") {
        if (seenKeys.has(k)) return false;
        seenKeys.add(k);
      }
      return true;
    }).map((pair) => pair.map((p) => encodeRfc3986(encodeURIComponent(p)))).sort(([k1, v1], [k2, v2]) => k1 < k2 ? -1 : k1 > k2 ? 1 : v1 < v2 ? -1 : v1 > v2 ? 1 : 0).map((pair) => pair.join("=")).join("&");
  }
  async sign() {
    if (this.signQuery) {
      this.url.searchParams.set("X-Amz-Signature", await this.signature());
      if (this.sessionToken && this.appendSessionToken) {
        this.url.searchParams.set("X-Amz-Security-Token", this.sessionToken);
      }
    } else {
      this.headers.set("Authorization", await this.authHeader());
    }
    return {
      method: this.method,
      url: this.url,
      headers: this.headers,
      body: this.body
    };
  }
  async authHeader() {
    return [
      "AWS4-HMAC-SHA256 Credential=" + this.accessKeyId + "/" + this.credentialString,
      "SignedHeaders=" + this.signedHeaders,
      "Signature=" + await this.signature()
    ].join(", ");
  }
  async signature() {
    const date = this.datetime.slice(0, 8);
    const cacheKey = [this.secretAccessKey, date, this.region, this.service].join();
    let kCredentials = this.cache.get(cacheKey);
    if (!kCredentials) {
      const kDate = await hmac("AWS4" + this.secretAccessKey, date);
      const kRegion = await hmac(kDate, this.region);
      const kService = await hmac(kRegion, this.service);
      kCredentials = await hmac(kService, "aws4_request");
      this.cache.set(cacheKey, kCredentials);
    }
    return buf2hex(await hmac(kCredentials, await this.stringToSign()));
  }
  async stringToSign() {
    return [
      "AWS4-HMAC-SHA256",
      this.datetime,
      this.credentialString,
      buf2hex(await hash2(await this.canonicalString()))
    ].join("\n");
  }
  async canonicalString() {
    return [
      this.method.toUpperCase(),
      this.encodedPath,
      this.encodedSearch,
      this.canonicalHeaders + "\n",
      this.signedHeaders,
      await this.hexBodyHash()
    ].join("\n");
  }
  async hexBodyHash() {
    let hashHeader = this.headers.get("X-Amz-Content-Sha256") || (this.service === "s3" && this.signQuery ? "UNSIGNED-PAYLOAD" : null);
    if (hashHeader == null) {
      if (this.body && typeof this.body !== "string" && !("byteLength" in this.body)) {
        throw new Error("body must be a string, ArrayBuffer or ArrayBufferView, unless you include the X-Amz-Content-Sha256 header");
      }
      hashHeader = buf2hex(await hash2(this.body || ""));
    }
    return hashHeader;
  }
};
async function hmac(key, string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    typeof key === "string" ? encoder2.encode(key) : key,
    { name: "HMAC", hash: { name: "SHA-256" } },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder2.encode(string));
}
async function hash2(content) {
  return crypto.subtle.digest("SHA-256", typeof content === "string" ? encoder2.encode(content) : content);
}
var HEX_CHARS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"];
function buf2hex(arrayBuffer) {
  const buffer = new Uint8Array(arrayBuffer);
  let out = "";
  for (let idx = 0; idx < buffer.length; idx++) {
    const n = buffer[idx];
    out += HEX_CHARS[n >>> 4 & 15];
    out += HEX_CHARS[n & 15];
  }
  return out;
}
function encodeRfc3986(urlEncodedStr) {
  return urlEncodedStr.replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}
function guessServiceRegion(url, headers) {
  const { hostname, pathname } = url;
  if (hostname.endsWith(".on.aws")) {
    const match2 = hostname.match(/^[^.]{1,63}\.lambda-url\.([^.]{1,63})\.on\.aws$/);
    return match2 != null ? ["lambda", match2[1] || ""] : ["", ""];
  }
  if (hostname.endsWith(".r2.cloudflarestorage.com")) {
    return ["s3", "auto"];
  }
  if (hostname.endsWith(".backblazeb2.com")) {
    const match2 = hostname.match(/^(?:[^.]{1,63}\.)?s3\.([^.]{1,63})\.backblazeb2\.com$/);
    return match2 != null ? ["s3", match2[1] || ""] : ["", ""];
  }
  const match = hostname.replace("dualstack.", "").match(/([^.]{1,63})\.(?:([^.]{0,63})\.)?amazonaws\.com(?:\.cn)?$/);
  let service = match && match[1] || "";
  let region = match && match[2];
  if (region === "us-gov") {
    region = "us-gov-west-1";
  } else if (region === "s3" || region === "s3-accelerate") {
    region = "us-east-1";
    service = "s3";
  } else if (service === "iot") {
    if (hostname.startsWith("iot.")) {
      service = "execute-api";
    } else if (hostname.startsWith("data.jobs.iot.")) {
      service = "iot-jobs-data";
    } else {
      service = pathname === "/mqtt" ? "iotdevicegateway" : "iotdata";
    }
  } else if (service === "autoscaling") {
    const targetPrefix = (headers.get("X-Amz-Target") || "").split(".")[0];
    if (targetPrefix === "AnyScaleFrontendService") {
      service = "application-autoscaling";
    } else if (targetPrefix === "AnyScaleScalingPlannerFrontendService") {
      service = "autoscaling-plans";
    }
  } else if (region == null && service.startsWith("s3-")) {
    region = service.slice(3).replace(/^fips-|^external-1/, "");
    service = "s3";
  } else if (service.endsWith("-fips")) {
    service = service.slice(0, -5);
  } else if (region && /-\d$/.test(service) && !/-\d$/.test(region)) {
    [service, region] = [region, service];
  }
  return [HOST_SERVICES[service] || service, region || ""];
}

// development/cloud-sync/src/transport.ts
var requests = /* @__PURE__ */ new Map();
var encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");
var pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var RemoteStore = class {
  constructor(config, credentials, fetch2, sleep = pause) {
    this.config = config;
    this.credentials = credentials;
    this.fetch = fetch2;
    this.sleep = sleep;
    __publicField(this, "dirs", /* @__PURE__ */ new Set());
    __publicField(this, "cache", /* @__PURE__ */ new Map());
    if (!credentials.account || !credentials.secret || providers[config.provider].transport === "dav" && credentials.account.includes(":"))
      throw new SyncError("credentialsRequired");
  }
  target(key) {
    if (!relativePath(key)) throw new SyncError("invalidPath");
    const c = this.config;
    const url = new URL(c.endpoint);
    const prefix = `${c.prefix}/${key}`;
    const s3 = providers[c.provider].transport === "s3";
    if (s3 && !c.pathStyle) url.hostname = `${c.bucket}.${url.hostname}`;
    url.pathname = url.pathname.replace(/\/$/, "") + "/" + encodePath(s3 && c.pathStyle ? `${c.bucket}/${prefix}` : prefix);
    return url.toString();
  }
  reserve(cleanup) {
    const cap = providers[this.config.provider].requestLimit;
    if (!Number.isFinite(cap)) return;
    const key = `${this.config.endpoint}:${this.credentials.account}`;
    const recent = (requests.get(key) ?? []).filter(
      (at) => at > Date.now() - 30 * 6e4
    );
    if (recent.length >= cap + (cleanup ? 20 : 0))
      throw new SyncError("rateLimited");
    requests.set(key, [...recent, Date.now()]);
  }
  async request(method, url, body, extra = {}, cleanup = false) {
    for (let attempt = 0; ; attempt++) {
      this.reserve(cleanup);
      let headers = { ...extra };
      if (providers[this.config.provider].transport === "s3") {
        const signed = await new AwsV4Signer({
          url,
          method,
          body: body?.slice().buffer,
          headers: {
            ...headers,
            "x-amz-content-sha256": await hash(body ?? new Uint8Array())
          },
          accessKeyId: this.credentials.account,
          secretAccessKey: this.credentials.secret,
          sessionToken: this.credentials.sessionToken || void 0,
          service: "s3",
          region: this.config.region,
          cache: this.cache
        }).sign();
        headers = Object.fromEntries(signed.headers.entries());
      } else {
        const bytes = new TextEncoder().encode(
          `${this.credentials.account}:${this.credentials.secret}`
        );
        headers.Authorization = `Basic ${btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""))}`;
      }
      let response;
      try {
        response = await this.fetch(url, { method, body, headers });
      } catch {
        throw new SyncError("networkError");
      }
      if (![429, 502, 503, 504].includes(response.status) || attempt >= 2 || !["GET", "HEAD", "PUT"].includes(method))
        return response;
      const retry = Number(response.headers["retry-after"] ?? "0");
      if (retry > 5) throw new SyncError("rateLimited");
      await this.sleep(Math.max(500 * 2 ** attempt, retry * 1e3));
    }
  }
  require(response) {
    if (response.status >= 200 && response.status < 300) return;
    if ([401, 403].includes(response.status))
      throw new SyncError("permissionError");
    if (response.status === 429) throw new SyncError("rateLimited");
    if (response.status === 507) throw new SyncError("quotaError");
    throw new SyncError("httpError", [response.status]);
  }
  async parents(key) {
    if (providers[this.config.provider].transport !== "dav") return;
    const parts = `${this.config.prefix}/${key}`.split("/").slice(0, -1);
    let path = "";
    for (const part of parts) {
      path += `${encodeURIComponent(part)}/`;
      if (this.dirs.has(path)) continue;
      const res = await this.request(
        "MKCOL",
        `${this.config.endpoint}/${path}`
      );
      if (res.status !== 405) this.require(res);
      this.dirs.add(path);
    }
  }
  async get(key) {
    const res = await this.request(
      "GET",
      this.target(key),
      void 0,
      {},
      key === LOCK
    );
    if (res.status === 404) return null;
    this.require(res);
    return res.bytes();
  }
  async has(key) {
    const res = await this.request("HEAD", this.target(key));
    if (res.status === 404) return false;
    this.require(res);
    return true;
  }
  async put(key, bytes) {
    await this.parents(key);
    this.require(await this.request("PUT", this.target(key), bytes));
  }
  async create(key, bytes) {
    if (providers[this.config.provider].transport === "s3") {
      const res = await this.request("PUT", this.target(key), bytes, {
        "If-None-Match": "*"
      });
      if (res.status === 412) return false;
      this.require(res);
      return true;
    }
    const temporary = `${key}.tmp-${crypto.randomUUID()}`;
    await this.put(temporary, bytes);
    try {
      const res = await this.request(
        "MOVE",
        this.target(temporary),
        void 0,
        { Destination: this.target(key), Overwrite: "F" }
      );
      if (res.status === 412 || res.status === 409 && await this.has(key))
        return false;
      this.require(res);
      return true;
    } finally {
      await this.remove(temporary).catch(() => {
      });
    }
  }
  async remove(key) {
    const res = await this.request(
      "DELETE",
      this.target(key),
      void 0,
      {},
      true
    );
    if (res.status !== 404) this.require(res);
  }
};
async function testConnection(store) {
  const key = `v1/probes/${crypto.randomUUID()}`;
  const original = crypto.getRandomValues(new Uint8Array(32));
  let created = false;
  try {
    created = await store.create(key, original);
    if (!created) throw new SyncError("unsafeServer");
    if (await store.create(key, new Uint8Array([9])))
      throw new SyncError("unsafeServer");
    const read = await store.get(key);
    if (!read || await hash(read) !== await hash(original))
      throw new SyncError("unsafeServer");
  } finally {
    if (created) await store.remove(key);
  }
}

// development/cloud-sync/src/encrypted-store.ts
var ENCRYPTED_HEAD = "v2/head.bin";
var EncryptedStore = class {
  constructor(raw, cipher, fingerprint) {
    this.raw = raw;
    this.cipher = cipher;
    this.fingerprint = fingerprint;
  }
  async verifyDescriptor() {
    const descriptor = await this.raw.get(HEAD);
    if (!descriptor) throw new SyncError("encryptionMetadataMissing");
    if (await hash(encode(parseEncryptionMetadata(descriptor))) !== this.fingerprint)
      throw new SyncError("encryptionChanged");
  }
  async physical(key) {
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
  async get(key) {
    if (key === HEAD) await this.verifyDescriptor();
    const raw = await this.raw.get(await this.physical(key));
    return raw && key !== LOCK ? this.cipher.open(key, raw) : raw;
  }
  async has(key) {
    return this.raw.has(await this.physical(key));
  }
  async put(key, value) {
    if (key === LOCK) throw new SyncError("invalidPath");
    if (key === HEAD) await this.verifyDescriptor();
    await this.raw.put(
      await this.physical(key),
      await this.cipher.seal(key, value)
    );
  }
  async create(key, value) {
    return this.raw.create(
      await this.physical(key),
      key === LOCK ? value : await this.cipher.seal(key, value)
    );
  }
  async remove(key) {
    await this.raw.remove(await this.physical(key));
  }
};
async function openEncryptedStore(raw, password, options = {}) {
  validatePassword(password);
  checkAbort(options.signal);
  const existing = await raw.get(HEAD);
  if (existing) {
    const unlocked = await unlockEncryption(existing, password, options.pin);
    checkAbort(options.signal);
    return new EncryptedStore(raw, unlocked.cipher, unlocked.fingerprint);
  }
  if (options.pin || await raw.has(ENCRYPTED_HEAD))
    throw new SyncError("encryptionMetadataMissing");
  await testConnection(raw);
  checkAbort(options.signal);
  const owner = encode({
    id: crypto.randomUUID(),
    startedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  if (!await raw.create(LOCK, owner)) throw new SyncError("locked");
  const ownLock = async () => {
    const current = await raw.get(LOCK);
    if (!current || current.length !== owner.length || owner.some((b, i) => b !== current[i]))
      throw new SyncError("lockLost");
  };
  let completed = false;
  try {
    await ownLock();
    checkAbort(options.signal);
    const appeared = await raw.get(HEAD);
    const unlocked = appeared ? await unlockEncryption(appeared, password, options.pin) : await newEncryption(password);
    checkAbort(options.signal);
    await ownLock();
    if (!appeared) {
      if (!await raw.create(HEAD, encode(unlocked.metadata)))
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

// development/cloud-sync/src/reservations.ts
var Reservations = class {
  constructor(storage, root) {
    this.storage = storage;
    __publicField(this, "key");
    __publicField(this, "loaded");
    this.key = hash(new TextEncoder().encode(root)).then((h) => `pending:${h}`);
  }
  all() {
    return this.loaded ?? (this.loaded = this.key.then(async (key) => {
      const raw = await this.storage.get(key);
      const entries = /* @__PURE__ */ Object.create(null);
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        for (const [path, marker] of Object.entries(raw)) {
          if (typeof marker === "string" && /^Textus pending download [0-9a-f-]{36}\n$/.test(marker))
            entries[path] = marker;
        }
      }
      return entries;
    }));
  }
  async get(path) {
    return (await this.all())[path];
  }
  async reserve(path) {
    const entries = await this.all();
    const marker = entries[path] ?? `Textus pending download ${crypto.randomUUID()}
`;
    entries[path] = marker;
    await this.storage.set(await this.key, entries);
    return marker;
  }
  async clear(path) {
    const entries = await this.all();
    if (!(path in entries)) return;
    delete entries[path];
    await this.storage.set(await this.key, entries);
  }
  matches(bytes, marker) {
    return bytes.length === marker.length && new TextDecoder().decode(bytes) === marker;
  }
};

// development/cloud-sync/src/local.ts
var Workspace = class {
  constructor(api, root, storage, signal) {
    this.api = api;
    this.root = root;
    this.signal = signal;
    __publicField(this, "reservations");
    this.reservations = new Reservations(storage, root);
  }
  async check() {
    checkAbort(this.signal);
    if (await this.api.files.root() !== this.root)
      throw new SyncError("rootChanged");
  }
  path(relative) {
    if (!inScope(relative)) throw new SyncError("invalidPath");
    return `${this.root.replace(/[/\\]$/, "")}/${relative}`;
  }
  async open(path) {
    const canonical = (p) => p.replace(/\\/g, "/").normalize("NFC");
    return (await this.api.layout.tabs()).some(
      (tab) => tab.path && canonical(tab.path) === canonical(path)
    );
  }
  async readRaw(relative) {
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
  async read(relative) {
    const bytes = await this.readRaw(relative);
    const marker = await this.reservations.get(relative);
    if (bytes && marker) {
      if (this.reservations.matches(bytes, marker)) return null;
      await this.reservations.clear(relative);
    }
    return bytes;
  }
  async createBinary(relative, bytes) {
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
    if (await this.open(path)) return "deferred";
    try {
      await this.api.files.write(path, bytes);
    } catch {
      throw new SyncError("localWriteError", [relative]);
    }
    return true;
  }
  async scan() {
    const files = /* @__PURE__ */ Object.create(null);
    let visits = 0;
    const add = async (rel) => {
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
          if (descend(rel) || /^\.textus\/(library|memory|skills)(\/|$)/.test(rel))
            await walk(rel);
        } else if (inScope(rel)) {
          if (++visits > MAX_FILES) throw new SyncError("tooManyFiles");
          await add(rel);
        }
      }
    };
    await walk();
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
  async apply(relative, bytes, expected) {
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
            ignoreBOM: true
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
        ignoreBOM: true
      });
      const before = decoder.decode(previous), after2 = decoder.decode(bytes);
      let changed = false;
      await this.api.files.process(path, (current) => {
        changed = current === before;
        return changed ? after2 : current;
      });
      if (!changed) return false;
    }
    const after = await this.readRaw(relative);
    if (!after || await hash(after) !== await hash(bytes))
      return "deferred";
    await this.reservations.clear(relative);
    return true;
  }
};

// development/cloud-sync/src/settings.ts
var Settings = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  async scope(root) {
    return hash(new TextEncoder().encode(root));
  }
  async load(root) {
    const raw = await this.ctx.storage.global.get(
      `config:${await this.scope(root)}`
    );
    return raw ? normalizeConfig(raw) : { ...defaults };
  }
  async secretKey(root, config) {
    return `connection:${await hash(new TextEncoder().encode(root + identity(config)))}`;
  }
  async credentials(root, config) {
    const saved = await this.ctx.secrets.get(
      await this.secretKey(root, config)
    );
    if (!saved) throw new SyncError("credentialsRequired");
    try {
      const value = JSON.parse(saved);
      if (!value.account || !value.secret) throw new Error();
      return value;
    } catch {
      throw new SyncError("credentialsRequired");
    }
  }
  async password(root, config) {
    const password = (await this.credentials(root, config)).syncPassword ?? "";
    validatePassword(password);
    return password;
  }
  async save(root, input, incoming) {
    const config = normalizeConfig(input);
    const key = await this.secretKey(root, config);
    let previous = { account: "", secret: "" };
    try {
      previous = await this.credentials(root, config);
    } catch {
    }
    const account = String(incoming.account ?? "").trim() || previous.account;
    const secret = String(incoming.secret ?? "") || previous.secret;
    if (!account || !secret) throw new SyncError("credentialsRequired");
    if (account !== previous.account && !incoming.secret)
      throw new SyncError("credentialsRequired");
    const syncPassword = String(incoming.syncPassword ?? "") || previous.syncPassword || "";
    validatePassword(syncPassword);
    if ((incoming.syncPassword || incoming.confirmPassword) && incoming.syncPassword !== incoming.confirmPassword)
      throw new SyncError("syncPasswordMismatch");
    const sessionToken = String(incoming.sessionToken ?? "") || (incoming.secret ? "" : previous.sessionToken);
    if ([account, secret, sessionToken].includes(syncPassword))
      throw new SyncError("syncPasswordSeparate");
    await this.ctx.secrets.set(
      key,
      JSON.stringify({
        account,
        secret,
        syncPassword,
        sessionToken
      })
    );
    await this.ctx.storage.global.set(
      `config:${await this.scope(root)}`,
      config
    );
    return config;
  }
  async baseKey(root, config) {
    const { account } = await this.credentials(root, config);
    return `encrypted-base:${await hash(new TextEncoder().encode(root + identity(config) + "\n" + account))}`;
  }
};

// development/cloud-sync/src/host.ts
var Controller = class {
  constructor(ctx, api) {
    this.ctx = ctx;
    this.api = api;
    __publicField(this, "settings");
    __publicField(this, "views", /* @__PURE__ */ new Set());
    __publicField(this, "timer");
    __publicField(this, "abort");
    __publicField(this, "disposed", false);
    __publicField(this, "state", {
      root: null,
      config: { ...defaults },
      configured: false,
      busy: false,
      message: "",
      error: false,
      progress: null
    });
    __publicField(this, "t", (key, ...args) => this.api.l10n.t(key, ...args));
    this.settings = new Settings(ctx);
  }
  send(view, message) {
    void view.postMessage(message).catch(() => this.views.delete(view));
  }
  broadcast() {
    for (const view of this.views)
      this.send(view, { type: "state", ...this.state });
  }
  message(key, error = false, ...args) {
    this.state.message = this.t(key, ...args);
    this.state.error = error;
    this.broadcast();
  }
  fail(error) {
    const e = error instanceof SyncError ? error : new SyncError("unknownError");
    this.message(e.code, true, ...e.args);
    this.ctx.log.warn(e.code);
  }
  async refresh() {
    const root = await this.api.files.root();
    const config = root ? await this.settings.load(root) : { ...defaults };
    let configured = false;
    if (root)
      try {
        await this.settings.credentials(root, config);
        await this.settings.password(root, config);
        configured = true;
      } catch {
      }
    this.state = {
      root,
      config,
      configured,
      busy: this.state.busy,
      message: this.t(
        !root ? "noFolder" : configured ? "ready" : "notConfigured"
      ),
      error: false,
      progress: null
    };
    if (root && configured) {
      const key = await this.settings.baseKey(root, config);
      const last = await this.ctx.storage.global.get(`last:${key}`);
      if (last && typeof last.at === "string") {
        this.state.lastRun = last.at;
        this.state.result = last.result;
      }
    }
    this.broadcast();
    this.schedule();
  }
  schedule() {
    clearTimeout(this.timer);
    if (this.disposed || !this.state.config.automatic || !this.state.configured || !this.state.root)
      return;
    this.timer = setTimeout(() => {
      void this.operation("sync");
    }, this.state.config.interval * 6e4);
  }
  async store() {
    const root = await this.api.files.root();
    if (!root) throw new SyncError("noFolder");
    if (root !== this.state.root) throw new SyncError("rootChanged");
    const config = await this.settings.load(root);
    const credentials = await this.settings.credentials(root, config);
    return {
      root,
      config,
      store: new RemoteStore(config, credentials, this.api.net.fetch)
    };
  }
  async recover(store) {
    const raw = await store.get(LOCK);
    if (!raw) {
      this.message("noLock");
      return;
    }
    let at = "\u2014";
    try {
      const parsed = JSON.parse(new TextDecoder().decode(raw));
      if (typeof parsed.startedAt === "string" && Number.isFinite(Date.parse(parsed.startedAt)))
        at = new Date(parsed.startedAt).toLocaleString(this.api.env.language);
    } catch {
    }
    if (!await this.api.ui.confirm(this.t("confirmUnlock", at), {
      danger: true,
      okLabel: this.t("unlock")
    }))
      return;
    checkAbort(this.abort?.signal);
    const current = await store.get(LOCK);
    if (!current || new TextDecoder().decode(raw) !== new TextDecoder().decode(current))
      throw new SyncError("lockLost");
    await store.remove(LOCK);
    this.message("unlocked");
  }
  async operation(kind) {
    if (this.state.busy || this.disposed) return;
    this.state.busy = true;
    this.state.progress = null;
    this.abort = new AbortController();
    this.message(kind === "sync" ? "scanning" : "testing");
    clearTimeout(this.timer);
    try {
      const { root, config, store } = await this.store();
      if (kind === "unlock") {
        await this.recover(store);
        return;
      }
      const key = await this.settings.baseKey(root, config);
      const pin = await this.ctx.storage.global.get(`vault:${key}`);
      if (pin != null && (typeof pin !== "string" || !/^[a-f0-9]{64}$/.test(pin)))
        throw new SyncError("invalidBase");
      this.message("unlockingEncryption");
      const encrypted = await openEncryptedStore(
        store,
        await this.settings.password(root, config),
        {
          pin,
          signal: this.abort.signal
        }
      );
      await this.ctx.storage.global.set(`vault:${key}`, encrypted.fingerprint);
      await testConnection(encrypted);
      checkAbort(this.abort.signal);
      if (kind === "test") {
        this.message("tested");
        return;
      }
      const base = parseBase(await this.ctx.storage.global.get(key));
      const result = await synchronize({
        store: encrypted,
        local: new Workspace(
          this.api,
          root,
          this.ctx.storage.global,
          this.abort.signal
        ),
        base,
        signal: this.abort.signal,
        saveBase: (next) => this.ctx.storage.global.set(key, next),
        progress: (phase, current, total) => {
          this.state.progress = total ? current / total : null;
          this.message(phase, false, current, total);
        }
      });
      const at = (/* @__PURE__ */ new Date()).toISOString();
      await this.ctx.storage.global.set(`last:${key}`, { at, result });
      if (await this.api.files.root() !== root) {
        await this.refresh();
        return;
      }
      this.state.result = result;
      this.state.lastRun = at;
      const parts = [
        ["doneUploaded", result.uploaded],
        ["doneDownloaded", result.downloaded],
        ["doneConflicts", result.conflicts.length],
        ["doneDeferred", result.deferred.length]
      ].filter(([, n]) => n > 0).map(([key2, n]) => this.t(key2, n));
      if (parts.length)
        this.message("done", false, parts.join(this.t("listSeparator")));
      else this.message("unchanged");
    } catch (error) {
      this.fail(error);
    } finally {
      this.state.busy = false;
      this.state.progress = null;
      this.abort = void 0;
      this.broadcast();
      this.schedule();
    }
  }
  async receive(message) {
    if (!message || typeof message !== "object") return;
    const m = message;
    try {
      if (m.type === "ready") {
        this.broadcast();
        return;
      }
      if (m.type === "cancel") {
        this.abort?.abort();
        this.message("cancelling");
        return;
      }
      if (this.state.busy) throw new SyncError("busy");
      if (m.type === "save" && m.config && m.credentials) {
        const root = await this.api.files.root();
        if (!root || root !== this.state.root)
          throw new SyncError("rootChanged");
        this.state.busy = true;
        this.broadcast();
        try {
          await this.settings.save(root, m.config, m.credentials);
          await this.refresh();
          for (const view of this.views) this.send(view, { type: "saved" });
          this.message("saved");
        } finally {
          this.state.busy = false;
          this.broadcast();
        }
      } else if (m.type === "sync" || m.type === "test" || m.type === "unlock") {
        await this.operation(m.type);
      }
    } catch (error) {
      this.fail(error);
    }
  }
  async resolve(view) {
    this.views.add(view);
    view.onDidReceiveMessage((m) => {
      void this.receive(m);
    });
    view.onDidDispose(() => this.views.delete(view));
    view.html = await this.ctx.plugin.readText("panel.html");
  }
  async start() {
    const { api, ctx } = this;
    ctx.subscriptions.push(
      api.commands.register(
        `${ID}.open`,
        () => api.layout.openView(`${ID}.panel`)
      ),
      api.commands.register(`${ID}.sync`, () => this.operation("sync")),
      api.views.registerWebview(`${ID}.panel`, {
        resolve: (view) => this.resolve(view)
      }),
      api.views.registerSettingsPage({ resolve: (view) => this.resolve(view) }),
      api.files.onDidChangeRoot(({ path }) => {
        if (path === this.state.root) return;
        this.abort?.abort();
        void this.refresh().catch((e) => this.fail(e));
      }),
      { dispose: () => this.stop() }
    );
    await this.refresh();
  }
  stop() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.abort?.abort();
  }
};
var controller;
function activate(ctx) {
  controller = new Controller(ctx, textus);
  return controller.start();
}
function deactivate() {
  controller?.stop();
}
