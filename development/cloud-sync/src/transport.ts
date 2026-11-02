import { AwsV4Signer } from "aws4fetch";
import { hash } from "./content";
import { providers, relativePath } from "./config";
import {
  LOCK,
  SyncError,
  type Config,
  type Credentials,
  type ObjectStore,
} from "./model";

export type Fetch = Textus.Net["fetch"];
type Response = Awaited<ReturnType<Fetch>>;
const requests = new Map<string, number[]>();
const encodePath = (path: string) =>
  path.split("/").map(encodeURIComponent).join("/");
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class RemoteStore implements ObjectStore {
  private dirs = new Set<string>();
  private cache = new Map<string, ArrayBuffer>();
  constructor(
    private config: Config,
    private credentials: Credentials,
    private fetch: Fetch,
    private sleep: (ms: number) => Promise<unknown> = pause,
  ) {
    if (
      !credentials.account ||
      !credentials.secret ||
      (providers[config.provider].transport === "dav" &&
        credentials.account.includes(":"))
    )
      throw new SyncError("credentialsRequired");
  }
  private target(key: string): string {
    if (!relativePath(key)) throw new SyncError("invalidPath");
    const c = this.config;
    const url = new URL(c.endpoint);
    const prefix = `${c.prefix}/${key}`;
    const s3 = providers[c.provider].transport === "s3";
    if (s3 && !c.pathStyle) url.hostname = `${c.bucket}.${url.hostname}`;
    url.pathname =
      url.pathname.replace(/\/$/, "") +
      "/" +
      encodePath(s3 && c.pathStyle ? `${c.bucket}/${prefix}` : prefix);
    return url.toString();
  }
  private reserve(cleanup: boolean) {
    const cap = providers[this.config.provider].requestLimit;
    if (!Number.isFinite(cap)) return;
    const key = `${this.config.endpoint}:${this.credentials.account}`;
    const recent = (requests.get(key) ?? []).filter(
      (at) => at > Date.now() - 30 * 60_000,
    );
    // Leave bounded headroom for lock verification and temporary-object cleanup.
    if (recent.length >= cap + (cleanup ? 20 : 0))
      throw new SyncError("rateLimited");
    requests.set(key, [...recent, Date.now()]);
  }
  private async request(
    method: string,
    url: string,
    body?: Uint8Array,
    extra: Record<string, string> = {},
    cleanup = false,
  ): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      this.reserve(cleanup);
      let headers: Record<string, string> = { ...extra };
      if (providers[this.config.provider].transport === "s3") {
        const signed = await new AwsV4Signer({
          url,
          method,
          body: body?.slice().buffer,
          headers: {
            ...headers,
            "x-amz-content-sha256": await hash(body ?? new Uint8Array()),
          },
          accessKeyId: this.credentials.account,
          secretAccessKey: this.credentials.secret,
          sessionToken: this.credentials.sessionToken || undefined,
          service: "s3",
          region: this.config.region,
          cache: this.cache,
        }).sign();
        headers = Object.fromEntries(signed.headers.entries());
      } else {
        const bytes = new TextEncoder().encode(
          `${this.credentials.account}:${this.credentials.secret}`,
        );
        headers.Authorization = `Basic ${btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""))}`;
      }
      let response: Response;
      try {
        response = await this.fetch(url, { method, body, headers });
      } catch {
        throw new SyncError("networkError");
      }
      // Only reads and idempotent PUTs retry; a MOVE may already have succeeded.
      if (
        ![429, 502, 503, 504].includes(response.status) ||
        attempt >= 2 ||
        !["GET", "HEAD", "PUT"].includes(method)
      )
        return response;
      const retry = Number(response.headers["retry-after"] ?? "0");
      if (retry > 5) throw new SyncError("rateLimited");
      await this.sleep(Math.max(500 * 2 ** attempt, retry * 1000));
    }
  }
  private require(response: Response) {
    if (response.status >= 200 && response.status < 300) return;
    if ([401, 403].includes(response.status))
      throw new SyncError("permissionError");
    if (response.status === 429) throw new SyncError("rateLimited");
    if (response.status === 507) throw new SyncError("quotaError");
    throw new SyncError("httpError", [response.status]);
  }
  private async parents(key: string) {
    if (providers[this.config.provider].transport !== "dav") return;
    const parts = `${this.config.prefix}/${key}`.split("/").slice(0, -1);
    let path = "";
    for (const part of parts) {
      path += `${encodeURIComponent(part)}/`;
      if (this.dirs.has(path)) continue;
      const res = await this.request(
        "MKCOL",
        `${this.config.endpoint}/${path}`,
      );
      if (res.status !== 405) this.require(res);
      this.dirs.add(path);
    }
  }
  async get(key: string): Promise<Uint8Array | null> {
    const res = await this.request(
      "GET",
      this.target(key),
      undefined,
      {},
      key === LOCK,
    );
    if (res.status === 404) return null;
    this.require(res);
    return res.bytes();
  }
  async has(key: string): Promise<boolean> {
    const res = await this.request("HEAD", this.target(key));
    if (res.status === 404) return false;
    this.require(res);
    return true;
  }
  async put(key: string, bytes: Uint8Array): Promise<void> {
    await this.parents(key);
    this.require(await this.request("PUT", this.target(key), bytes));
  }
  async create(key: string, bytes: Uint8Array): Promise<boolean> {
    if (providers[this.config.provider].transport === "s3") {
      const res = await this.request("PUT", this.target(key), bytes, {
        "If-None-Match": "*",
      });
      if (res.status === 412) return false;
      this.require(res);
      return true;
    }
    // Nutstore supports atomic MOVE with Overwrite:F, including its 409
    // DuplicateName response; a conditional PUT is not portable across DAV servers.
    const temporary = `${key}.tmp-${crypto.randomUUID()}`;
    await this.put(temporary, bytes);
    try {
      const res = await this.request(
        "MOVE",
        this.target(temporary),
        undefined,
        { Destination: this.target(key), Overwrite: "F" },
      );
      if (res.status === 412 || (res.status === 409 && (await this.has(key))))
        return false;
      this.require(res);
      return true;
    } finally {
      await this.remove(temporary).catch(() => {});
    }
  }
  async remove(key: string): Promise<void> {
    const res = await this.request(
      "DELETE",
      this.target(key),
      undefined,
      {},
      true,
    );
    if (res.status !== 404) this.require(res);
  }
}

/** Tests permissions and the exclusion primitive using disposable objects only. */
export async function testConnection(store: ObjectStore) {
  const key = `v1/probes/${crypto.randomUUID()}`;
  const original = crypto.getRandomValues(new Uint8Array(32));
  let created = false;
  try {
    created = await store.create(key, original);
    if (!created) throw new SyncError("unsafeServer");
    if (await store.create(key, new Uint8Array([9])))
      throw new SyncError("unsafeServer");
    const read = await store.get(key);
    if (!read || (await hash(read)) !== (await hash(original)))
      throw new SyncError("unsafeServer");
  } finally {
    if (created) await store.remove(key);
  }
}
