import type { BuiltPrerenderedRoute } from "./build.js";
import type { AppRouterPrerenderStore } from "./serve.js";

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

function storeKey(namespace: string, path: string): string {
  return `${namespace}\0${path}`;
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
