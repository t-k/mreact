export interface RootRuntime {
  currentElement?: unknown;
  instances: Map<string, ComponentInstance>;
  pendingInsertionEffects: PendingEffect[];
  pendingLayoutEffects: PendingEffect[];
  pendingEffects: PendingEffect[];
  portalContainers: Set<Element>;
  rerender(): void;
  beginRender(): void;
  endRender(): void;
  flushEffects(): void;
  dispose(): void;
}

interface ComponentInstance {
  hooks: HookSlot[];
  hookIndex: number;
}

type EffectCallback = () => void | (() => void);

interface PendingEffect {
  slot: Extract<HookSlot, { kind: "effect" }>;
}

type HookSlot =
  | { kind: "state"; value: unknown }
  | { kind: "ref"; value: { current: unknown } }
  | { kind: "memo"; value: unknown; deps?: readonly unknown[] }
  | {
      kind: "effect";
      effectKind: "insertion" | "layout" | "normal";
      callback: EffectCallback;
      deps?: readonly unknown[];
      cleanup?: () => void;
    };

let currentRuntime: RootRuntime | undefined;
let currentInstance: ComponentInstance | undefined;
let syncVersion = 0;
let transitionVersion = 0;
let transitionDepth = 0;

export function createRootRuntime(rerender: () => void): RootRuntime {
  return {
    instances: new Map(),
    pendingInsertionEffects: [],
    pendingLayoutEffects: [],
    pendingEffects: [],
    portalContainers: new Set(),
    rerender,
    beginRender() {},
    endRender() {
      currentRuntime = undefined;
      currentInstance = undefined;
    },
    flushEffects() {
      flushPendingEffects(this.pendingInsertionEffects);
      flushPendingEffects(this.pendingLayoutEffects);
      flushPendingEffects(this.pendingEffects);
    },
    dispose() {
      for (const instance of this.instances.values()) {
        for (const slot of instance.hooks) {
          if (slot?.kind === "effect") {
            slot.cleanup?.();
            delete slot.cleanup;
          }
        }
      }

      this.pendingLayoutEffects = [];
      this.pendingInsertionEffects = [];
      this.pendingEffects = [];
      for (const container of this.portalContainers) {
        container.replaceChildren();
      }
      this.portalContainers.clear();
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
    if (transitionDepth === 0) {
      syncVersion += 1;
    }
    runtime.rerender();
  };

  return [slot.value as T, setState];
}

export function useRef<T>(initial: T): { current: T } {
  const instance = requireInstance();
  const index = instance.hookIndex;
  instance.hookIndex += 1;

  let slot = instance.hooks[index];

  if (slot === undefined) {
    slot = { kind: "ref", value: { current: initial } };
    instance.hooks[index] = slot;
  }

  if (slot.kind !== "ref") {
    throw new Error("Hook order changed between renders.");
  }

  return slot.value as { current: T };
}

export function useMemo<T>(factory: () => T, deps?: readonly unknown[]): T {
  const instance = requireInstance();
  const index = instance.hookIndex;
  instance.hookIndex += 1;

  let slot = instance.hooks[index];

  if (slot !== undefined && slot.kind !== "memo") {
    throw new Error("Hook order changed between renders.");
  }

  if (
    slot === undefined ||
    deps === undefined ||
    slot.deps === undefined ||
    !areHookInputsEqual(deps, slot.deps)
  ) {
    const value = factory();
    slot =
      deps === undefined
        ? { kind: "memo", value }
        : { kind: "memo", value, deps };
    instance.hooks[index] = slot;
  }

  return slot.value as T;
}

export function useCallback<T extends (...args: never[]) => unknown>(
  callback: T,
  deps?: readonly unknown[],
): T {
  return useMemo(() => callback, deps);
}

export function useEffect(
  callback: EffectCallback,
  deps?: readonly unknown[],
): void {
  useEffectImpl("normal", callback, deps);
}

export function useInsertionEffect(
  callback: EffectCallback,
  deps?: readonly unknown[],
): void {
  useEffectImpl("insertion", callback, deps);
}

export function useLayoutEffect(
  callback: EffectCallback,
  deps?: readonly unknown[],
): void {
  useEffectImpl("layout", callback, deps);
}

export function useSyncExternalStore<T>(
  subscribe: (listener: () => void) => () => void,
  getSnapshot: () => T,
  getServerSnapshot: () => T = getSnapshot,
): T {
  const [snapshot, setSnapshot] = useState(() => getServerSnapshot());
  const currentSnapshot = getSnapshot();

  useEffect(() => {
    const checkForUpdates = (): void => {
      setSnapshot(getSnapshot());
    };

    checkForUpdates();
    return subscribe(checkForUpdates);
  }, [subscribe, getSnapshot]);

  return Object.is(snapshot, currentSnapshot) ? snapshot : currentSnapshot;
}

export function renderToString<TProps>(
  component: (props: TProps) => string,
  props?: TProps,
): string {
  const runtime = createRootRuntime(() => undefined);

  try {
    return renderWithRootRuntime(runtime, "0", () => component(props as TProps));
  } finally {
    runtime.dispose();
  }
}

export type TransitionScope = () => void;
export type StartTransition = (scope: TransitionScope) => void;

export function startTransition(scope: TransitionScope): void {
  const version = syncVersion;
  const scheduledTransitionVersion = ++transitionVersion;
  queueMicrotask(() => {
    if (
      version !== syncVersion ||
      scheduledTransitionVersion !== transitionVersion
    ) {
      return;
    }

    runTransitionScope(scope);
  });
}

export function useTransition(): [boolean, StartTransition] {
  const [pending, setPending] = useState(false);

  return [
    pending,
    (scope) => {
      setPending(true);
      const version = syncVersion;
      const scheduledTransitionVersion = ++transitionVersion;
      queueMicrotask(() => {
        try {
          if (
            version === syncVersion &&
            scheduledTransitionVersion === transitionVersion
          ) {
            runTransitionScope(scope);
          }
        } finally {
          setPending(false);
        }
      });
    },
  ];
}

function runTransitionScope(scope: TransitionScope): void {
  transitionDepth += 1;

  try {
    scope();
  } finally {
    transitionDepth -= 1;
  }
}

function useEffectImpl(
  effectKind: "insertion" | "layout" | "normal",
  callback: EffectCallback,
  deps?: readonly unknown[],
): void {
  const runtime = requireRuntime();
  const instance = requireInstance();
  const index = instance.hookIndex;
  instance.hookIndex += 1;

  let slot = instance.hooks[index];

  if (slot !== undefined && slot.kind !== "effect") {
    throw new Error("Hook order changed between renders.");
  }

  const shouldRun =
    slot === undefined ||
    deps === undefined ||
    slot.deps === undefined ||
    !areHookInputsEqual(deps, slot.deps);

  if (slot === undefined) {
    slot =
      deps === undefined
        ? { kind: "effect", effectKind, callback }
        : { kind: "effect", effectKind, callback, deps };
    instance.hooks[index] = slot;
  } else {
    slot.effectKind = effectKind;
    slot.callback = callback;

    if (deps === undefined) {
      delete slot.deps;
    } else {
      slot.deps = deps;
    }
  }

  if (shouldRun) {
    const queue =
      effectKind === "insertion"
        ? runtime.pendingInsertionEffects
        : effectKind === "layout"
        ? runtime.pendingLayoutEffects
        : runtime.pendingEffects;
    queue.push({ slot });
  }
}

function flushPendingEffects(queue: PendingEffect[]): void {
  const pending = queue.splice(0);

  for (const { slot } of pending) {
    slot.cleanup?.();
    const cleanup = slot.callback();

    if (typeof cleanup === "function") {
      slot.cleanup = cleanup;
    } else {
      delete slot.cleanup;
    }
  }
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

function areHookInputsEqual(
  nextDeps: readonly unknown[],
  previousDeps: readonly unknown[],
): boolean {
  if (nextDeps.length !== previousDeps.length) {
    return false;
  }

  for (let index = 0; index < nextDeps.length; index += 1) {
    if (!Object.is(nextDeps[index], previousDeps[index])) {
      return false;
    }
  }

  return true;
}
