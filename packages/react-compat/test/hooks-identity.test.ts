// @vitest-environment happy-dom

import { describe, expect, test, vi } from "vitest";
import {
  createElement,
  createRoot,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "../src/index.js";
import { createRootRuntime, type RootRuntime } from "../src/hooks.js";

type RuntimeInstance = RootRuntime["instances"] extends Map<string, infer Instance>
  ? Instance
  : never;

describe("react-compat identity hooks", () => {
  test("skips inactive instance cleanup scans when every instance is active", () => {
    class CountingMap<K, V> extends Map<K, V> {
      iterations = 0;

      override [Symbol.iterator](): MapIterator<[K, V]> {
        this.iterations += 1;
        return super[Symbol.iterator]();
      }
    }

    const runtime = createRootRuntime(() => undefined);
    const instances = new CountingMap<string, RuntimeInstance>();
    const instance = {
      owner: undefined,
      path: "0",
      hooks: [],
      hookIndex: 0,
      dirty: false,
      devToolsHookSuppressionDepth: 0,
    } as RuntimeInstance;

    instances.set("0", instance);
    runtime.instances = instances as RootRuntime["instances"];
    runtime.activeInstanceKeys = new Set(["0"]);

    runtime.endRender(true);

    expect(instances.iterations).toBe(0);
  });

  test("shares render state across duplicated hook module evaluations", async () => {
    const rendererHooks = await import("../src/hooks.ts?renderer") as {
      createRootRuntime: (rerender: () => void) => unknown;
      getDevToolsHookState: (runtime: unknown, path: string) => unknown;
      renderWithRootRuntime: <T>(
        runtime: unknown,
        path: string,
        render: () => T,
      ) => T;
    };
    const componentHooks = await import("../src/hooks.ts?component") as {
      useRef: <T>(initialValue: T) => { current: T };
      useState: <T>(initialValue: T) => [T, (value: T) => void];
    };
    const runtime = rendererHooks.createRootRuntime(() => undefined);

    const ref = rendererHooks.renderWithRootRuntime(runtime, "0", () =>
      componentHooks.useRef("shared"),
    );

    expect(ref.current).toBe("shared");

    rendererHooks.renderWithRootRuntime(runtime, "1", () =>
      componentHooks.useState("state"),
    );

    expect(rendererHooks.getDevToolsHookState(runtime, "1")).toBeUndefined();
  });

  test("useRef preserves object identity and does not trigger render", () => {
    const container = document.createElement("div");
    const refs: Array<{ current: number }> = [];

    function App() {
      const [count, setCount] = useState(0);
      const ref = useRef(0);
      refs.push(ref);
      return createElement(
        "button",
        { onClick: () => setCount(count + 1) },
        count,
      );
    }

    createRoot(container).render(createElement(App, null));
    container.querySelector("button")?.click();

    expect(refs).toHaveLength(2);
    expect(refs[0]).toBe(refs[1]);
  });

  test("useMemo reuses value while deps are stable", () => {
    const container = document.createElement("div");
    const factory = vi.fn((value: number) => ({ value }));

    function App() {
      const [count, setCount] = useState(0);
      const [other, setOther] = useState(0);
      const memo = useMemo(() => factory(count), [count]);
      return createElement(
        "div",
        null,
        createElement(
          "button",
          { id: "count", onClick: () => setCount(count + 1) },
          memo.value,
        ),
        createElement(
          "button",
          { id: "other", onClick: () => setOther(other + 1) },
          other,
        ),
      );
    }

    createRoot(container).render(createElement(App, null));
    container.querySelector<HTMLButtonElement>("#other")?.click();
    container.querySelector<HTMLButtonElement>("#count")?.click();

    expect(factory).toHaveBeenCalledTimes(2);
    expect(container.querySelector("#count")?.textContent).toBe("1");
  });

  test("useCallback preserves function identity while deps are stable", () => {
    const container = document.createElement("div");
    const callbacks: Array<() => void> = [];

    function App() {
      const [count, setCount] = useState(0);
      const [other, setOther] = useState(0);
      callbacks.push(useCallback(() => setCount(count + 1), [count]));
      return createElement(
        "button",
        { onClick: () => setOther(other + 1) },
        other,
      );
    }

    createRoot(container).render(createElement(App, null));
    container.querySelector("button")?.click();

    expect(callbacks).toHaveLength(2);
    expect(callbacks[0]).toBe(callbacks[1]);
  });
});
