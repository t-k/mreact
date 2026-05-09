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

export function useState<T>(
  initial: T | (() => T),
): [T, (value: T | ((previous: T) => T)) => void] {
  const runtime = requireRuntime();
  const instance = requireInstance();
  const index = instance.hookIndex;
  instance.hookIndex += 1;

  let slot = instance.hooks[index];

  if (slot === undefined) {
    slot = {
      kind: "state",
      value: typeof initial === "function" ? (initial as () => T)() : initial,
    };
    instance.hooks[index] = slot;
  }

  if (slot.kind !== "state") {
    throw new Error("Hook order changed between renders.");
  }

  const setState = (value: T | ((previous: T) => T)): void => {
    const nextValue =
      typeof value === "function"
        ? (value as (previous: T) => T)(slot.value as T)
        : value;

    if (Object.is(slot.value, nextValue)) {
      return;
    }

    slot.value = nextValue;
    runtime.rerender();
  };

  return [slot.value as T, setState];
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

function requireRuntime(): RootRuntime {
  if (currentRuntime === undefined) {
    throw new Error("Hooks can only be called while rendering.");
  }

  return currentRuntime;
}

function requireInstance(): ComponentInstance {
  if (currentInstance === undefined) {
    throw new Error("Hooks can only be called while rendering.");
  }

  return currentInstance;
}
