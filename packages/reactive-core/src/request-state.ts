import { getGlobalRuntimeState } from "./runtime-state.js";

/** Storage owned by one server request. Values are initialized lazily. */
export type RequestStateScope = Map<object, unknown>;

/** AsyncLocalStorage-compatible storage for request state integrations. */
export interface RequestStateStorage {
  getStore(): RequestStateScope | undefined;
  run<T>(scope: RequestStateScope, callback: () => T): T;
}

interface RequestStateRuntime {
  storage?: RequestStateStorage | undefined;
}

function requestStateRuntime(): RequestStateRuntime {
  return getGlobalRuntimeState("__mreactRequestStateRuntime", () => ({}));
}

/** Installs request-local storage. Server adapters install this automatically. */
export function installRequestStateStorage(storage: RequestStateStorage | undefined): void {
  requestStateRuntime().storage = storage;
}

export function getRequestStateStorage(): RequestStateStorage | undefined {
  const runtime = requestStateRuntime();
  if (runtime.storage === undefined) {
    const Storage = (globalThis as { AsyncLocalStorage?: new () => RequestStateStorage })
      .AsyncLocalStorage;
    if (Storage !== undefined) runtime.storage = new Storage();
  }
  return runtime.storage;
}

/**
 * Declares lazily initialized state: one value per server request, or one value in the browser.
 * Create mutable values and their computed dependencies inside the initializer.
 * Server reads outside a request scope throw instead of sharing process-wide state.
 */
export function requestState<T>(initialize: () => T): () => T {
  const key = {};
  let browserValue: { value: T } | undefined;
  return () => {
    const storage = getRequestStateStorage();
    const scope = storage?.getStore();
    if (scope !== undefined) {
      if (!scope.has(key)) scope.set(key, initialize());
      return scope.get(key) as T;
    }
    if (storage !== undefined || typeof document === "undefined") {
      throw new Error("mreact request state requires an active server request scope.");
    }
    browserValue ??= { value: initialize() };
    return browserValue.value;
  };
}

/**
 * Runs work in a fresh request state scope using installed AsyncLocalStorage.
 * Await asynchronous work inside the callback; adapters also bind response body reads.
 */
export function runWithRequestState<T>(callback: () => T): T {
  const storage = getRequestStateStorage();
  if (storage === undefined) {
    throw new Error(
      "mreact request state requires AsyncLocalStorage. Install request state storage first.",
    );
  }
  return storage.run(new Map(), callback);
}
