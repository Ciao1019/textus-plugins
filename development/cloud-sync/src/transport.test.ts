import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { createHash, createHmac } from "node:crypto";
import { normalizeConfig } from "./config";
import { RemoteStore, testConnection, type Fetch } from "./transport";
import { bytes, text } from "./test-fixtures";
import { LOCK } from "./model";

const account = "TEST_ACCESS_KEY",
  secret = "test-only-secret";
const objects = new Map<string, Buffer>();
const recorded: {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}[] = [];
let server: Server, endpoint: string;
let mode = "normal",
  failures = 0;
const digest = (v: string | Buffer) =>
  createHash("sha256").update(v).digest("hex");
const hmac = (key: string | Buffer, value: string) =>
  createHmac("sha256", key).update(value).digest();

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    const path = req.url!,
      method = req.method!;
    recorded.push({ method, path, headers: req.headers, body });
    if (mode === "forbidden") {
      res.writeHead(403).end("secret should not appear");
      return;
    }
    if (mode === "retry" && failures++ < 2) {
      res.writeHead(503).end();
      return;
    }
    if (method === "MKCOL") {
      res.writeHead(405).end();
      return;
    }
    if (method === "GET" || method === "HEAD") {
      const value = objects.get(path);
      res
        .writeHead(value ? 200 : 404)
        .end(method === "HEAD" ? undefined : value);
    } else if (method === "PUT") {
      if (
        req.headers["if-none-match"] === "*" &&
        objects.has(path) &&
        mode !== "unsafe"
      ) {
        res.writeHead(412).end();
        return;
      }
      objects.set(path, body);
      res.writeHead(201).end();
    } else if (method === "MOVE") {
      const destination = new URL(String(req.headers.destination)).pathname;
      if (mode === "missingMove") {
        res.writeHead(409).end();
        return;
      }
      if (objects.has(destination) && req.headers.overwrite === "F") {
        res.writeHead(409).end("DuplicateName");
        return;
      }
      objects.set(destination, objects.get(path)!);
      objects.delete(path);
      res.writeHead(201).end();
    } else if (method === "DELETE") {
      objects.delete(path);
      res.writeHead(204).end();
    } else res.writeHead(405).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  endpoint = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const localFetch: Fetch = async (url, init = {}) => {
  const original = new URL(url);
  const response = await fetch(endpoint + original.pathname + original.search, {
    method: init.method,
    headers: { ...init.headers, "x-original-host": original.host },
    body:
      init.body instanceof Uint8Array ? init.body.slice().buffer : init.body,
  });
  const data = new Uint8Array(await response.arrayBuffer());
  return {
    status: response.status,
    ok: response.ok,
    headers: Object.fromEntries(response.headers),
    bytes: async () => data,
    text: async () => new TextDecoder().decode(data),
    json: async () => JSON.parse(new TextDecoder().decode(data)),
  };
};
const make = (provider: "s3" | "webdav" | "nutstore", extra = {}) =>
  new RemoteStore(
    normalizeConfig({
      provider,
      endpoint: "https://store.example/dav",
      bucket: "my-bucket",
      prefix: `notes/${crypto.randomUUID()}`,
      ...extra,
    }),
    { account, secret },
    localFetch,
    async () => {},
  );

