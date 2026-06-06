import type { Dispose } from "./types.js";

interface DomScope {
  disposers: Set<Dispose>;
  disposed: boolean;
}

let activeScope: DomScope | null = null;

export function withScope<T>(scope: DomScope, fn: () => T): T {
  const previous = activeScope;
  activeScope = scope;

  try {
    return fn();
  } finally {
    activeScope = previous;
  }
}

export function createScope(): DomScope {
  return {
    disposers: new Set(),
    disposed: false,
  };
}

export function registerDispose(dispose: Dispose): Dispose {
  const scope = activeScope;

  if (scope === null || scope.disposed) {
    return dispose;
  }

  let active = true;
  const wrapped = () => {
    if (!active) {
      return;
    }

    active = false;
    scope.disposers.delete(wrapped);
    dispose();
  };

  scope.disposers.add(wrapped);
  return wrapped;
}

export function disposeScope(scope: DomScope): void {
  if (scope.disposed) {
    return;
  }

  scope.disposed = true;

  if (scope.disposers.size === 0) {
    return;
  }

  const disposers = Array.from(scope.disposers).reverse();
  scope.disposers.clear();

  let firstError: unknown;

  for (const dispose of disposers) {
    try {
      dispose();
    } catch (error) {
      firstError ??= error;
    }
  }

  if (firstError !== undefined) {
    throw firstError;
  }
}
