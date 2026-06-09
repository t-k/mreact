import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BuiltPrerenderedRoute } from "./build.js";
import type { AppRouterPrerenderStore } from "./serve.js";

/**
 * Configures the process-local prerender store used for cached prerendered routes.
 */
export interface MemoryPrerenderStoreOptions {
  backing?: Map<string, MemoryPrerenderStoreEntry>;
  maxEntries?: number;
  namespace?: string;
  now?: () => number;
  ttlMs?: number;
}

export interface MemoryPrerenderStoreEntry {
  entry: BuiltPrerenderedRoute;
  expiresAt: number;
  lastAccessedAt: number;
}

/**
 * Configures a filesystem-backed prerender store.
 */
export interface FileSystemPrerenderStoreOptions {
  directory: string;
  lockPollMs?: number;
  lockTimeoutMs?: number;
  namespace?: string;
}

/**
 * Defines the adapter API used by key-value prerender stores.
 */
export interface KeyValuePrerenderStoreAdapter {
  delete(key: string): void | Promise<void>;
  get(key: string): string | undefined | Promise<string | undefined>;
  set(key: string, value: string, options?: { ttlMs?: number | undefined }): void | Promise<void>;
  withLock?<T>(key: string, task: (token: string) => Promise<T>): Promise<T>;
}

/**
 * Configures a key-value-backed prerender store.
 */
export interface KeyValuePrerenderStoreOptions {
  adapter: KeyValuePrerenderStoreAdapter;
  namespace?: string;
  ttlMs?: number;
}

/**
 * Creates an in-memory prerender store with optional TTL and LRU eviction.
 */
export function createMemoryPrerenderStore(
  options: MemoryPrerenderStoreOptions = {},
): AppRouterPrerenderStore {
  const backing = options.backing ?? new Map<string, MemoryPrerenderStoreEntry>();
  const locks = new Map<string, Promise<void>>();
  const namespace = options.namespace ?? "default";
  const now = options.now ?? Date.now;
  const maxEntries = options.maxEntries ?? Number.POSITIVE_INFINITY;
  const ttlMs = options.ttlMs ?? Number.POSITIVE_INFINITY;

  return {
    delete(path) {
      backing.delete(storeKey(namespace, path));
    },
    get(path) {
      const key = storeKey(namespace, path);
      const current = backing.get(key);

      if (current === undefined) {
        return undefined;
      }

      if (current.expiresAt <= now()) {
        backing.delete(key);
        return undefined;
      }

      current.lastAccessedAt = now();
      return current.entry;
    },
    set(path, entry) {
      backing.set(storeKey(namespace, path), {
        entry,
        expiresAt: now() + ttlMs,
        lastAccessedAt: now(),
      });
      evictLeastRecentlyUsed(backing, namespace, maxEntries);
    },
    async withLock(path, task) {
      const key = storeKey(namespace, path);
      const previous = locks.get(key) ?? Promise.resolve();
      let release: () => void = () => undefined;
      const current = new Promise<void>((resolve) => {
        release = resolve;
      });
      const queued = previous.then(() => current, () => current);
      locks.set(key, queued);

      await previous.catch(() => undefined);

      try {
        return await task();
      } finally {
        release();
        if (locks.get(key) === queued) {
          locks.delete(key);
        }
      }
    },
  };
}

/**
 * Creates a prerender store that persists entries as JSON files.
 */
export function createFileSystemPrerenderStore(
  options: FileSystemPrerenderStoreOptions,
): AppRouterPrerenderStore {
  const namespace = options.namespace ?? "default";
  const lockPollMs = options.lockPollMs ?? 5;
  const lockTimeoutMs = options.lockTimeoutMs ?? 5_000;

  return {
    async delete(path) {
      await rm(filePath(options.directory, namespace, path), { force: true });
    },
    async get(path) {
      try {
        return JSON.parse(
          await readFile(filePath(options.directory, namespace, path), "utf8"),
        ) as BuiltPrerenderedRoute;
      } catch (error) {
        if (isNodeError(error, "ENOENT")) {
          return undefined;
        }

        throw error;
      }
    },
    async set(path, entry) {
      const target = filePath(options.directory, namespace, path);
      const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;

      await mkdir(dirname(target), { recursive: true });
      await writeFile(temporary, JSON.stringify(entry), "utf8");
      await rename(temporary, target);
    },
    async withLock(path, task) {
      const lock = `${filePath(options.directory, namespace, path)}.lock`;
      const startedAt = Date.now();

      while (true) {
        try {
          await mkdir(lock, { recursive: false });
          break;
        } catch (error) {
          if (!isNodeError(error, "EEXIST")) {
            throw error;
          }

          if (Date.now() - startedAt > lockTimeoutMs) {
            throw new Error(`Timed out acquiring prerender lock for ${path}.`);
          }

          await new Promise((resolve) => setTimeout(resolve, lockPollMs));
        }
      }

      try {
        return await task();
      } finally {
        await rm(lock, { force: true, recursive: true });
      }
    },
  };
}

/**
 * Creates a prerender store backed by a caller-provided key-value adapter.
 */
export function createKeyValuePrerenderStore(
  options: KeyValuePrerenderStoreOptions,
): AppRouterPrerenderStore {
  const namespace = options.namespace ?? "default";
  const store: AppRouterPrerenderStore = {
    delete(path) {
      return options.adapter.delete(keyValueStoreKey(namespace, path));
    },
    async get(path) {
      const value = await options.adapter.get(keyValueStoreKey(namespace, path));

      return value === undefined ? undefined : JSON.parse(value) as BuiltPrerenderedRoute;
    },
    set(path, entry) {
      return options.adapter.set(
        keyValueStoreKey(namespace, path),
        JSON.stringify(entry),
        { ttlMs: options.ttlMs },
      );
    },
  };

  if (options.adapter.withLock !== undefined) {
    store.withLock = (path, task) =>
      options.adapter.withLock?.(keyValueStoreKey(namespace, path), async () => await task()) ??
        task();
  }

  return store;
}

function storeKey(namespace: string, path: string): string {
  return `${namespace}\0${path}`;
}

function keyValueStoreKey(namespace: string, path: string): string {
  return `${namespace}:${path}`;
}

function filePath(directory: string, namespace: string, path: string): string {
  const digest = createHash("sha256")
    .update(storeKey(namespace, path))
    .digest("hex");

  return join(directory, namespace, `${digest}.json`);
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === code;
}

function evictLeastRecentlyUsed(
  backing: Map<string, MemoryPrerenderStoreEntry>,
  namespace: string,
  maxEntries: number,
): void {
  if (!Number.isFinite(maxEntries) || maxEntries < 0) {
    return;
  }

  const prefix = `${namespace}\0`;
  const entries = Array.from(backing.entries())
    .filter(([key]) => key.startsWith(prefix))
    .sort(([, left], [, right]) => left.lastAccessedAt - right.lastAccessedAt);

  for (const [key] of entries.slice(0, Math.max(0, entries.length - maxEntries))) {
    backing.delete(key);
  }
}
