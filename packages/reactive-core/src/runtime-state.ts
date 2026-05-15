type RuntimeGlobal = typeof globalThis & Record<string, unknown>;

export function getGlobalRuntimeState<TState extends object>(
  key: string,
  create: () => TState,
): TState {
  const global = globalThis as RuntimeGlobal;
  const existing = global[key];

  if (existing !== undefined) {
    return existing as TState;
  }

  const state = create();
  global[key] = state;
  return state;
}
