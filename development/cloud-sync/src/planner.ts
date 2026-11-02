import type { Entry } from "./model";

export type Action = {
  path: string;
  kind: "upload" | "download" | "conflict" | "equal";
};
export function plan(
  local: Record<string, Entry>,
  remote: Record<string, Entry>,
  base: Record<string, string>,
): Action[] {
  return [...new Set([...Object.keys(local), ...Object.keys(remote)])]
    .sort()
    .map((path) => {
      const l = local[path]?.hash,
        r = remote[path]?.hash,
        b = base[path];
      const kind =
        l === r
          ? "equal"
          : !l
            ? "download"
            : !r
              ? "upload"
              : l === b
                ? "download"
                : r === b
                  ? "upload"
                  : "conflict";
      return { path, kind };
    });
}
export function conflictPath(path: string, hash: string): string {
  const safe = path.replace(/^\.textus\//, "Textus project/");
  const dot = safe.lastIndexOf(".");
  const end = dot > safe.lastIndexOf("/") + 1 ? dot : safe.length;
  return `Sync conflicts/${safe.slice(0, end)} (${hash.slice(0, 8)})${safe.slice(end)}`;
}
