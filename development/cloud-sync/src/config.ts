import { SyncError, type Config } from "./model";

export const defaults: Config = {
  provider: "s3",
  endpoint: "",
  region: "us-east-1",
  bucket: "",
  prefix: "textus/my-workspace",
  pathStyle: true,
  automatic: false,
  interval: 5,
};
export const providers = {
  s3: { transport: "s3", endpoint: "", requestLimit: Infinity },
  webdav: { transport: "dav", endpoint: "", requestLimit: Infinity },
  nutstore: {
    transport: "dav",
    endpoint: "https://dav.jianguoyun.com/dav",
    requestLimit: 550,
  },
} as const;

export function relativePath(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 1024 &&
    !/[\\\x00-\x1f\x7f:*?"<>|]/.test(value) &&
    value
      .split("/")
      .every(
        (part) =>
          part !== "" &&
          part !== "." &&
          part !== ".." &&
          !/[. ]$/.test(part) &&
          !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
      )
  );
}

export function normalizeConfig(input: Partial<Config>): Config {
  const c = { ...defaults, ...input };
  if (!Object.hasOwn(providers, c.provider))
    throw new SyncError("invalidConfig");
  c.prefix = String(c.prefix)
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (!relativePath(c.prefix)) throw new SyncError("invalidPrefix");
  c.region = String(c.region).trim() || "us-east-1";
  if (!/^[a-z0-9-]+$/.test(c.region)) throw new SyncError("invalidConfig");
  c.bucket = String(c.bucket).trim();
  const spec = providers[c.provider];
  c.endpoint = (spec.endpoint || String(c.endpoint).trim()).replace(/\/+$/, "");
  if (spec.transport === "s3") {
    if (
      !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(c.bucket) ||
      c.bucket.includes("..")
    )
      throw new SyncError("invalidBucket");
    c.endpoint ||= `https://s3.${c.region}.amazonaws.com`;
  } else {
    c.region = "";
    c.bucket = "";
    c.pathStyle = false;
  }
  let url: URL;
  try {
    url = new URL(c.endpoint);
  } catch {
    throw new SyncError("invalidEndpoint");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new SyncError("invalidEndpoint");
  if (
    url.pathname.split("/").some((p) => {
      try {
        return /[\\\x00-\x1f]/.test(decodeURIComponent(p));
      } catch {
        return true;
      }
    })
  )
    throw new SyncError("invalidEndpoint");
  c.endpoint = url.toString().replace(/\/+$/, "");
  c.pathStyle = c.pathStyle !== false;
  c.automatic = c.automatic === true;
  c.interval = Number(c.interval);
  if (!Number.isInteger(c.interval) || c.interval < 5 || c.interval > 1440)
    throw new SyncError("invalidInterval");
  return c;
}

export function identity(c: Config): string {
  return JSON.stringify([
    providers[c.provider].transport,
    c.endpoint,
    c.bucket,
    c.region,
    c.pathStyle,
    c.prefix,
  ]);
}

const documents = /\.(md|markdown|mdown|mkd|txt|csv)$/i;
const attachments =
  /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico|heic|pdf|docx?|xlsx?|pptx?|odt|ods|odp|mp3|wav|m4a|ogg|mp4|mov|webm)$/i;
const ignored = new Set(["node_modules", "dist", "build", "target", "vendor"]);
export const isText = (path: string) =>
  documents.test(path) || /\.svg$/i.test(path);
export function inScope(path: string): boolean {
  if (!relativePath(path)) return false;
  const parts = path.split("/");
  if (parts[0] === ".textus") {
    return (
      /^\.textus\/(agent|style|style\.previous)\.md$/.test(path) ||
      (/^\.textus\/(library|memory|skills)\/.+\.md$/i.test(path) &&
        parts.slice(1).every((p) => !p.startsWith(".")))
    );
  }
  return (
    parts.every((p) => !p.startsWith(".") && !ignored.has(p.toLowerCase())) &&
    (documents.test(path) || attachments.test(path))
  );
}
export function descend(path: string): boolean {
  return (
    relativePath(path) &&
    path
      .split("/")
      .every((p) => !p.startsWith(".") && !ignored.has(p.toLowerCase()))
  );
}
