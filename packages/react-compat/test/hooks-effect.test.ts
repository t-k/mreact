// @vitest-environment happy-dom

import { describe, expect, test, vi } from "vitest";
import {
  StrictMode,
  createElement,
  memo,
  createRoot,
  render,
  unmountComponentAtNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "../src/index.js";

describe("react-compat effect hooks", () => {
  test.each([
    ["layout", useLayoutEffect],
    ["passive", useEffect],
  ] as const)("runs nested %s effect setup in child-first tree order", (_kind, useHook) => {
    const container = document.createElement("div");
    const order: string[] = [];

    function Grandchild() {
      useHook(() => {
        order.push("grandchild");
      }, []);
      return createElement("span", null, "grandchild");
    }

    function Child(props: { label: string; nested?: boolean }) {
      useHook(() => {
        order.push(props.label);
      }, []);
      return props.nested
        ? createElement(Grandchild, null)
        : createElement("span", null, props.label);
    }

    function Parent() {
      useHook(() => {
        order.push("parent");
      }, []);
      return createElement(
        "section",
        null,
        createElement(Child, { label: "child", nested: true }),
        createElement(Child, { label: "sibling" }),
      );
    }

    createRoot(container).render(createElement(Parent, null));

    expect(order).toEqual(["grandchild", "child", "sibling", "parent"]);
  });

  test("preserves keyed sibling order when one key prefixes another with a dot", () => {
    const container = document.createElement("div");
    const order: string[] = [];

    function Item(props: { label: string }) {
      useEffect(() => {
        order.push(props.label);
      }, []);
      return null;
    }

    createRoot(container).render(
      createElement(
        "section",
        null,
        createElement(Item, { key: "item", label: "item" }),
        createElement(Item, { key: "item.child", label: "item.child" }),
      ),
    );

    expect(order).toEqual(["item", "item.child"]);
  });

  test("lets a parent layout effect observe child layout registrations", () => {
    const container = document.createElement("div");
    const registry: string[] = [];
    let parentSnapshot: string[] = [];

    function Child(props: { label: string }) {
      useLayoutEffect(() => {
        registry.push(props.label);
      }, []);
      return createElement("span", null, props.label);
    }

    function Parent() {
      useLayoutEffect(() => {
        parentSnapshot = [...registry];
      }, []);
      return createElement(
        "section",
        null,
        createElement(Child, { label: "a" }),
        createElement(Child, { label: "b" }),
      );
    }

    createRoot(container).render(createElement(Parent, null));

    expect(parentSnapshot).toEqual(["a", "b"]);
  });

  test.each([
    ["layout", useLayoutEffect],
    ["passive", useEffect],
  ] as const)("runs nested %s cleanup and setup in child-first order", (_kind, useHook) => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const calls: string[] = [];

    function Child(props: { revision: number }) {
      useHook(() => {
        calls.push(`setup:child:${props.revision}`);
        return () => calls.push(`cleanup:child:${props.revision}`);
      }, [props.revision]);
      return null;
    }

    function Parent(props: { revision: number }) {
      useHook(() => {
        calls.push(`setup:parent:${props.revision}`);
        return () => calls.push(`cleanup:parent:${props.revision}`);
      }, [props.revision]);
      return createElement(Child, { revision: props.revision });
    }

    root.render(createElement(Parent, { revision: 0 }));
    calls.length = 0;
    root.render(createElement(Parent, { revision: 1 }));

    expect(calls).toEqual([
      "cleanup:child:0",
      "cleanup:parent:0",
      "setup:child:1",
      "setup:parent:1",
    ]);
  });

  test("continues effect setup after an error and clears the replaced cleanup", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const calls: string[] = [];
    let setRevision: (value: number) => void = () => undefined;
    let throwerCleanupCount = 0;

    function Thrower(props: { revision: number }) {
      useEffect(() => {
        calls.push(`setup:thrower:${props.revision}`);
        if (props.revision === 1) {
          throw new Error("setup boom");
        }
        return () => {
          throwerCleanupCount += 1;
          calls.push(`cleanup:thrower:${props.revision}`);
        };
      }, [props.revision]);
      return null;
    }

    function Later(props: { revision: number }) {
      useEffect(() => {
        calls.push(`setup:later:${props.revision}`);
        return () => calls.push(`cleanup:later:${props.revision}`);
      }, [props.revision]);
      return null;
    }

    function App() {
      const [revision, update] = useState(0);
      setRevision = update;
      return createElement(
        "section",
        null,
        createElement(Thrower, { revision }),
        createElement(Later, { revision }),
      );
    }

    root.render(createElement(App, null));
    calls.length = 0;

    expect(() => setRevision(1)).toThrow("setup boom");
    expect(calls).toEqual([
      "cleanup:thrower:0",
      "cleanup:later:0",
      "setup:thrower:1",
      "setup:later:1",
    ]);

    root.unmount();
    expect(throwerCleanupCount).toBe(1);
    expect(calls).toContain("cleanup:later:1");
  });

  test("reports every effect setup error after completing the flush", () => {
    const container = document.createElement("div");
    let thrown: unknown;

    function Thrower(props: { message: string }) {
      useEffect(() => {
        throw new Error(props.message);
      }, []);
      return null;
    }

    try {
      createRoot(container).render(
        createElement(
          "section",
          null,
          createElement(Thrower, { message: "first" }),
          createElement(Thrower, { message: "second" }),
        ),
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors).toEqual([
      new Error("first"),
      new Error("second"),
    ]);
  });

  test("retries an effect whose StrictMode replay setup throws", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let setups = 0;

    function App() {
      useEffect(() => {
        setups += 1;
        if (setups === 2) {
          throw new Error("strict replay boom");
        }
        return () => undefined;
      }, []);
      return createElement("span", null, "ready");
    }

    expect(() => root.render(createElement(StrictMode, null, createElement(App, null)))).toThrow(
      "strict replay boom",
    );
    expect(() =>
      root.render(createElement(StrictMode, null, createElement(App, null))),
    ).not.toThrow();

    expect(setups).toBe(4);
  });

  test("restores an effect after its StrictMode replay cleanup throws", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let setups = 0;
    let cleanups = 0;

    function App() {
      useEffect(() => {
        setups += 1;
        return () => {
          cleanups += 1;
          if (cleanups === 1) {
            throw new Error("strict cleanup boom");
          }
        };
      }, []);
      return createElement("span", null, "ready");
    }

    expect(() => root.render(createElement(StrictMode, null, createElement(App, null)))).toThrow(
      "strict cleanup boom",
    );
    expect(() =>
      root.render(createElement(StrictMode, null, createElement(App, null))),
    ).not.toThrow();

    expect(setups).toBe(2);
    expect(cleanups).toBe(1);
  });

  test("continues StrictMode cleanup and replay after a sibling cleanup throws", () => {
    const container = document.createElement("div");
    const calls: string[] = [];
    let thrown: unknown;

    function Child(props: { label: string; shouldThrow?: boolean }) {
      useEffect(() => {
        calls.push(`setup:${props.label}`);
        return () => {
          calls.push(`cleanup:${props.label}`);
          if (props.shouldThrow === true) {
            throw new Error("cleanup boom");
          }
        };
      }, []);
      return null;
    }

    try {
      createRoot(container).render(
        createElement(
          StrictMode,
          null,
          createElement(Child, { label: "first", shouldThrow: true }),
          createElement(Child, { label: "second" }),
        ),
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toEqual(new Error("cleanup boom"));
    expect(calls).toEqual([
      "setup:first",
      "setup:second",
      "cleanup:first",
      "cleanup:second",
      "setup:first",
      "setup:second",
    ]);
  });

  test("defers StrictMode replay updates until every sibling effect is restored", () => {
    const container = document.createElement("div");
    const calls: string[] = [];
    let firstSetups = 0;
    let laterSetups = 0;

    function App() {
      const [count, setCount] = useState(0);
      calls.push(`render:${count}`);
      useEffect(() => {
        firstSetups += 1;
        calls.push(`setup:first:${firstSetups}`);
        if (firstSetups === 2) {
          setCount(1);
        }
      }, []);
      useEffect(() => {
        laterSetups += 1;
        calls.push(`setup:later:${laterSetups}`);
      }, []);
      return createElement("span", null, count);
    }

    createRoot(container).render(createElement(StrictMode, null, createElement(App, null)));

    expect(calls.indexOf("setup:later:2")).toBeLessThan(calls.indexOf("render:1"));
    expect(container.innerHTML).toBe("<span>1</span>");
  });

  test("runs useEffect after render", () => {
    const container = document.createElement("div");
    const effect = vi.fn();

    function App() {
      useEffect(effect);
      return createElement("p", null, "Hello");
    }

    createRoot(container).render(createElement(App, null));

    expect(container.innerHTML).toBe("<p>Hello</p>");
    expect(effect).toHaveBeenCalledTimes(1);
  });

  test("preserves mount effects across ref callback rerenders before effects flush", () => {
    const container = document.createElement("div");
    const effect = vi.fn();

    function App() {
      const [node, setNode] = useState<HTMLDivElement | null>(null);
      useEffect(effect, []);
      return createElement("div", { ref: setNode }, node === null ? "Mounting" : "Ready");
    }

    createRoot(container).render(createElement(App, null));

    expect(container.textContent).toBe("Ready");
    expect(effect).toHaveBeenCalledTimes(1);
  });

  test("preserves mount layout effects in memoized children across ref callback rerenders before effects flush", () => {
    const container = document.createElement("div");
    const effect = vi.fn();

    const NullChild = memo(function NullChild() {
      useLayoutEffect(effect, []);
      return null;
    });

    function App() {
      const [node, setNode] = useState<HTMLDivElement | null>(null);
      return createElement(
        "div",
        { ref: setNode },
        node === null ? "Mounting" : "Ready",
        createElement(NullChild, null),
      );
    }

    createRoot(container).render(createElement(App, null));

    expect(container.textContent).toBe("Ready");
    expect(effect).toHaveBeenCalledTimes(1);
  });

  test("skips effect when dependencies are unchanged", () => {
    const container = document.createElement("div");
    const effect = vi.fn();

    function App() {
      const [count, setCount] = useState(0);
      useEffect(effect, []);
      return createElement("button", { onClick: () => setCount(count + 1) }, count);
    }

    createRoot(container).render(createElement(App, null));
    container.querySelector("button")?.click();

    expect(effect).toHaveBeenCalledTimes(1);
  });

  test("runs cleanup before dependency change rerun and on unmount", () => {
    const container = document.createElement("div");
    const calls: string[] = [];

    function App() {
      const [count, setCount] = useState(0);
      useEffect(() => {
        calls.push(`effect ${count}`);
        return () => calls.push(`cleanup ${count}`);
      }, [count]);
      return createElement("button", { onClick: () => setCount(count + 1) }, count);
    }

    const root = createRoot(container);
    root.render(createElement(App, null));
    container.querySelector("button")?.click();
    root.unmount();

    expect(calls).toEqual(["effect 0", "cleanup 0", "effect 1", "cleanup 1"]);
  });

  test("runs cleanup when a component leaves the rendered tree", () => {
    const container = document.createElement("div");
    const calls: string[] = [];
    let hideChild: () => void = () => {};

    function Child() {
      useEffect(() => {
        calls.push("effect child");
        return () => calls.push("cleanup child");
      }, []);
      return createElement("span", null, "child");
    }

    function App() {
      const [visible, setVisible] = useState(true);
      hideChild = () => setVisible(false);
      return createElement("div", null, visible ? createElement(Child, null) : null);
    }

    createRoot(container).render(createElement(App, null));
    hideChild();

    expect(container.innerHTML).toBe("<div></div>");
    expect(calls).toEqual(["effect child", "cleanup child"]);
  });

  test("legacy unmountComponentAtNode runs effect cleanup", () => {
    const container = document.createElement("div");
    const calls: string[] = [];

    function App() {
      useEffect(() => {
        calls.push("effect");
        return () => calls.push("cleanup");
      }, []);
      return createElement("p", null, "Hello");
    }

    render(createElement(App, null), container);

    expect(unmountComponentAtNode(container)).toBe(true);
    expect(container.innerHTML).toBe("");
    expect(calls).toEqual(["effect", "cleanup"]);
  });

  test("ignores updates dispatched to an instance during its effect cleanup", () => {
    const container = document.createElement("div");
    const eventName = "mreact-cleanup-update";

    function App() {
      const [, setCount] = useState(0);
      useEffect(() => {
        return () => {
          document.dispatchEvent(new Event(eventName));
        };
      }, []);
      useEffect(() => {
        const onUpdate = () => setCount((value) => value + 1);
        document.addEventListener(eventName, onUpdate);
        return () => document.removeEventListener(eventName, onUpdate);
      }, []);
      return createElement("div", null, "Ready");
    }

    const root = createRoot(container);
    root.render(createElement(App, null));

    expect(() => root.unmount()).not.toThrow();
    expect(container.textContent).toBe("");
  });

  test("clears host refs before late passive work after unmount", () => {
    vi.useFakeTimers();

    try {
      const container = document.createElement("div");
      const lateWork: string[] = [];

      function App(props: { type: "bar" | "line" }) {
        const hostRef = useRef<HTMLCanvasElement | null>(null);

        useEffect(() => {
          if (props.type !== "line") {
            return;
          }

          setTimeout(() => {
            if (hostRef.current !== null) {
              lateWork.push("draw");
            }
          }, 0);
        }, [props.type]);

        return createElement("canvas", { ref: hostRef });
      }

      const root = createRoot(container);
      root.render(createElement(App, { type: "bar" }));
      root.render(createElement(App, { type: "line" }));
      root.unmount();
      vi.runAllTimers();

      expect(lateWork).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("runs layout effects before normal effects", () => {
    const container = document.createElement("div");
    const calls: string[] = [];

    function App() {
      useEffect(() => {
        calls.push("effect");
      });
      useLayoutEffect(() => {
        calls.push("layout");
      });
      return createElement("p", null, "Hello");
    }

    createRoot(container).render(createElement(App, null));

    expect(calls).toEqual(["layout", "effect"]);
  });
});
