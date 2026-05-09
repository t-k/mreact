export interface RootRuntime {
  currentElement?: unknown;
  instances: Map<string, ComponentInstance>;
  rerender(): void;
  beginRender(): void;
  endRender(): void;
}

interface ComponentInstance {
  hooks: HookSlot[];
  hookIndex: number;
}

type HookSlot =
  | { kind: "state"; value: unknown }
  | { kind: "ref"; value: { current: unknown } }
  | { kind: "memo"; value: unknown; deps?: readonly unknown[] };

let currentRuntime: RootRuntime | undefined;
let currentInstance: ComponentInstance | undefined;

export function createRootRuntime(rerender: () => void): RootRuntime {
  return {
    instances: new Map(),
    rerender,
    beginRender() {},
    endRender() {
      currentRuntime = undefined;
      currentInstance = undefined;
    },
  };
}

export function renderWithRootRuntime<T>(
  runtime: RootRuntime,
  path: string,
  render: () => T,
): T {
  const previousRuntime = currentRuntime;
  const previousInstance = currentInstance;
  const instance = runtime.instances.get(path) ?? { hooks: [], hookIndex: 0 };
  runtime.instances.set(path, instance);
  instance.hookIndex = 0;
  currentRuntime = runtime;
  currentInstance = instance;

  try {
    return render();
  } finally {
    currentRuntime = previousRuntime;
    currentInstance = previousInstance;
  }
}

export function useState(): never {
  throw new Error("useState is not implemented yet.");
}

export function useRef(): never {
  throw new Error("useRef is not implemented yet.");
}

export function useMemo(): never {
  throw new Error("useMemo is not implemented yet.");
}

export function useCallback(): never {
  throw new Error("useCallback is not implemented yet.");
}
