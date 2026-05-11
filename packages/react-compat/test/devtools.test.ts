// @vitest-environment happy-dom

import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createElement,
  createRoot,
  Profiler,
  render,
  useActionState,
  useCallback,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "../src/index.js";

const devToolsE2EScenarios = [
  "inject-renderer",
  "commit-root",
  "post-commit-root",
  "fiber-root-registry",
  "host-instance-lookup",
  "native-node-lookup",
  "display-name",
  "hook-linked-list",
  "hook-state-edit",
  "schedule-update",
  "profiling-session",
  "unmount-notification",
] as const;

interface TestDevToolsHook {
  inject: ReturnType<typeof vi.fn>;
  onCommitFiberRoot: ReturnType<typeof vi.fn>;
  onPostCommitFiberRoot?: ReturnType<typeof vi.fn>;
  onCommitFiberUnmount: ReturnType<typeof vi.fn>;
  getFiberRoots?: ReturnType<typeof vi.fn>;
}

interface TestDevToolsRenderer {
  supportsFiber: boolean;
  rendererPackageName: string;
  bundleType: 0 | 1;
  version: string;
  reconcilerVersion?: string;
  getLaneLabelMap?(): Map<number, string>;
  getCurrentFiber?(): unknown;
  findFiberByHostInstance(hostInstance: unknown): unknown;
  findHostInstanceByFiber?(fiber: unknown): unknown;
  findNativeNodesForFiber?(fiber: unknown): Set<unknown>;
  getFiberCurrentPropsFromNode?(hostInstance: unknown): unknown;
  getDisplayNameForFiber?(fiber: { elementType?: unknown; type?: unknown }): string | null;
  getInstanceByFiber?(fiber: unknown): unknown;
  overrideProps?(fiber: unknown, path: Array<string | number>, value: unknown): void;
  overridePropsDeletePath?(fiber: unknown, path: Array<string | number>): void;
  overridePropsRenamePath?(
    fiber: unknown,
    oldPath: Array<string | number>,
    newPath: Array<string | number>,
  ): void;
  overrideHookState?(fiber: unknown, id: string, path: Array<string | number>, value: unknown): void;
  scheduleUpdate?(fiber: unknown): void;
  startProfiling?(): void;
  stopProfiling?(): void;
  clearProfilingData?(): void;
  getProfilingData?(): { rendererID: number; commitData: unknown[] };
  scheduleRefresh?(root: unknown, update: unknown): void;
  scheduleRetry?(fiber: unknown): void;
  injectProfilingHooks?(hooks: unknown): void;
}

declare global {
  // eslint-disable-next-line no-var
  var __REACT_DEVTOOLS_GLOBAL_HOOK__: TestDevToolsHook | undefined;
}

