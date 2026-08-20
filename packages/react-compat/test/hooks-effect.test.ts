// @vitest-environment happy-dom

import { describe, expect, test, vi } from "vitest";
import {
  Component,
  StrictMode,
  createElement,
  createPortal,
  forwardRef,
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

  test("runs deleted subtree layout cleanup before ref detach and DOM removal", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const calls: string[] = [];
    let hide = () => undefined;
    let current: HTMLDivElement | null = null;
    let captured: HTMLDivElement | null = null;

    function Child() {
      useLayoutEffect(() => {
        captured = current;
        return () => calls.push(`layout:${current === captured}:${captured?.isConnected}`);
      }, []);
      useEffect(() => {
        return () => calls.push(`passive:${current === null}:${captured?.isConnected}`);
      }, []);
      return createElement(
        "div",
        {
          ref: (node: HTMLDivElement | null) => {
            current = node;
            if (node === null) {
              calls.push("ref:detach");
            }
          },
        },
        "child",
      );
    }

    function App() {
      const [visible, setVisible] = useState(true);
      hide = () => setVisible(false);
      return createElement("section", null, visible ? createElement(Child, null) : null);
    }

    try {
      root.render(createElement(App, null));
      hide();

      expect(calls).toEqual(["layout:true:true", "ref:detach", "passive:true:false"]);
      expect(captured?.isConnected).toBe(false);
      expect(container.innerHTML).toBe("<section></section>");
    } finally {
      root.unmount();
      container.remove();
    }
  });

  test("defers an active update from deleted layout cleanup until mutation commit", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const calls: string[] = [];
    let renderError: unknown;
    let incrementRevision: (label?: string) => void = () => undefined;

    class Revision extends Component<Record<string, never>, { value: number }> {
      state = { value: 0 };

      componentDidMount() {
        incrementRevision = (label) => this.increment(label);
      }

      increment(label = "cleanup") {
        this.setState(
          ({ value }) => ({ value: value + 1 }),
          () => calls.push(`callback:${label}:${this.state.value}`),
        );
      }

      componentDidUpdate() {
        calls.push(`update:${this.state.value}`);
      }

      render() {
        return createElement("output", { "data-revision": this.state.value });
      }
    }

    function Child(props: { label: string; onCleanup?: () => void }) {
      useLayoutEffect(() => {
        return () => {
          calls.push(`cleanup:${props.label}`);
          props.onCleanup?.();
        };
      }, []);
      return createElement("span", null, props.label);
    }

    function App() {
      const [visible, setVisible] = useState(true);
      useEffect(() => {
        setVisible(false);
      }, []);
      return createElement(
        "main",
        null,
        createElement(Revision, {}),
        visible
          ? [
              createElement(Child, {
                key: "first",
                label: "first",
                onCleanup: () => incrementRevision(),
              }),
              createElement(Child, { key: "second", label: "second" }),
            ]
          : null,
      );
    }

    try {
      root.render(createElement(App, null));
    } catch (error) {
      renderError = error;
    }

    const committedHtml = container.innerHTML;
    const committedCalls = [...calls];
    if (renderError === undefined) {
      root.unmount();
    }
    container.remove();

    expect(renderError).toBeUndefined();
    expect(committedCalls).toEqual([
      "cleanup:first",
      "cleanup:second",
      "update:0",
      "update:1",
      "callback:cleanup:1",
    ]);
    expect(committedHtml).toBe('<main><output data-revision="1"></output></main>');
  });

  test("keeps cleanup updates separate from a class snapshot already rendered for commit", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const calls: string[] = [];
    let incrementRevision: (label: string) => void = () => undefined;

    class Revision extends Component<Record<string, never>, { value: number }> {
      state = { value: 0 };

      componentDidMount() {
        incrementRevision = (label) => this.increment(label);
      }

      increment(label: string) {
        this.setState(
          ({ value }) => ({ value: value + 1 }),
          () => calls.push(`callback:${label}:${this.state.value}`),
        );
      }

      componentDidUpdate() {
        calls.push(`update:${this.state.value}`);
      }

      render() {
        return createElement("output", { "data-revision": this.state.value });
      }
    }

    function Child() {
      useLayoutEffect(() => {
        return () => {
          calls.push("cleanup");
          incrementRevision("cleanup");
        };
      }, []);
      return createElement("span", null, "child");
    }

    function App() {
      const [visible, setVisible] = useState(true);
      useEffect(() => {
        incrementRevision("before-cleanup");
        setVisible(false);
      }, []);
      return createElement(
        "main",
        null,
        createElement(Revision, {}),
        visible ? createElement(Child, null) : null,
      );
    }

    try {
      root.render(createElement(App, null));

      expect(container.innerHTML).toBe(
        '<main><output data-revision="2"></output></main>',
      );
      expect(calls).toEqual([
        "cleanup",
        "update:1",
        "callback:before-cleanup:1",
        "update:2",
        "callback:cleanup:2",
      ]);
    } finally {
      root.unmount();
      container.remove();
    }
  });

  test("runs parent deletion layout cleanup before connected child cleanup", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const calls: string[] = [];
    let hide = () => undefined;

    function Child() {
      const ref = useRef<HTMLSpanElement | null>(null);
      useLayoutEffect(() => {
        const node = ref.current;
        return () => calls.push(`child:${ref.current === node}:${node?.isConnected}`);
      }, []);
      return createElement("span", { ref }, "child");
    }

    function Parent() {
      const ref = useRef<HTMLElement | null>(null);
      useLayoutEffect(() => {
        const node = ref.current;
        return () => calls.push(`parent:${ref.current === node}:${node?.isConnected}`);
      }, []);
      return createElement("article", { ref }, createElement(Child, null));
    }

    function App() {
      const [visible, setVisible] = useState(true);
      hide = () => setVisible(false);
      return createElement("main", null, visible ? createElement(Parent, null) : null);
    }

    const root = createRoot(container);
    try {
      root.render(createElement(App, null));
      hide();

      expect(calls).toEqual(["parent:true:true", "child:true:true"]);
    } finally {
      root.unmount();
      container.remove();
    }
  });

  test("cleans only the removed keyed item while its node is connected", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const calls: string[] = [];
    let removeMiddle = () => undefined;

    function Item(props: { label: string }) {
      const ref = useRef<HTMLLIElement | null>(null);
      useLayoutEffect(() => {
        const node = ref.current;
        return () => calls.push(`${props.label}:${ref.current === node}:${node?.isConnected}`);
      }, []);
      return createElement("li", { ref, "data-label": props.label }, props.label);
    }

    function App() {
      const [items, setItems] = useState(["a", "b", "c"]);
      removeMiddle = () => setItems(["a", "c"]);
      return createElement(
        "ul",
        null,
        items.map((label) => createElement(Item, { key: label, label })),
      );
    }

    const root = createRoot(container);
    try {
      root.render(createElement(App, null));
      const first = container.querySelector('[data-label="a"]');
      const last = container.querySelector('[data-label="c"]');
      removeMiddle();

      expect(calls).toEqual(["b:true:true"]);
      expect(container.querySelector('[data-label="a"]')).toBe(first);
      expect(container.querySelector('[data-label="c"]')).toBe(last);
    } finally {
      root.unmount();
      container.remove();
    }
  });

  test("runs portal subtree layout cleanup before removing the portal node", () => {
    const container = document.createElement("div");
    const portalContainer = document.createElement("div");
    document.body.append(container, portalContainer);
    const calls: string[] = [];
    const ref = { current: null as HTMLButtonElement | null };
    let hide = () => undefined;

    function PortalChild() {
      useLayoutEffect(() => {
        const node = ref.current;
        return () => calls.push(`layout:${ref.current === node}:${node?.isConnected}`);
      }, []);
      return createPortal(createElement("button", { ref }, "portal"), portalContainer);
    }

    function App() {
      const [visible, setVisible] = useState(true);
      hide = () => setVisible(false);
      return visible ? createElement(PortalChild, null) : null;
    }

    const root = createRoot(container);
    try {
      root.render(createElement(App, null));
      hide();

      expect(calls).toEqual(["layout:true:true"]);
      expect(ref.current).toBeNull();
      expect(portalContainer.innerHTML).toBe("");
    } finally {
      root.unmount();
      container.remove();
      portalContainer.remove();
    }
  });

  test("runs a deleted forwardRef layout cleanup before host removal", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const calls: string[] = [];
    let hide = () => undefined;

    const Child = forwardRef(function Child() {
      const ref = useRef<HTMLDivElement | null>(null);
      useLayoutEffect(() => {
        const node = ref.current;
        return () => calls.push(`layout:${ref.current === node}:${node?.isConnected}`);
      }, []);
      return createElement("div", { ref }, "forwarded");
    });

    function App() {
      const [visible, setVisible] = useState(true);
      hide = () => setVisible(false);
      return visible ? createElement(Child, null) : null;
    }

    const root = createRoot(container);
    try {
      root.render(createElement(App, null));
      hide();

      expect(calls).toEqual(["layout:true:true"]);
      expect(container.innerHTML).toBe("");
    } finally {
      root.unmount();
      container.remove();
    }
  });

  test("commits deletion after a layout cleanup throws and continues sibling cleanup", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const calls: string[] = [];
    let hide = () => undefined;

    function Child(props: { label: string; shouldThrow?: boolean }) {
      const ref = useRef<HTMLDivElement | null>(null);
      useLayoutEffect(() => {
        return () => {
          calls.push(`layout:${props.label}:${ref.current?.isConnected}`);
          if (props.shouldThrow === true) {
            throw new Error("deletion cleanup boom");
          }
        };
      }, []);
      return createElement("div", { ref }, props.label);
    }

    function App() {
      const [visible, setVisible] = useState(true);
      hide = () => setVisible(false);
      return visible
        ? createElement(
            "section",
            null,
            createElement(Child, { label: "first", shouldThrow: true }),
            createElement(Child, { label: "second" }),
          )
        : null;
    }

    const root = createRoot(container);
    try {
      root.render(createElement(App, null));

      expect(() => hide()).toThrow("deletion cleanup boom");
      expect(calls).toEqual(["layout:first:true", "layout:second:true"]);
      expect(container.innerHTML).toBe("");
    } finally {
      root.unmount();
      container.remove();
    }
  });

  test("commits deletion and reports layout and callback-ref cleanup errors together", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const calls: string[] = [];
    let hide = () => undefined;
    let thrown: unknown;

    function Child() {
      useLayoutEffect(() => {
        return () => {
          calls.push("layout");
          throw new Error("layout boom");
        };
      }, []);
      return createElement(
        "div",
        {
          ref: (node: HTMLDivElement | null) => {
            if (node === null) {
              calls.push("ref:null");
              return;
            }
            return () => {
              calls.push("ref:cleanup");
              throw new Error("ref boom");
            };
          },
        },
        "child",
      );
    }

    function App() {
      const [visible, setVisible] = useState(true);
      hide = () => setVisible(false);
      return visible ? createElement(Child, null) : null;
    }

    const root = createRoot(container);
    try {
      root.render(createElement(App, null));
      try {
        hide();
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(AggregateError);
      expect((thrown as AggregateError).errors).toEqual([
        new Error("layout boom"),
        new Error("ref boom"),
      ]);
      expect(calls).toEqual(["layout", "ref:cleanup"]);
      expect(container.innerHTML).toBe("");
      expect(() => root.render(createElement("p", null, "next"))).not.toThrow();
      expect(container.innerHTML).toBe("<p>next</p>");
    } finally {
      root.unmount();
      container.remove();
    }
  });

  test("recovers a prepared layout effect after a host mutation aborts", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let setups = 0;
    let cleanups = 0;
    let throwCleanup = true;

    function Child() {
      useLayoutEffect(() => {
        setups += 1;
        return () => {
          cleanups += 1;
          if (throwCleanup) {
            throwCleanup = false;
            throw new Error("aborted cleanup boom");
          }
        };
      }, []);
      return createElement("span", null, "child");
    }

    const MemoChild = memo(Child);

    function App(props: { show: boolean; title: string }) {
      return createElement(
        "section",
        null,
        props.show ? createElement(MemoChild, null) : null,
        createElement("div", { title: props.title }, "tail"),
      );
    }

    const original = createElement(App, { show: true, title: "ok" });
    const throwingTitle = {
      toString() {
        throw new Error("prop boom");
      },
    };

    try {
      root.render(original);

      expect(() =>
        root.render(
          createElement(App, {
            show: false,
            title: throwingTitle as unknown as string,
          }),
        )
      ).toThrow("prop boom");
      expect(container.innerHTML).toBe(
        '<section><span>child</span><div title="ok">tail</div></section>',
      );
      expect({ setups, cleanups }).toEqual({ setups: 1, cleanups: 1 });

      expect(() => root.render(original)).not.toThrow();
      expect({ setups, cleanups }).toEqual({ setups: 2, cleanups: 1 });

      root.render(createElement(App, { show: false, title: "ok" }));
      expect({ setups, cleanups }).toEqual({ setups: 2, cleanups: 2 });
      expect(container.innerHTML).toBe('<section><div title="ok">tail</div></section>');
    } finally {
      root.unmount();
      container.remove();
    }
  });

  test("keeps route-like replacement layout cleanup before host mutation", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const calls: string[] = [];

    function Home() {
      const ref = useRef<HTMLElement | null>(null);
      useLayoutEffect(() => {
        const node = ref.current;
        return () => calls.push(`home:${ref.current === node}:${node?.isConnected}`);
      }, []);
      return createElement("article", { ref }, "home");
    }

    function About() {
      return createElement("article", null, "about");
    }

    const root = createRoot(container);
    try {
      root.render(createElement(Home, null));
      root.render(createElement(About, null));

      expect(calls).toEqual(["home:true:true"]);
      expect(container.innerHTML).toBe("<article>about</article>");
    } finally {
      root.unmount();
      container.remove();
    }
  });

  test("preserves full-root cleanup ordering", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const calls: string[] = [];
    let current: HTMLDivElement | null = null;
    let captured: HTMLDivElement | null = null;

    function App() {
      useLayoutEffect(() => {
        captured = current;
        return () => calls.push(`layout:${current === captured}:${captured?.isConnected}`);
      }, []);
      useEffect(() => {
        return () => calls.push(`passive:${current === captured}:${captured?.isConnected}`);
      }, []);
      return createElement("div", {
        ref: (node: HTMLDivElement | null) => {
          current = node;
          if (node === null) {
            calls.push("ref:detach");
          }
        },
      });
    }

    const root = createRoot(container);
    try {
      root.render(createElement(App, null));
      root.unmount();

      expect(calls).toEqual(["layout:true:true", "passive:true:true", "ref:detach"]);
      expect(captured?.isConnected).toBe(false);
    } finally {
      container.remove();
    }
  });
});
