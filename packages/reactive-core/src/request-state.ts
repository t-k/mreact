import { getGlobalRuntimeState } from "./runtime-state.js";
import {
  createCleanupScope,
  runDetached,
  runWithCleanupScope,
  type CleanupScope,
} from "./cleanup-scope.js";

/** Storage owned by one server request. Values are initialized lazily. */
export type RequestStateScope = Map<object, unknown>;

/** AsyncLocalStorage-compatible storage for request state integrations. */
export interface RequestStateStorage {
  getStore(): RequestStateScope | undefined;
  run<T>(scope: RequestStateScope, callback: () => T): T;
}

interface RequestStateRuntime {
  storage?: RequestStateStorage | undefined;
  owners?: WeakMap<RequestStateScope, CleanupScope | null>;
}

function requestStateRuntime(): RequestStateRuntime {
  return getGlobalRuntimeState("__mreactRequestStateRuntime", () => ({}));
}

function requestStateOwners(): WeakMap<RequestStateScope, CleanupScope | null> {
  return (requestStateRuntime().owners ??= new WeakMap());
}

/** Ends an adapter-owned scope; an existing operation error takes precedence over cleanup errors. */
export function disposeRequestStateScope(scope: RequestStateScope, suppressErrors = false): void {
  const owners = requestStateOwners();
  const owner = owners.get(scope);
  // Keep a tombstone so detached callbacks cannot initialize new resources.
  owners.set(scope, null);
  try {
    owner?.dispose();
  } catch (error) {
    if (!suppressErrors) throw error;
  }
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
 * Initializer resources belong to the request, independently of the calling component.
 * Server reads outside a request scope throw instead of sharing process-wide state.
 */
export function requestState<T>(initialize: () => T): () => T {
  const key = {};
  let browserValue: { value: T } | undefined;
  return () => {
    const storage = getRequestStateStorage();
    const scope = storage?.getStore();
    if (scope !== undefined) {
      if (!scope.has(key)) {
        const owners = requestStateOwners();
        let owner = owners.get(scope);
        if (owner === null) throw new Error("mreact request state scope has ended.");
        if (owner === undefined) {
          owner = createCleanupScope();
          owners.set(scope, owner);
        }
        scope.set(key, runWithCleanupScope(owner, initialize));
      }
      return scope.get(key) as T;
    }
    if (storage !== undefined || typeof document === "undefined") {
      throw new Error("mreact request state requires an active server request scope.");
    }
    browserValue ??= { value: runDetached(initialize) };
    return browserValue.value;
  };
}

/**
 * Runs work in a fresh request state scope using installed AsyncLocalStorage.
 * Disposes initializer resources when the callback returns or its promise settles.
 * Await all work, including stream consumption, inside the callback.
 */
export function runWithRequestState<T>(callback: () => T): T {
  const storage = getRequestStateStorage();
  if (storage === undefined) {
    throw new Error(
      "mreact request state requires AsyncLocalStorage. Install request state storage first.",
    );
  }
  const scope: RequestStateScope = new Map();
  return storage.run(scope, () => {
    try {
      const result = callback();
      if (
        result !== null &&
        (typeof result === "object" || typeof result === "function") &&
        typeof (result as { then?: unknown }).then === "function"
      ) {
        return Promise.resolve(result).then(
          (value) => {
            disposeRequestStateScope(scope);
            return value;
          },
          (error: unknown) => {
            disposeRequestStateScope(scope, true);
            throw error;
          },
        ) as T;
      }
      disposeRequestStateScope(scope);
      return result;
    } catch (error) {
      disposeRequestStateScope(scope, true);
      throw error;
    }
  });
}
