declare const process: { env: { NODE_ENV?: string | undefined } } | undefined;

declare global {
  interface ImportMeta {
    readonly env: { readonly DEV: boolean };
  }
}

export function createDuplicateKeyWarning(): ((key: unknown) => void) | undefined {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
    return undefined;
  }

  const warnedObjects = new WeakSet<object>();
  const warnedPrimitives = new Set<unknown>();
  return (key) => {
    if ((typeof key === "object" && key !== null) || typeof key === "function") {
      if (warnedObjects.has(key)) return;
      warnedObjects.add(key);
    } else {
      if (warnedPrimitives.has(key)) return;
      if (warnedPrimitives.size >= 100) return;
      warnedPrimitives.add(key);
    }

    console.warn(`[mreact] List contains duplicate key ${formatKey(key)}; later rows are skipped.`);
  };
}

function formatKey(key: unknown): string {
  try {
    return JSON.stringify(String(key));
  } catch {
    return "<unprintable>";
  }
}
