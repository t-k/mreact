/** Options for a bounded, in-memory history-entry snapshot store. */
export interface NavigationSnapshotStoreOptions {
  maxEntries?: number;
  ttlMs?: number;
  maxBytes?: number;
}

/** Saves JSON values against the current browser history entry. */
export interface NavigationSnapshotStore {
  save(key: string, value: unknown): boolean;
  load<T = unknown>(key: string): T | undefined;
  clear(): void;
}

interface SnapshotEntry {
  expiresAt: number;
  values: Map<string, string>;
}

/** Creates a bounded snapshot store for back/forward navigation within one document. */
export function createNavigationSnapshotStore(
  options: NavigationSnapshotStoreOptions = {},
): NavigationSnapshotStore {
  const maxEntries = options.maxEntries ?? 20;
  const ttlMs = options.ttlMs ?? 30 * 60_000;
  const maxBytes = options.maxBytes ?? 32_768;
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new Error("maxEntries must be positive");
  if (!Number.isFinite(ttlMs) || ttlMs < 0) throw new Error("ttlMs must be nonnegative");
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("maxBytes must be positive");

  const entries = new Map<string, SnapshotEntry>();

  function currentEntryId(create: boolean): string | undefined {
    if (typeof history === "undefined" || typeof location === "undefined") return undefined;
    const state: unknown = history.state;
    if (state !== null && typeof state === "object" && !Array.isArray(state)) {
      const id = (state as { __mreactEntryId?: unknown }).__mreactEntryId;
      if (typeof id === "string" && id !== "") return id;
    }
    if (!create || (state !== null && (typeof state !== "object" || Array.isArray(state)))) {
      return undefined;
    }
    const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    try {
      history.replaceState({ ...state, __mreactEntryId: id }, "", location.href);
      return id;
    } catch {
      return undefined;
    }
  }

  function activeEntry(id: string): SnapshotEntry | undefined {
    const entry = entries.get(id);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= Date.now()) {
      entries.delete(id);
      return undefined;
    }
    entries.delete(id);
    entries.set(id, entry);
    return entry;
  }

  return {
    save(key, value) {
      if (key === "") return false;
      let serialized: string | undefined;
      try {
        serialized = JSON.stringify(value);
      } catch {
        return false;
      }
      if (serialized === undefined || new TextEncoder().encode(serialized).length > maxBytes) return false;
      const id = currentEntryId(true);
      if (id === undefined) return false;
      const entry = activeEntry(id) ?? { expiresAt: Date.now() + ttlMs, values: new Map() };
      entry.expiresAt = Date.now() + ttlMs;
      entry.values.set(key, serialized);
      entries.delete(id);
      entries.set(id, entry);
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
      return true;
    },
    load<T>(key: string): T | undefined {
      const id = currentEntryId(false);
      if (id === undefined) return undefined;
      const serialized = activeEntry(id)?.values.get(key);
      return serialized === undefined ? undefined : JSON.parse(serialized) as T;
    },
    clear() {
      entries.clear();
    },
  };
}
