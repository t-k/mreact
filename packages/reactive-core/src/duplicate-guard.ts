interface DuplicateCopyState {
  first: string;
  seen: Set<string>;
}

const duplicateCopyStateKey = "__mreactReactiveCoreCopies";

type DuplicateCopyGlobal = typeof globalThis & {
  [duplicateCopyStateKey]?: DuplicateCopyState;
};

function modulePathname(moduleUrl: string): string {
  try {
    return new URL(moduleUrl).pathname;
  } catch {
    return moduleUrl;
  }
}

/**
 * Warns when a second copy of reactive-core evaluates in the same browser
 * page. Cells and computeds from one copy are invisible to the other, so
 * cross-package reactivity silently breaks (for example when a bundler
 * prebundles one mreact package while serving another as source). Server and
 * test realms stay untouched: module runners and `vi.resetModules` legitimately
 * re-evaluate modules there, and the duplication failure mode is browser-only.
 */
export function warnOnDuplicateReactiveCoreCopy(moduleUrl: string): void {
  if (typeof document === "undefined" || typeof console === "undefined") {
    return;
  }

  const global = globalThis as DuplicateCopyGlobal;
  const pathname = modulePathname(moduleUrl);
  const state = (global[duplicateCopyStateKey] ??= { first: pathname, seen: new Set() });

  if (state.seen.has(pathname) || pathname === state.first) {
    return;
  }

  state.seen.add(pathname);
  console.warn(
    `[mreact] Multiple copies of @reckona/mreact-reactive-core are loaded in this page.\n` +
      `  first copy: ${state.first}\n` +
      `  duplicate copy: ${pathname}\n` +
      `Cells created by one copy are invisible to computeds and effects in the other, ` +
      `so cross-package reactivity silently breaks. In Vite dev this usually means an ` +
      `mreact package was prebundled; keep every @reckona/mreact* package listed in ` +
      `optimizeDeps.exclude (the @reckona/mreact-router Vite plugin applies the full list automatically).`,
  );
}