describe("react-compat devtools hook", () => {
  afterEach(() => {
    delete globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  });

  test("injects a renderer and reports root commits", () => {
    const hook: TestDevToolsHook = {
      inject: vi.fn(() => 7),
      onCommitFiberRoot: vi.fn(),
      onCommitFiberUnmount: vi.fn(),
    };
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
    const container = document.createElement("div");

    render(createElement("p", null, "Hello"), container);

    expect(hook.inject).toHaveBeenCalledTimes(1);
    expect(hook.inject.mock.calls[0]?.[0]).toMatchObject({
      bundleType: 1,
      rendererPackageName: "@modular-react/react-compat",
      version: "0.0.0",
      reconcilerVersion: "0.0.0",
      supportsFiber: true,
    });
    expect(hook.onCommitFiberRoot).toHaveBeenCalledTimes(1);
    expect(hook.onCommitFiberRoot.mock.calls[0]?.[0]).toBe(7);
    expect(hook.onCommitFiberRoot.mock.calls[0]?.[1]).toMatchObject({
      containerInfo: container,
      current: {
        tag: 3,
        stateNode: expect.any(Object),
        child: {
          tag: 5,
          elementType: "p",
          type: "p",
        },
      },
    });
  });

  test("matches the React DevTools renderer private interface shape", () => {
    const hook: TestDevToolsHook = {
      inject: vi.fn(() => 13),
      onCommitFiberRoot: vi.fn(),
      onCommitFiberUnmount: vi.fn(),
    };
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
    const container = document.createElement("div");

    render(createElement("p", null, "Hello"), container);

    const renderer = hook.inject.mock.calls[0]?.[0] as TestDevToolsRenderer;
    expect(Object.keys(renderer).sort()).toEqual([
      "bundleType",
      "clearProfilingData",
      "findFiberByHostInstance",
      "findHostInstanceByFiber",
      "findNativeNodesForFiber",
      "getCurrentFiber",
      "getDisplayNameForFiber",
      "getFiberCurrentPropsFromNode",
      "getInstanceByFiber",
      "getLaneLabelMap",
      "getProfilingData",
      "injectProfilingHooks",
      "overrideHookState",
      "overrideHookStateDeletePath",
      "overrideHookStateRenamePath",
      "overrideProps",
      "overridePropsDeletePath",
      "overridePropsRenamePath",
      "reconcilerVersion",
      "rendererPackageName",
      "scheduleRefresh",
      "scheduleRetry",
      "scheduleUpdate",
      "setErrorHandler",
      "setSuspenseHandler",
      "shouldError",
      "shouldSuspend",
      "startProfiling",
      "stopProfiling",
      "supportsFiber",
      "version",
    ]);
    expect(renderer.getLaneLabelMap?.()).toEqual(
      new Map([
        [1, "Sync"],
        [2, "Continuous"],
        [4, "Default"],
        [8, "Transition"],
      ]),
    );
    expect(renderer.getCurrentFiber?.()).toBeNull();
  });

  test("keeps DevTools extension workflow coverage explicit", () => {
    expect([...devToolsE2EScenarios].sort()).toEqual([
      "commit-root",
      "display-name",
      "fiber-root-registry",
      "hook-linked-list",
      "hook-state-edit",
      "host-instance-lookup",
      "inject-renderer",
      "native-node-lookup",
      "post-commit-root",
      "profiling-session",
      "schedule-update",
      "unmount-notification",
    ]);
  });

  test("exposes React Fiber shaped host nodes and host instance lookup", () => {
    const hook: TestDevToolsHook = {
      inject: vi.fn(() => 9),
      onCommitFiberRoot: vi.fn(),
      onCommitFiberUnmount: vi.fn(),
    };
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
    const container = document.createElement("div");

    function App() {
      return createElement("button", { id: "save" }, "Save");
    }

    render(createElement(App, null), container);

    const renderer = hook.inject.mock.calls[0]?.[0] as TestDevToolsRenderer;
    const root = hook.onCommitFiberRoot.mock.calls[0]?.[1] as {
      current: {
        tag: number;
        child?: {
          tag: number;
          elementType: unknown;
          type: unknown;
          return?: unknown;
          child?: {
            tag: number;
            elementType: unknown;
            type: unknown;
            return?: unknown;
            child?: {
              tag: number;
              memoizedProps: string;
              stateNode: Text;
              return?: unknown;
            };
          };
        };
      };
    };
    const button = container.querySelector("button");

    expect(root.current.tag).toBe(3);
    expect(root.current.child?.tag).toBe(0);
    expect(root.current.child?.elementType).toBe(App);
    expect(root.current.child?.type).toBe(App);
    expect(root.current.child?.return).toBe(root.current);
    expect(root.current.child?.child?.tag).toBe(5);
    expect(root.current.child?.child?.elementType).toBe("button");
    expect(root.current.child?.child?.return).toBe(root.current.child);
    expect(root.current.child?.child?.child?.tag).toBe(6);
    expect(root.current.child?.child?.child?.memoizedProps).toBe("Save");
    expect(root.current.child?.child?.child?.return).toBe(root.current.child?.child);
    expect(renderer.findFiberByHostInstance(button)).toBe(root.current.child?.child);
    expect(renderer.findHostInstanceByFiber?.(root.current.child)).toBe(button);
    expect(renderer.findHostInstanceByFiber?.(root.current.child?.child)).toBe(button);
    expect(renderer.findNativeNodesForFiber?.(root.current.child)).toEqual(
      new Set([button, root.current.child?.child?.child?.stateNode]),
    );
    expect(renderer.findFiberByHostInstance(root.current.child?.child?.child?.stateNode)).toBe(
      root.current.child?.child?.child,
    );
    expect(renderer.getFiberCurrentPropsFromNode?.(button)).toMatchObject({
      id: "save",
    });
    expect(renderer.getInstanceByFiber?.(root.current.child?.child)).toBe(button);
    expect(renderer.getDisplayNameForFiber?.(root.current.child)).toBe("App");
  });

  test("reports root unmounts", () => {
    const hook: TestDevToolsHook = {
      inject: vi.fn(() => 8),
      onCommitFiberRoot: vi.fn(),
      onPostCommitFiberRoot: vi.fn(),
      onCommitFiberUnmount: vi.fn(),
    };
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
    const container = document.createElement("div");
    const root = createRoot(container);
    function App() {
      return createElement("span", null, "Mounted");
    }

    root.render(createElement(App, null));
    root.unmount();

    expect(hook.onCommitFiberUnmount).toHaveBeenCalled();
    expect(hook.onCommitFiberUnmount.mock.calls[0]?.[0]).toBe(8);
    expect(hook.onCommitFiberUnmount.mock.calls[0]?.[1]).toMatchObject({
      tag: 0,
      elementType: expect.any(Function),
    });
    expect(hook.onCommitFiberRoot).toHaveBeenLastCalledWith(
      8,
      expect.objectContaining({
        current: expect.objectContaining({
          tag: 3,
          memoizedState: null,
        }),
      }),
      undefined,
      false,
    );
    expect(hook.onPostCommitFiberRoot).toHaveBeenLastCalledWith(
      8,
      expect.objectContaining({
        current: expect.objectContaining({
          tag: 3,
          memoizedState: null,
        }),
      }),
    );
  });

  test("keeps React DevTools hook fiber root registry in sync", () => {
    const roots = new Map<number, Set<unknown>>();
    const hook: TestDevToolsHook = {
      inject: vi.fn(() => 14),
      onCommitFiberRoot: vi.fn((rendererID: number, root: { current: { memoizedState: unknown } }) => {
        const set = roots.get(rendererID) ?? new Set<unknown>();
        roots.set(rendererID, set);

        if (root.current.memoizedState === null) {
          set.delete(root);
        } else {
          set.add(root);
        }
      }),
      onCommitFiberUnmount: vi.fn(),
      getFiberRoots: vi.fn((rendererID: number) => roots.get(rendererID) ?? new Set()),
    };
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
    const container = document.createElement("div");
    const root = createRoot(container);

    root.render(createElement("p", null, "Mounted"));
    const committedRoot = hook.onCommitFiberRoot.mock.calls[0]?.[1];
    expect(hook.getFiberRoots(14)).toContain(committedRoot);

    root.unmount();

    expect(hook.getFiberRoots(14)).not.toContain(committedRoot);
  });

  test("clears host instance lookup and fiber roots after unmount", () => {
    const hook: TestDevToolsHook = {
      inject: vi.fn(() => 10),
      onCommitFiberRoot: vi.fn(),
      onCommitFiberUnmount: vi.fn(),
    };
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
    const container = document.createElement("div");
    const root = createRoot(container);
    function App() {
      return createElement("button", null, "Save");
    }

    root.render(createElement(App, null));
    const renderer = hook.inject.mock.calls[0]?.[0] as TestDevToolsRenderer;
    const button = container.querySelector("button");
    expect(renderer.findFiberByHostInstance(button)).not.toBeNull();

    root.unmount();

    expect(renderer.findFiberByHostInstance(button)).toBeNull();
  });

  test("supports DevTools component editor prop and hook state overrides", () => {
    const hook: TestDevToolsHook = {
      inject: vi.fn(() => 11),
      onCommitFiberRoot: vi.fn(),
      onCommitFiberUnmount: vi.fn(),
    };
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
    const container = document.createElement("div");

    function App() {
      return createElement("button", { id: "save", title: "Save" }, "Save");
    }

    render(createElement(App, null), container);

    const renderer = hook.inject.mock.calls[0]?.[0] as TestDevToolsRenderer;
    const root = hook.onCommitFiberRoot.mock.calls[0]?.[1] as {
      current: {
        child?: {
          memoizedState: unknown;
          child?: {
            memoizedProps: { id: string; title?: string; "aria-label"?: string };
            pendingProps: { id: string; title?: string; "aria-label"?: string };
          };
        };
      };
    };
    const appFiber = root.current.child;
    const buttonFiber = appFiber?.child;

    if (appFiber === undefined || buttonFiber === undefined) {
      throw new Error("Expected DevTools fibers.");
    }

    appFiber.memoizedState = { hooks: [{ value: 1 }] };

    renderer.overrideProps?.(buttonFiber, ["title"], "Stored");
    renderer.overridePropsRenamePath?.(buttonFiber, ["title"], ["aria-label"]);
    renderer.overridePropsDeletePath?.(buttonFiber, ["id"]);
    renderer.overrideHookState?.(appFiber, "0", ["value"], 2);
    renderer.scheduleUpdate?.(buttonFiber);

    expect(buttonFiber.memoizedProps).toEqual({
      "aria-label": "Stored",
      children: "Save",
    });
    expect(buttonFiber.pendingProps).toEqual({
      "aria-label": "Stored",
      children: "Save",
    });
    expect(appFiber.memoizedState).toEqual({ hooks: [{ value: 2 }] });
    expect(hook.onCommitFiberRoot).toHaveBeenCalledTimes(2);
  });

  test("records DevTools profiling commit data", () => {
    const hook: TestDevToolsHook = {
      inject: vi.fn(() => 12),
      onCommitFiberRoot: vi.fn(),
      onCommitFiberUnmount: vi.fn(),
    };
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
    const container = document.createElement("div");

    render(createElement("p", null, "one"), container);
    const renderer = hook.inject.mock.calls[0]?.[0] as TestDevToolsRenderer;

    renderer.clearProfilingData?.();
    renderer.startProfiling?.();
    render(createElement("p", null, "two"), container);
    renderer.stopProfiling?.();

    const data = renderer.getProfilingData?.();
    expect(data?.rendererID).toBe(12);
    expect(data?.commitData).toHaveLength(1);
    expect(data?.commitData[0]).toMatchObject({
      duration: expect.any(Number),
      fiberActualDurations: expect.any(Array),
    });
  });

  test("exposes Profiler fibers and debug hook values to DevTools", () => {
    const hook: TestDevToolsHook = {
      inject: vi.fn(() => 15),
      onCommitFiberRoot: vi.fn(),
      onCommitFiberUnmount: vi.fn(),
    };
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
    const container = document.createElement("div");

    function App() {
      useDebugValue("ready", (value) => `status:${value}`);
      return createElement("span", null, "Profiled");
    }

    render(
      createElement(
        Profiler,
        { id: "profile", onRender: () => undefined },
        createElement(App, null),
      ),
      container,
    );

    const renderer = hook.inject.mock.calls[0]?.[0] as TestDevToolsRenderer;
    const root = hook.onCommitFiberRoot.mock.calls[0]?.[1] as {
      current: {
        child?: {
          tag: number;
          elementType: unknown;
          child?: {
            _debugHookTypes: string[] | null;
            memoizedState: unknown;
          };
        };
      };
    };

    expect(root.current.child?.tag).toBe(12);
    expect(renderer.getDisplayNameForFiber?.(root.current.child)).toBe("Profiler");
    expect(root.current.child?.child?._debugHookTypes).toEqual(["useDebugValue"]);
    expect(root.current.child?.child?.memoizedState).toBeNull();
  });

  test("preserves alternate snapshots across DevTools Fiber commits", () => {
    const hook: TestDevToolsHook = {
      inject: vi.fn(() => 16),
      onCommitFiberRoot: vi.fn(),
      onCommitFiberUnmount: vi.fn(),
    };
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
    const container = document.createElement("div");
    const root = createRoot(container);

    function App({ label }: { label: string }) {
      return createElement("button", { title: label }, label);
    }

    root.render(createElement(App, { label: "one" }));
    const firstRoot = hook.onCommitFiberRoot.mock.calls[0]?.[1] as {
      current: { child?: { child?: { memoizedProps: { title: string } } } };
    };
    const firstCurrent = firstRoot.current;
    const firstApp = firstRoot.current.child;
    const firstButton = firstApp?.child;

    root.render(createElement(App, { label: "two" }));
    const secondRoot = hook.onCommitFiberRoot.mock.calls[1]?.[1] as {
      current: {
        alternate: unknown;
        child?: {
          alternate: unknown;
          memoizedProps: { label: string };
          child?: {
            alternate: unknown;
            memoizedProps: { title: string };
          };
        };
      };
    };
    const secondApp = secondRoot.current.child;
    const secondButton = secondApp?.child;

    expect(secondRoot.current.alternate).toBe(firstCurrent);
    expect(secondApp?.alternate).toBe(firstApp);
    expect(secondButton?.alternate).toBe(firstButton);
    expect(secondApp?.memoizedProps).toEqual({ label: "two" });
    expect(secondButton?.memoizedProps).toMatchObject({ title: "two" });
    expect(firstButton?.memoizedProps).toMatchObject({ title: "one" });
  });

  test("exposes React DevTools hook linked list and hook type metadata", () => {
    const hook: TestDevToolsHook = {
      inject: vi.fn(() => 17),
      onCommitFiberRoot: vi.fn(),
      onCommitFiberUnmount: vi.fn(),
    };
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
    const container = document.createElement("div");

    function App() {
      const [count] = useState(1);
      const [reduced] = useReducer((state: number, action: number) => state + action, 2);
      const ref = useRef("ref");
      const memo = useMemo(() => ({ count, reduced }), [count, reduced]);
      const callback = useCallback(() => count, [count]);
      useDebugValue("ready", (value) => `status:${value}`);
      return createElement(
        "button",
        { title: `${memo.count}:${memo.reduced}:${ref.current}:${callback()}` },
        "Hooks",
      );
    }

    render(createElement(App, null), container);

    const root = hook.onCommitFiberRoot.mock.calls[0]?.[1] as {
      current: {
        child?: {
          _debugHookTypes: string[] | null;
          memoizedState: {
            memoizedState: unknown;
            baseState: unknown;
            baseQueue: unknown;
            queue: unknown;
            next: unknown;
          } | null;
        };
      };
    };
    const appFiber = root.current.child;
    const firstHook = appFiber?.memoizedState;
    const secondHook = firstHook?.next as typeof firstHook;
    const thirdHook = secondHook?.next as typeof firstHook;
    const fourthHook = thirdHook?.next as typeof firstHook;
    const fifthHook = fourthHook?.next as typeof firstHook;

    expect(appFiber?._debugHookTypes).toEqual([
      "useState",
      "useReducer",
      "useRef",
      "useMemo",
      "useCallback",
      "useDebugValue",
    ]);
    expect(firstHook).toMatchObject({
      memoizedState: 1,
      baseState: 1,
      baseQueue: null,
      queue: expect.objectContaining({
        pending: null,
        lastRenderedState: 1,
      }),
    });
    expect(secondHook).toMatchObject({
      memoizedState: 2,
      baseState: 2,
      baseQueue: null,
      queue: expect.objectContaining({
        pending: null,
        lastRenderedState: 2,
      }),
    });
    expect(thirdHook).toMatchObject({
      memoizedState: { current: "ref" },
      baseState: null,
      baseQueue: null,
      queue: null,
    });
    expect(fourthHook).toMatchObject({
      memoizedState: [{ count: 1, reduced: 2 }, [1, 2]],
      baseState: null,
      baseQueue: null,
      queue: null,
    });
    expect(fifthHook).toMatchObject({
      memoizedState: [expect.any(Function), [1]],
      baseState: null,
      baseQueue: null,
      queue: null,
      next: null,
    });
  });

  test("allows DevTools to edit linked hook state snapshots", () => {
    const hook: TestDevToolsHook = {
      inject: vi.fn(() => 18),
      onCommitFiberRoot: vi.fn(),
      onCommitFiberUnmount: vi.fn(),
    };
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
    const container = document.createElement("div");

    function App() {
      const [count] = useState(1);
      const ref = useRef({ label: "before" });
      return createElement("button", { title: `${count}:${ref.current.label}` }, "Edit");
    }

    render(createElement(App, null), container);

    const renderer = hook.inject.mock.calls[0]?.[0] as TestDevToolsRenderer;
    const root = hook.onCommitFiberRoot.mock.calls[0]?.[1] as {
      current: {
        child?: {
          memoizedState: {
            memoizedState: unknown;
            baseState: unknown;
            queue: { lastRenderedState: unknown } | null;
            next: {
              memoizedState: { current: { label: string } };
            } | null;
          } | null;
        };
      };
    };
    const appFiber = root.current.child;
    const stateHook = appFiber?.memoizedState;
    const refHook = stateHook?.next;

    if (appFiber === undefined || stateHook === undefined || stateHook === null) {
      throw new Error("Expected App fiber with hooks.");
    }

    renderer.overrideHookState?.(appFiber, "0", [], 4);
    renderer.overrideHookState?.(appFiber, "1", ["current", "label"], "after");

    expect(stateHook.memoizedState).toBe(4);
    expect(stateHook.baseState).toBe(4);
    expect(stateHook.queue?.lastRenderedState).toBe(4);
    expect(refHook?.memoizedState.current.label).toBe("after");
  });

  test("records public React 19 hook names instead of implementation hooks", () => {
    const hook: TestDevToolsHook = {
      inject: vi.fn(() => 19),
      onCommitFiberRoot: vi.fn(),
      onCommitFiberUnmount: vi.fn(),
    };
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
    const container = document.createElement("div");

    function App() {
      const id = useId();
      const imperativeRef = useRef<{ id: string } | null>(null);
      useImperativeHandle(imperativeRef, () => ({ id }), [id]);
      const [pending] = useTransition();
      const deferred = useDeferredValue("value");
      const snapshot = useSyncExternalStore(
        () => () => undefined,
        () => "snapshot",
      );
      const [actionState] = useActionState(
        (state: number, payload: number) => state + payload,
        1,
      );
      const [optimistic] = useOptimistic("base");
      const event = useEffectEvent(() => optimistic);
      useInsertionEffect(() => undefined, []);
      useEffect(() => undefined, []);
      useLayoutEffect(() => undefined, []);
      return createElement(
        "span",
        null,
        `${id}:${imperativeRef.current?.id}:${pending}:${deferred}:${snapshot}:${actionState}:${event()}`,
      );
    }

    render(createElement(App, null), container);

    const root = hook.onCommitFiberRoot.mock.calls[0]?.[1] as {
      current: {
        child?: {
          _debugHookTypes: string[] | null;
        };
      };
    };

    expect(root.current.child?._debugHookTypes).toEqual([
      "useId",
      "useRef",
      "useImperativeHandle",
      "useTransition",
      "useDeferredValue",
      "useSyncExternalStore",
      "useActionState",
      "useOptimistic",
      "useEffectEvent",
      "useInsertionEffect",
      "useEffect",
      "useLayoutEffect",
    ]);
  });

  test("runs an extension-like DevTools inspect edit profile and unmount workflow", () => {
    const roots = new Map<number, Set<unknown>>();
    const hook: TestDevToolsHook = {
      inject: vi.fn(() => 20),
      onCommitFiberRoot: vi.fn((rendererID: number, root: { current: { memoizedState: unknown } }) => {
        const set = roots.get(rendererID) ?? new Set<unknown>();
        roots.set(rendererID, set);

        if (root.current.memoizedState === null) {
          set.delete(root);
        } else {
          set.add(root);
        }
      }),
      onPostCommitFiberRoot: vi.fn(),
      onCommitFiberUnmount: vi.fn(),
      getFiberRoots: vi.fn((rendererID: number) => roots.get(rendererID) ?? new Set()),
    };
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
    const container = document.createElement("div");
    const root = createRoot(container);

    function Counter() {
      const [count] = useState(1);
      useDebugValue(`count:${count}`);
      return createElement("button", { title: String(count) }, "Count");
    }

    root.render(
      createElement(
        Profiler,
        { id: "counter", onRender: () => undefined },
        createElement(Counter, null),
      ),
    );

    const renderer = hook.inject.mock.calls[0]?.[0] as TestDevToolsRenderer;
    const committedRoot = hook.onCommitFiberRoot.mock.calls[0]?.[1] as {
      current: {
        child?: {
          tag: number;
          child?: {
            _debugHookTypes: string[] | null;
            memoizedState: {
              memoizedState: unknown;
              baseState: unknown;
              queue: { lastRenderedState: unknown } | null;
              next: unknown;
            } | null;
            child?: {
              stateNode: HTMLButtonElement;
            };
          };
        };
      };
    };
    const profilerFiber = committedRoot.current.child;
    const counterFiber = profilerFiber?.child;
    const buttonFiber = counterFiber?.child;
    const button = container.querySelector("button");

    if (counterFiber === undefined || buttonFiber === undefined || button === null) {
      throw new Error("Expected DevTools workflow fibers.");
    }

    expect(hook.getFiberRoots?.(20)).toContain(committedRoot);
    expect(hook.onPostCommitFiberRoot).toHaveBeenCalledWith(20, committedRoot);
    expect(profilerFiber?.tag).toBe(12);
    expect(counterFiber._debugHookTypes).toEqual(["useState", "useDebugValue"]);
    expect(renderer.findFiberByHostInstance(button)).toBe(buttonFiber);
    expect(renderer.findHostInstanceByFiber?.(counterFiber)).toBe(button);
    expect(renderer.findNativeNodesForFiber?.(counterFiber)).toContain(button);
    expect(renderer.getDisplayNameForFiber?.(counterFiber)).toBe("Counter");

    renderer.clearProfilingData?.();
    renderer.startProfiling?.();
    renderer.overrideHookState?.(counterFiber, "0", [], 2);
    renderer.scheduleUpdate?.(counterFiber);
    root.render(
      createElement(
        Profiler,
        { id: "counter", onRender: () => undefined },
        createElement(Counter, null),
      ),
    );
    renderer.stopProfiling?.();

    expect(counterFiber.memoizedState).toMatchObject({
      memoizedState: 2,
      baseState: 2,
      queue: expect.objectContaining({ lastRenderedState: 2 }),
    });
    expect(renderer.getProfilingData?.().commitData.length).toBeGreaterThan(0);
    expect(hook.onCommitFiberRoot).toHaveBeenCalledTimes(3);

    root.unmount();

    expect(hook.onCommitFiberUnmount).toHaveBeenCalledWith(
      20,
      expect.objectContaining({ elementType: Counter }),
    );
    expect(renderer.findFiberByHostInstance(button)).toBeNull();
    expect(hook.getFiberRoots?.(20).size).toBe(0);
  });
});
