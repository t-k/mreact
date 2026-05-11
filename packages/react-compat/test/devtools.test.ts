// @vitest-environment happy-dom

import { afterEach, describe, expect, test, vi } from "vitest";
import { createElement, createRoot, render } from "../src/index.js";

interface TestDevToolsHook {
  inject: ReturnType<typeof vi.fn>;
  onCommitFiberRoot: ReturnType<typeof vi.fn>;
  onCommitFiberUnmount: ReturnType<typeof vi.fn>;
}

interface TestDevToolsRenderer {
  supportsFiber: boolean;
  rendererPackageName: string;
  findFiberByHostInstance(hostInstance: unknown): unknown;
  getFiberRoots?(): Set<unknown>;
  getDisplayNameForFiber?(fiber: { elementType?: unknown; type?: unknown }): string | null;
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
      rendererPackageName: "@modular-react/react-compat",
      version: "0.0.0",
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
    expect(renderer.findFiberByHostInstance(root.current.child?.child?.child?.stateNode)).toBe(
      root.current.child?.child?.child,
    );
    expect(renderer.getFiberRoots?.()).toContain(root);
    expect(renderer.getDisplayNameForFiber?.(root.current.child)).toBe("App");
  });

  test("reports root unmounts", () => {
    const hook: TestDevToolsHook = {
      inject: vi.fn(() => 8),
      onCommitFiberRoot: vi.fn(),
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
    expect(renderer.getFiberRoots?.().size).toBe(0);
  });
});