describe("storage protocols over HTTP", () => {
  it.each(["s3", "webdav", "nutstore"] as const)(
    "%s reads, writes, excludes concurrent creation and cleans up probes",
    async (provider) => {
      mode = "normal";
      const store = make(provider);
      const count = objects.size;
      await testConnection(store);
      expect(objects.size).toBe(count);
      expect(await store.create("文件/with space.bin", bytes("one"))).toBe(
        true,
      );
      expect(await store.create("文件/with space.bin", bytes("two"))).toBe(
        false,
      );
      expect(text(await store.get("文件/with space.bin"))).toBe("one");
      await store.remove("文件/with space.bin");
      expect(await store.has("文件/with space.bin")).toBe(false);
      expect(objects.size).toBe(count);
    },
  );
  it("signs S3 requests correctly with the payload digest and regional credential scope", async () => {
    const store = make("s3", { region: "ap-southeast-1" });
    await store.put("文件/space + sign.bin", bytes("payload"));
    const r = recorded.at(-1)!;
    const auth = String(r.headers.authorization);
    const [, credential, signedHeaders, signature] = auth.match(
      /^AWS4-HMAC-SHA256 Credential=([^,]+), SignedHeaders=([^,]+), Signature=([a-f0-9]+)$/,
    )!;
    expect(credential).toContain("/ap-southeast-1/s3/aws4_request");
    expect(r.headers["x-amz-content-sha256"]).toBe(digest(r.body));
    const canonicalHeaders = signedHeaders
      .split(";")
      .map(
        (key) =>
          `${key}:${key === "host" ? r.headers["x-original-host"] : r.headers[key]}`,
      )
      .join("\n");
    const canonical = [
      r.method,
      r.path,
      "",
      canonicalHeaders + "\n",
      signedHeaders,
      digest(r.body),
    ].join("\n");
    const scope = credential.slice(account.length + 1);
    const [date, region, service] = scope.split("/");
    const key = hmac(
      hmac(hmac(hmac(`AWS4${secret}`, date), region), service),
      "aws4_request",
    );
    const expected = hmac(
      key,
      [
        "AWS4-HMAC-SHA256",
        r.headers["x-amz-date"],
        scope,
        digest(canonical),
      ].join("\n"),
    ).toString("hex");
    expect(signature).toBe(expected);
  });
  it("uses virtual-hosted addressing when requested", async () => {
    await make("s3", { endpoint: "https://s3.example", pathStyle: false }).put(
      "object",
      bytes("a"),
    );
    const r = recorded.at(-1)!;
    expect(r.headers["x-original-host"]).toBe("my-bucket.s3.example");
    expect(r.path).not.toContain("my-bucket");
  });
  it("refuses services that ignore exclusive creation", async () => {
    mode = "unsafe";
    try {
      await expect(testConnection(make("s3"))).rejects.toThrow("unsafeServer");
    } finally {
      mode = "normal";
    }
  });
  it("does not mistake a missing DAV destination for a conflicting existing lock", async () => {
    mode = "missingMove";
    try {
      await expect(make("webdav").create("lock", bytes("x"))).rejects.toThrow(
        "httpError",
      );
    } finally {
      mode = "normal";
    }
  });
  it("redacts service error bodies and does not retry authentication failures", async () => {
    mode = "forbidden";
    const start = recorded.length;
    try {
      await expect(make("s3").get("object")).rejects.toMatchObject({
        message: "permissionError",
      });
    } finally {
      mode = "normal";
    }
    expect(recorded.length - start).toBe(1);
  });
  it("retries transient idempotent requests with a bounded budget", async () => {
    mode = "retry";
    failures = 0;
    const start = recorded.length;
    try {
      await make("s3").put("object", bytes("x"));
    } finally {
      mode = "normal";
    }
    expect(recorded.length - start).toBe(3);
  });
  it("can release its lock after Nutstore's transfer budget is exhausted", async () => {
    const store = new RemoteStore(
      normalizeConfig({ provider: "nutstore" }),
      { account: `rate-test-${crypto.randomUUID()}`, secret },
      localFetch,
    );
    expect(await store.create(LOCK, bytes("owner"))).toBe(true);
    for (let i = 0; i < 550; i++) {
      try {
        await store.has("missing-block");
      } catch (error) {
        expect(error).toMatchObject({ message: "rateLimited" });
        break;
      }
    }
    await expect(store.has("missing-block")).rejects.toThrow("rateLimited");
    expect(text(await store.get(LOCK))).toBe("owner");
    await store.remove(LOCK);
    expect(await store.get(LOCK)).toBeNull();
  });
});
