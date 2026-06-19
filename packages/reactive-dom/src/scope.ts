import type { Dispose } from "./types.js";

export interface DomScope {
  disposers?: Dispose[] | undefined;
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
    disposed: false,
  };
}

export function hasScopeDisposers(scope: DomScope): boolean {
  return scope.disposers !== undefined && scope.disposers.length > 0;
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
    dispose();
  };

  (scope.disposers ??= []).push(wrapped);
  return wrapped;
}

export function registerIdempotentDispose(dispose: Dispose): Dispose {
  const scope = activeScope;

  if (scope === null || scope.disposed) {
    return dispose;
  }

  (scope.disposers ??= []).push(dispose);
  return dispose;
}

export function disposeScope(scope: DomScope): void {
  if (scope.disposed) {
    return;
  }

  scope.disposed = true;

  const disposers = scope.disposers;

  if (disposers === undefined || disposers.length === 0) {
    return;
  }

  scope.disposers = undefined;

  if (disposers.length === 1) {
    disposers[0]!();
    return;
  }

  let firstError: unknown;

  for (let index = disposers.length - 1; index >= 0; index -= 1) {
    try {
      disposers[index]!();
    } catch (error) {
      firstError ??= error;
    }
  }

  if (firstError !== undefined) {
    throw firstError;
  }
}
