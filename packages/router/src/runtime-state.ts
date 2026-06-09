type RuntimeGlobal = typeof globalThis & Record<string, unknown>;
type RuntimeStateRoot = Record<string, unknown>;

const namespace = "__mreactRouterRuntimeState";

/**
 * Reads or initializes shared server runtime state stored on `globalThis`.
 */
export function getServerRuntimeState<TState extends object>(
  key: string,
  create: () => TState,
): TState {
  const global = globalThis as RuntimeGlobal;
  const root = getOrCreateRoot(global);
  const existing = root[key];

  if (existing !== undefined) {
    return existing as TState;
  }

  const state = create();
  root[key] = state;
  return state;
}

function getOrCreateRoot(global: RuntimeGlobal): RuntimeStateRoot {
  const existing = global[namespace];

  if (isRuntimeGlobal(existing)) {
    return existing;
  }

  const root: RuntimeStateRoot = {};
  global[namespace] = root;
  return root;
}

function isRuntimeGlobal(value: unknown): value is RuntimeStateRoot {
  return typeof value === "object" && value !== null;
}
