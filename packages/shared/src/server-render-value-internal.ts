const serverRenderValues = new WeakMap<object, unknown>();

/** @internal Registers compiler-produced server markup without exposing the registry. */
export function registerServerRenderValue(value: unknown): object {
  const registered = Object.create(null) as object;
  Object.defineProperty(registered, Symbol.toPrimitive, {
    value: () =>
      (typeof value === "object" && value !== null) || typeof value === "function"
        ? String(value)
        : value,
  });
  serverRenderValues.set(registered, value);
  return registered;
}

/** @internal Reads the payload for an exact compiler-produced server render value. */
export function readServerRenderValue(value: object): unknown {
  return serverRenderValues.get(value);
}

/** @internal Checks the exact identity registered by compiler-generated code. */
export function isServerRenderValue(value: unknown): boolean {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    serverRenderValues.has(value)
  );
}

/** @internal A self payload identifies a selection-aware compiler thunk without a public brand. */
export function registerServerRenderThunk<T extends (...args: never[]) => unknown>(render: T): T {
  serverRenderValues.set(render, render);
  return render;
}
