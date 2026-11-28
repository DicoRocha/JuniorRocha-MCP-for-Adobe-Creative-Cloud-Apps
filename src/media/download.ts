/**
 * Download a file from an http(s) link to the user's disk, from the MCP server process (Node fetch). Used for images
 * and videos made by external generators (Magnific, Higgsfield...) when the chat cannot hand the file over: the
 * server runs on the user's machine, so it reaches the link even when the assistant's own sandbox cannot.
 */
import * as fs from "node:fs";
import * as path from "node:path";

export const DOWNLOAD_MAX_BYTES = 800 * 1024 * 1024;

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav"
};

export interface DownloadResult {
  filePath: string;
  bytes: number;
  contentType: string | null;
  status: number;
}

/** Target path: keeps the given extension, or adds one from the content type when the path has none. */
export function resolveTarget(filePath: string, contentType: string | null): string {
  if (path.extname(filePath)) return filePath;
  const ext = contentType ? EXT_BY_TYPE[contentType.split(";")[0].trim().toLowerCase()] : undefined;
  return ext ? filePath + ext : filePath;
}

export function checkUrl(url: string): URL {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw Object.assign(new Error(`Not a valid link: ${url}`), { code: "INVALID_PARAMS" });
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw Object.assign(new Error("Only http(s) links can be downloaded."), { code: "INVALID_PARAMS" });
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    throw Object.assign(new Error("Links to this computer or the local network are not downloaded."), { code: "INVALID_PARAMS" });
  }
  return u;
}

export async function downloadUrl(url: string, filePath: string, opts: { overwrite?: boolean; maxBytes?: number } = {}): Promise<DownloadResult> {
  checkUrl(url);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw Object.assign(new Error(`The link answered ${res.status} ${res.statusText}.`), { code: "DOWNLOAD_FAILED" });
  const type = res.headers.get("content-type");
  const target = resolveTarget(filePath, type);
  if (fs.existsSync(target) && opts.overwrite === false) throw Object.assign(new Error(`File exists: ${target}`), { code: "OUTPUT_EXISTS" });
  const max = opts.maxBytes ?? DOWNLOAD_MAX_BYTES;
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > max) throw Object.assign(new Error(`File too large (${declared} bytes).`), { code: "TOO_LARGE" });
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > max) throw Object.assign(new Error(`File too large (${buf.length} bytes).`), { code: "TOO_LARGE" });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.part`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, target);
  return { filePath: target, bytes: buf.length, contentType: type, status: res.status };
}
