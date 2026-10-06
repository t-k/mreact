import { readFile, readdir, stat } from "node:fs/promises";
import { isAbsolute, join, normalize, relative, sep } from "node:path";
import type { ClientRouteManifestEntry } from "./client-route-inference.js";
import { clientManifestAssetPaths } from "./client-manifest-assets.js";
import { bytesResponse, rawNodeRequestUrl } from "./http.js";

const builtPublicAssetCache = new Map<
  string,
  {
    bytes: Uint8Array;
    headers: HeadersInit;
  }
>();
const MAX_PUBLIC_ASSET_CACHE_BYTES = 32 * 1024 * 1024;
const MAX_PUBLIC_ASSET_CACHE_ENTRY_BYTES = 2 * 1024 * 1024;
const MAX_PUBLIC_ASSET_CACHE_ENTRIES = 1024;
let builtPublicAssetCacheBytes = 0;

export async function readBuiltClientAsset(
  outDir: string,
  pathname: string,
  allowedPaths: ReadonlySet<string>,
): Promise<Response> {
  const clientPrefix = "/_mreact/client/";
  const normalized = safeBuiltClientAssetPath(pathname.slice(clientPrefix.length));

  if (normalized === undefined || !allowedPaths.has(normalized)) {
    return new Response("Not Found", { status: 404 });
  }

  try {
    const code = await readFile(join(outDir, "client", normalized), "utf8");

    return new Response(code, {
      headers: clientAssetHeaders(normalized),
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}

export function builtClientAssetPathname(request: Request, url: URL): string | undefined {
  const rawUrl = rawNodeRequestUrl(request);
  const rawPathname = rawUrl?.split(/[?#]/, 1)[0];
  const pathname = rawPathname === undefined || rawPathname === "" ? url.pathname : rawPathname;
  const normalizedPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;

  return normalizedPathname.startsWith("/_mreact/client/") ? normalizedPathname : undefined;
}

function safeBuiltClientAssetPath(relativePath: string): string | undefined {
  let decoded: string;

  try {
    decoded = decodeURIComponent(relativePath);
  } catch {
    return undefined;
  }

  return safeRelativeBuiltAssetPath(decoded);
}

function safeRelativeBuiltAssetPath(decoded: string): string | undefined {
  if (decoded.includes("\\") || decoded.includes("\0")) {
    return undefined;
  }

  if (decoded.split("/").some((segment) => segment === "..")) {
    return undefined;
  }

  const normalized = normalize(decoded);

  if (isAbsolute(normalized) || normalized === ".." || normalized.startsWith(`..${sep}`)) {
    return undefined;
  }

  return normalized;
}

export async function readBuiltPublicAssetPaths(
  outDir: string,
  publicAssets: readonly string[] | undefined,
): Promise<ReadonlySet<string> | undefined> {
  if (publicAssets !== undefined) {
    const paths = new Set<string>();
    for (const pathname of publicAssets) {
      const normalized = safeRelativeBuiltAssetPath(
        pathname.startsWith("/") ? pathname.slice(1) : pathname,
      );
      if (normalized !== undefined) paths.add(normalized);
    }
    return paths;
  }

  // Older builds omitted the manifest field, including when no assets existed.
  // Discover their files once when materializing the runtime, not per request.
  const publicDir = join(outDir, "client", "public");
  try {
    const entries = await readdir(publicDir, { recursive: true, withFileTypes: true });
    const paths = new Set<string>();
    for (const entry of entries) {
      const entryPath = join(entry.parentPath, entry.name);
      if (entry.isSymbolicLink()) {
        try {
          if ((await stat(entryPath)).isDirectory()) {
            // Recursive readdir does not follow directory symlinks. Keep legacy access working.
            return undefined;
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
          throw error;
        }
      }
      if (entry.isFile() || entry.isSymbolicLink()) paths.add(relative(publicDir, entryPath));
    }
    return paths;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Set();
    return undefined;
  }
}

export function builtClientAssetPaths(manifest: {
  assets?: readonly string[] | undefined;
  routes: readonly ClientRouteManifestEntry[];
}): ReadonlySet<string> {
  return clientManifestAssetPaths(manifest);
}

export async function readBuiltPublicAsset(
  outDir: string,
  pathname: string,
  allowedPaths?: ReadonlySet<string> | undefined,
): Promise<Response | undefined> {
  const relativePath = pathname.startsWith("/") ? pathname.slice(1) : pathname;

  if (relativePath === "") {
    return undefined;
  }

  const normalized = safeBuiltClientAssetPath(relativePath);
  if (normalized === undefined || (allowedPaths !== undefined && !allowedPaths.has(normalized))) {
    return undefined;
  }

  try {
    const cacheKey = `${outDir}\0${normalized}`;
    const cached = builtPublicAssetCache.get(cacheKey);

    if (cached !== undefined) {
      return bytesResponse(cached.bytes, {
        headers: cached.headers,
      });
    }

    const bytes = await readFile(join(outDir, "client", "public", normalized));
    const headers = publicAssetHeaders(normalized);

    if (bytes.byteLength <= MAX_PUBLIC_ASSET_CACHE_ENTRY_BYTES) {
      // Concurrent reads may have filled the same key while this read awaited I/O.
      const previous = builtPublicAssetCache.get(cacheKey);
      if (previous !== undefined) {
        builtPublicAssetCacheBytes -= previous.bytes.byteLength;
        builtPublicAssetCache.delete(cacheKey);
      }
      while (
        builtPublicAssetCacheBytes + bytes.byteLength > MAX_PUBLIC_ASSET_CACHE_BYTES ||
        builtPublicAssetCache.size >= MAX_PUBLIC_ASSET_CACHE_ENTRIES
      ) {
        const oldestKey = builtPublicAssetCache.keys().next().value;
        if (oldestKey === undefined) break;
        const oldest = builtPublicAssetCache.get(oldestKey)!;
        builtPublicAssetCacheBytes -= oldest.bytes.byteLength;
        builtPublicAssetCache.delete(oldestKey);
      }
      builtPublicAssetCache.set(cacheKey, { bytes, headers });
      builtPublicAssetCacheBytes += bytes.byteLength;
    }

    return bytesResponse(bytes, { headers });
  } catch {
    return undefined;
  }
}

export function clearBuiltPublicAssetCacheForTest(): void {
  builtPublicAssetCache.clear();
  builtPublicAssetCacheBytes = 0;
}

export function getBuiltPublicAssetCacheBytesForTest(): number {
  return builtPublicAssetCacheBytes;
}

export function getBuiltPublicAssetCacheSizeForTest(): number {
  return builtPublicAssetCache.size;
}

function clientAssetHeaders(pathname: string): HeadersInit {
  if (pathname === "manifest.json") {
    return {
      "cache-control": "no-cache",
      "content-type": "application/json; charset=utf-8",
    };
  }

  return {
    "cache-control": "public, max-age=31536000, immutable",
    "content-type": pathname.endsWith(".css")
      ? "text/css; charset=utf-8"
      : "text/javascript; charset=utf-8",
  };
}

function publicAssetHeaders(pathname: string): HeadersInit {
  return {
    "cache-control": "public, max-age=3600",
    "content-type": publicAssetContentType(pathname),
  };
}

function publicAssetContentType(pathname: string): string {
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".json")) return "application/json; charset=utf-8";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".ico")) return "image/x-icon";
  if (pathname.endsWith(".txt")) return "text/plain; charset=utf-8";

  return "application/octet-stream";
}
