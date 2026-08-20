// @vitest-environment happy-dom

import { describe, expect, test, vi } from "vitest";
import { cell, effect } from "@reckona/mreact-reactive-core";
import { flushEffects as flushReactiveEffects } from "@reckona/mreact-reactive-core/testing";
import {
  Activity,
  act,
  Children,
  cloneElement,
  Component,
  createContext,
  createErrorBoundary,
  createElement,
  createPortal,
  createRoot,
  forwardRef,
  flushSync,
  hydrateRoot,
  isValidElement,
  lazy,
  memo,
  Profiler,
  PureComponent,
  render,
  renderToString,
  StrictMode,
  useEffect,
  useEffectEvent,
  useCallback,
  useDebugValue,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useActionState,
  useOptimistic,
  useRef,
  useContext,
  useState,
  useSyncExternalStore,
  use,
  cache,
  cacheSignal,
  captureOwnerStack,
  unstable_useCacheRefresh,
  type ReactCompatNode,
} from "../src/index.js";
import {
  __setCacheScopeStorageForTesting,
  createCacheScope,
  refreshCacheScope,
  runWithCacheScope,
  type CacheScope,
} from "../src/internal.js";
import { runWithEventPriority } from "../src/event-priority.js";
import { getFiberRootForContainer } from "../src/fiber-work-loop.js";

describe("react-compat common API subset", () => {
  test("disposes bare component effects on rerender and root unmount", async () => {
    const container = document.createElement("div");
    const source = cell(0);
    const root = createRoot(container);
    let runs = 0;
    let cleanups = 0;

    function App({ label }: { label: string }) {
      effect(() => {
        source.get();
        runs += 1;
        return () => {
          cleanups += 1;
        };
      });
      return createElement("p", null, label);
    }

    root.render(createElement(App, { label: "first" }));
    root.render(createElement(App, { label: "second" }));
    expect(runs).toBe(2);
    expect(cleanups).toBe(1);

    source.set(1);
    await flushReactiveEffects();
    expect(runs).toBe(3);

    root.unmount();
    source.set(2);
    await flushReactiveEffects();
    expect(runs).toBe(3);
    expect(cleanups).toBe(3);
  });

  test("forwardRef passes ref as second argument", () => {
    const container = document.createElement("div");
    const ref = { current: null as HTMLButtonElement | null };
    const Button = forwardRef<{ label: string }, HTMLButtonElement>((props, forwardedRef) =>
      createElement("button", { ref: forwardedRef }, props.label),
    );

    render(createElement(Button, { label: "Save", ref }), container);

    expect(container.innerHTML).toBe("<button>Save</button>");
    expect(ref.current).toBe(container.querySelector("button"));
  });

  test("host callback refs update when the ref prop changes without replacing the node", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const calls: string[] = [];
    let mountedNode: HTMLButtonElement | null = null;
    const firstRef = (node: HTMLButtonElement | null) => {
      calls.push(`first:${node === null ? "null" : node.textContent}`);
      if (node !== null) {
        mountedNode = node;
      }
    };
    const secondRef = (node: HTMLButtonElement | null) => {
      calls.push(`second:${node === null ? "null" : node.textContent}`);
    };

    root.render(createElement("button", { ref: firstRef }, "A"));
    root.render(createElement("button", { ref: secondRef }, "B"));

    expect(container.querySelector("button")).toBe(mountedNode);
    expect(calls).toEqual(["first:A", "first:null", "second:B"]);
  });

  test("uses callback ref cleanup functions on replacement and unmount", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const calls: string[] = [];
    const firstRef = (node: HTMLButtonElement | null) => {
      if (node === null) throw new Error("cleanup-returning refs must not receive null");
      calls.push(`first:${node.textContent}`);
      return () => calls.push("first:cleanup");
    };
    const secondRef = (node: HTMLButtonElement | null) => {
      if (node === null) throw new Error("cleanup-returning refs must not receive null");
      calls.push(`second:${node.textContent}`);
      return () => calls.push("second:cleanup");
    };

    root.render(createElement("button", { ref: firstRef }, "A"));
    root.render(createElement("button", { ref: secondRef }, "B"));
    root.unmount();

    expect(calls).toEqual(["first:A", "first:cleanup", "second:B", "second:cleanup"]);
  });

  test("cleans up a stable callback ref before attaching it to a replacement node", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const calls: string[] = [];
    const ref = (node: HTMLElement | null) => {
      if (node === null) throw new Error("cleanup-returning refs must not receive null");
      calls.push(`attach:${node.tagName}`);
      return () => calls.push(`cleanup:${node.tagName}`);
    };

    root.render(createElement("button", { ref }, "Action"));
    root.render(createElement("a", { ref }, "Action"));
    root.unmount();

    expect(calls).toEqual(["attach:BUTTON", "cleanup:BUTTON", "attach:A", "cleanup:A"]);
  });

  test("host callback refs attach after mounted nodes are connected", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const connectedStates: boolean[] = [];

    try {
      root.render(
        createElement("div", null, [
          createElement(
            "button",
            {
              key: "target",
              ref: (node: HTMLButtonElement | null) => {
                if (node !== null) {
                  connectedStates.push(node.isConnected);
                }
              },
            },
            "Measure",
          ),
        ]),
      );

      expect(connectedStates).toEqual([true]);
    } finally {
      root.unmount();
      container.remove();
    }
  });

  test("discrete event updates flush after native document bubble listeners", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const observedDuringDocumentBubble: string[] = [];

    function App() {
      const [open, setOpen] = useState(false);
      return createElement(
        "button",
        {
          onPointerDown: (event: Event) => {
            event.preventDefault();
            setOpen(true);
          },
        },
        open ? "open" : "closed",
      );
    }

    const onDocumentPointerDown = () => {
      observedDuringDocumentBubble.push(container.textContent ?? "");
    };

    try {
      root.render(createElement(App, null));
      document.addEventListener("pointerdown", onDocumentPointerDown);

      container.querySelector("button")?.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          pointerType: "mouse",
          button: 0,
        }),
      );

      expect(observedDuringDocumentBubble).toEqual(["closed"]);
      expect(container.textContent).toBe("open");
    } finally {
      document.removeEventListener("pointerdown", onDocumentPointerDown);
      root.unmount();
      container.remove();
    }
  });

  test("host nodes are preserved when a discrete event mounts a portal sibling", () => {
    const container = document.createElement("div");
    const portalContainer = document.createElement("div");
    document.body.append(container, portalContainer);
    const root = createRoot(container);

    function App() {
      const [open, setOpen] = useState(false);
      return createElement(
        "section",
        null,
        createElement(
          "button",
          {
            "aria-expanded": open,
            onPointerDown: (event: Event) => {
              event.preventDefault();
              setOpen(true);
            },
          },
          "Open",
        ),
        open
          ? createPortal(createElement("div", { role: "listbox" }, "Options"), portalContainer)
          : null,
      );
    }

    try {
      root.render(createElement(App, null));
      const button = container.querySelector("button");
      button?.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          pointerType: "mouse",
          button: 0,
        }),
      );

      expect(container.querySelector("button")).toBe(button);
      expect(container.querySelector("button")?.getAttribute("aria-expanded")).toBe("true");
      expect(portalContainer.textContent).toBe("Options");
    } finally {
      root.unmount();
      container.remove();
      portalContainer.remove();
    }
  });

  test("unwrapped component host nodes are preserved when a discrete event mounts a portal sibling", () => {
    const container = document.createElement("div");
    const portalContainer = document.createElement("div");
    document.body.append(container, portalContainer);
    const root = createRoot(container);
    let buttonElement: HTMLButtonElement | null = null;
    const listeners = new Set<() => void>();
    const store = {
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getSnapshot: () => buttonElement,
      set(nextButtonElement: HTMLButtonElement | null) {
        if (Object.is(buttonElement, nextButtonElement)) {
          return;
        }
        buttonElement = nextButtonElement;
        for (const listener of Array.from(listeners)) {
          listener();
        }
      },
    };

    function ListboxLike() {
      const [open, setOpen] = useState(false);
      const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
      return [
        createElement(
          "button",
          {
            "aria-expanded": open,
            "data-ready": snapshot === null ? "false" : "true",
            onPointerDown: (event: Event) => {
              event.preventDefault();
              setOpen(true);
            },
            ref: (node: HTMLButtonElement | null) => store.set(node),
          },
          "Open",
        ),
        open
          ? createPortal(createElement("div", { role: "listbox" }, "Options"), portalContainer)
          : null,
      ];
    }

    try {
      root.render(
        createElement(
          "div",
          null,
          createElement(ListboxLike, null),
          createElement("span", null, "Status"),
        ),
      );
      const button = container.querySelector("button");
      button?.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          pointerType: "mouse",
          button: 0,
        }),
      );

      expect(container.querySelector("button")).toBe(button);
      expect(container.querySelector("button")?.getAttribute("aria-expanded")).toBe("true");
      expect(portalContainer.textContent).toBe("Options");
    } finally {
      root.unmount();
      container.remove();
      portalContainer.remove();
    }
  });

  test("createPortal can commit collection nodes into a custom document container", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const calls: string[] = [];

    class CollectionNode {
      nodeType = 8;
      parentNode: CollectionNode | CollectionDocument | null = null;
      firstChild: CollectionNode | null = null;
      lastChild: CollectionNode | null = null;
      nextSibling: CollectionNode | null = null;
      previousSibling: CollectionNode | null = null;
      readonly ownerDocument: CollectionDocument;

      constructor(
        readonly tagName: string,
        ownerDocument: CollectionDocument,
      ) {
        this.ownerDocument = ownerDocument;
      }

      appendChild(child: CollectionNode) {
        if (this.lastChild !== null) {
          this.lastChild.nextSibling = child;
          child.previousSibling = this.lastChild;
        } else {
          this.firstChild = child;
        }
        this.lastChild = child;
        child.parentNode = this;
        child.nextSibling = null;
        return child;
      }

      insertBefore(child: CollectionNode, reference: CollectionNode | null) {
        if (reference === null) {
          return this.appendChild(child);
        }
        child.parentNode = this;
        child.nextSibling = reference;
        child.previousSibling = reference.previousSibling;
        if (reference.previousSibling !== null) {
          reference.previousSibling.nextSibling = child;
        } else {
          this.firstChild = child;
        }
        reference.previousSibling = child;
        return child;
      }

      removeChild(child: CollectionNode) {
        if (child.previousSibling !== null) {
          child.previousSibling.nextSibling = child.nextSibling;
        } else {
          this.firstChild = child.nextSibling;
        }
        if (child.nextSibling !== null) {
          child.nextSibling.previousSibling = child.previousSibling;
        } else {
          this.lastChild = child.previousSibling;
        }
        child.parentNode = null;
        child.nextSibling = null;
        child.previousSibling = null;
        return child;
      }

      setAttribute() {}
      setAttributeNS() {}
      removeAttribute() {}
    }

    class CollectionDocument extends CollectionNode {
      constructor() {
        super("#document-fragment", undefined as unknown as CollectionDocument);
        Object.defineProperty(this, "ownerDocument", {
          configurable: true,
          value: this,
        });
      }

      createElement(tagName: string) {
        return new CollectionNode(tagName, this);
      }
    }

    const collectionDocument = new CollectionDocument();

    root.render(
      createPortal(
        createElement(
          "item",
          {
            ref: (node: CollectionNode | null) => {
              calls.push(node === null ? "null" : node.tagName);
            },
          },
          createElement("leaf", null),
        ),
        collectionDocument as unknown as Element,
      ),
    );

    expect(collectionDocument.firstChild?.tagName).toBe("item");
    expect(collectionDocument.firstChild?.firstChild?.tagName).toBe("leaf");
    expect(calls).toEqual(["item"]);
  });

  test("useImperativeHandle exposes a stable custom ref value and cleans up on unmount", () => {
    const container = document.createElement("div");
    const ref = { current: null as { focus(): void; label: string } | null };
    const calls: string[] = [];
    const Button = forwardRef<{ label: string }, { focus(): void; label: string }>(
      (props, forwardedRef) => {
        useImperativeHandle(
          forwardedRef,
          () => ({
            label: props.label,
            focus() {
              calls.push(`focus:${props.label}`);
            },
          }),
          [props.label],
        );
        return createElement("button", null, props.label);
      },
    );
    const root = createRoot(container);

    root.render(createElement(Button, { label: "A", ref }));
    const firstHandle = ref.current;
    ref.current?.focus();
    root.render(createElement(Button, { label: "A", ref }));
    expect(ref.current).toBe(firstHandle);

    root.render(createElement(Button, { label: "B", ref }));
    expect(ref.current).not.toBe(firstHandle);
    expect(ref.current?.label).toBe("B");

    root.unmount();
    expect(ref.current).toBeNull();
    expect(calls).toEqual(["focus:A"]);
  });

  test("root unmount clears containers without replaceChildren", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    Object.defineProperty(container, "replaceChildren", {
      configurable: true,
      value: undefined,
    });

    root.render(createElement("span", null, "Ada"));
    root.unmount();

    expect(container.textContent).toBe("");
  });

  test("useImperativeHandle creates the handle after host refs are assigned", () => {
    const container = document.createElement("div");
    const ref = { current: null as HTMLDivElement | null };
    const Widget = forwardRef<Record<string, never>, HTMLDivElement>((_props, forwardedRef) => {
      const hostRef = useRef<HTMLDivElement | null>(null);
      useImperativeHandle(forwardedRef, () => {
        if (hostRef.current === null) {
          throw new Error("host ref missing");
        }
        return hostRef.current;
      });
      return createElement("div", { ref: hostRef }, "ready");
    });

    render(createElement(Widget, { ref }), container);

    expect(ref.current).toBe(container.querySelector("div"));
  });

  test("useImperativeHandle does not publish handles during insertion effects", () => {
    const container = document.createElement("div");
    const ref = { current: null as { ready: true } | null };
    const observedDuringInsertion: Array<{ ready: true } | null> = [];

    const Widget = forwardRef<Record<string, never>, { ready: true }>((_props, forwardedRef) => {
      useImperativeHandle(forwardedRef, () => ({ ready: true }));
      useInsertionEffect(() => {
        observedDuringInsertion.push(ref.current);
      });
      return createElement("div", null, "ready");
    });

    render(createElement(Widget, { ref }), container);

    expect(observedDuringInsertion).toEqual([null]);
    expect(ref.current).toEqual({ ready: true });
  });

  test("async act drains chained microtask updates until idle", async () => {
    const container = document.createElement("div");
    let setValue: (value: string) => void = () => {};

    function App() {
      const [value, innerSetValue] = useState("idle");
      setValue = innerSetValue;
      return createElement("span", null, value);
    }

    render(createElement(App, null), container);

    await act(async () => {
      let chain = Promise.resolve();
      for (let index = 0; index < 12; index += 1) {
        chain = chain.then(() => undefined);
      }
      void chain.then(() => setValue("done"));
    });

    expect(container.innerHTML).toBe("<span>done</span>");
  });

  test("memo renders the wrapped component", () => {
    const container = document.createElement("div");
    const Label = memo((props: { value: string }) => createElement("span", null, props.value));

    render(createElement(Label, { value: "memo" }), container);

    expect(container.innerHTML).toBe("<span>memo</span>");
  });

  test("memo skips rendering when props are shallow-equal", () => {
    const container = document.createElement("div");
    const calls: string[] = [];
    const Label = memo((props: { value: string }) => {
      calls.push(`render:${props.value}`);
      return createElement("span", null, props.value);
    });
    const root = createRoot(container);

    root.render(createElement(Label, { value: "memo" }));
    const firstSpan = container.querySelector("span");
    root.render(createElement(Label, { value: "memo" }));

    expect(container.querySelector("span")).toBe(firstSpan);
    expect(calls).toEqual(["render:memo"]);

    root.render(createElement(Label, { value: "next" }));

    expect(container.textContent).toBe("next");
    expect(calls).toEqual(["render:memo", "render:next"]);
  });

  test("memo uses custom compare", () => {
    const container = document.createElement("div");
    const calls: string[] = [];
    const Label = memo(
      (props: { value: string; version: number }) => {
        calls.push(`render:${props.value}:${props.version}`);
        return createElement("span", null, props.value);
      },
      (previous, next) => previous.version === next.version,
    );
    const root = createRoot(container);

    root.render(createElement(Label, { value: "A", version: 1 }));
    root.render(createElement(Label, { value: "B", version: 1 }));
    root.render(createElement(Label, { value: "C", version: 2 }));

    expect(container.textContent).toBe("C");
    expect(calls).toEqual(["render:A:1", "render:C:2"]);
  });

  test("memo does not skip its own state updates", () => {
    const container = document.createElement("div");
    const calls: string[] = [];
    const Counter = memo((props: { label: string }) => {
      const [count, setCount] = useState(0);
      calls.push(`render:${props.label}:${count}`);
      return createElement(
        "button",
        { onClick: () => setCount((value) => value + 1) },
        `${props.label}:${count}`,
      );
    });
    const root = createRoot(container);

    root.render(createElement(Counter, { label: "count" }));
    container.querySelector("button")?.click();
    root.render(createElement(Counter, { label: "count" }));

    expect(container.textContent).toBe("count:1");
    expect(calls).toEqual(["render:count:0", "render:count:1"]);
  });

  test("PureComponent does not skip its own state updates", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const calls: string[] = [];

    class Counter extends PureComponent<{ label: string }, { count: number }> {
      state = { count: 0 };

      render() {
        calls.push(`render:${this.props.label}:${this.state.count}`);
        return createElement(
          "button",
          { onClick: () => this.setState({ count: this.state.count + 1 }) },
          `${this.props.label}:${this.state.count}`,
        );
      }
    }

    root.render(createElement(Counter, { label: "pure" }));
    container.querySelector("button")?.click();

    expect(container.textContent).toBe("pure:1");
    expect(calls).toEqual(["render:pure:0", "render:pure:1"]);
  });

  test("class component rerenders after an async setState", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    class AsyncCounter extends PureComponent<Record<string, never>, { count: number }> {
      state = { count: 0 };

      componentDidMount() {
        setTimeout(() => {
          this.setState({ count: 1 });
        }, 0);
      }

      render() {
        return createElement("span", null, this.state.count);
      }
    }

    root.render(createElement(AsyncCounter, {}));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(container.textContent).toBe("1");
  });

  test("class component async setState survives static host subtree reuse", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    class AsyncCounter extends PureComponent<Record<string, never>, { count: number }> {
      state = { count: 0 };

      componentDidMount() {
        setTimeout(() => {
          this.setState({ count: 1 });
        }, 0);
      }

      render() {
        return createElement("span", null, this.state.count);
      }
    }

    const stableChild = createElement(AsyncCounter, {});

    function Wrapper() {
      return createElement("div", null, stableChild);
    }

    root.render(createElement(Wrapper, {}));
    root.render(createElement(Wrapper, {}));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(container.textContent).toBe("1");
  });

  test("PureComponent still traverses dirty child hook updates", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let increment: (() => void) | undefined;

    function Child() {
      const [count, setCount] = useState(0);
      increment = () => setCount((value) => value + 1);
      return createElement("span", null, count);
    }

    class Parent extends PureComponent<{ label: string }> {
      render() {
        return createElement("div", null, this.props.label, createElement(Child, {}));
      }
    }

    root.render(createElement(Parent, { label: "count:" }));
    increment?.();
    await Promise.resolve();

    expect(container.textContent).toBe("count:1");
  });

  test("PureComponent still traverses dirty child class updates", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let increment: (() => void) | undefined;

    class Child extends PureComponent<Record<string, never>, { count: number }> {
      state = { count: 0 };

      render() {
        increment = () => this.setState({ count: this.state.count + 1 });
        return createElement("span", null, this.state.count);
      }
    }

    class Parent extends PureComponent<{ label: string }> {
      render() {
        return createElement("div", null, this.props.label, createElement(Child, {}));
      }
    }

    root.render(createElement(Parent, { label: "count:" }));
    increment?.();

    expect(container.textContent).toBe("count:1");
  });

  test("class setState during layout effect preserves rendered SVG children", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    class Animate extends Component<{
      children?: (style: { t: number }) => ReactCompatNode;
      onAnimationStart: () => void;
    }> {
      componentDidMount() {
        this.props.onAnimationStart();
      }

      render() {
        return this.props.children?.({ t: 0 }) ?? null;
      }
    }

    class Series extends PureComponent<Record<string, never>, { isAnimationFinished: boolean }> {
      state = { isAnimationFinished: true };

      render() {
        return createElement(
          "g",
          { className: "series" },
          createElement(
            Animate,
            {
              onAnimationStart: () => this.setState({ isAnimationFinished: false }),
            },
            () => createElement("path", { className: "series-curve", d: "M0 0L10 10" }),
          ),
          this.state.isAnimationFinished
            ? createElement("circle", { className: "series-dot", cx: 10, cy: 10, r: 2 })
            : null,
        );
      }
    }

    root.render(createElement("svg", null, createElement(Series, {})));

    expect(container.querySelector(".series")).not.toBeNull();
    expect(container.querySelector(".series-curve")).not.toBeNull();
  });

  test("StrictMode effect replay remounts class component lifecycles", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const calls: string[] = [];
    let mounted = false;

    class AnimatedSeries extends Component<Record<string, never>, { mountCount: number }> {
      state = { mountCount: 0 };

      componentDidMount() {
        mounted = true;
        calls.push("mount");
        this.setState((state) => ({ mountCount: state.mountCount + 1 }));
      }

      componentWillUnmount() {
        mounted = false;
        calls.push("unmount");
      }

      render() {
        return createElement("path", {
          d: "M0 0L10 10",
          "data-mount-count": this.state.mountCount,
        });
      }
    }

    root.render(
      createElement(
        StrictMode,
        null,
        createElement("svg", null, createElement(AnimatedSeries, {})),
      ),
    );

    expect(calls).toEqual(["mount", "unmount", "mount"]);
    expect(mounted).toBe(true);
    expect(container.querySelector("path")?.getAttribute("data-mount-count")).toBe("2");
  });

  test("lazy renders fallback first and resolved component after promise resolves", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let resolveModule: (module: {
      default: (props: { value: string }) => ReactCompatNode;
    }) => void = () => {};
    const LazyLabel = lazy(
      () =>
        new Promise<{ default: (props: { value: string }) => ReactCompatNode }>((resolve) => {
          resolveModule = resolve;
        }),
    );

    root.render(createElement(LazyLabel, { value: "ready" }));

    expect(container.innerHTML).toBe("");

    resolveModule({
      default: (props) => createElement("span", null, props.value),
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(container.innerHTML).toBe("<span>ready</span>");
  });

  test("Context.Consumer renders with the current context value", () => {
    const container = document.createElement("div");
    const Theme = createContext("light");

    render(
      createElement(
        Theme.Provider,
        { value: "dark" },
        createElement(Theme.Consumer, null, (value: string) => createElement("p", null, value)),
      ),
      container,
    );

    expect(container.innerHTML).toBe("<p>dark</p>");
  });

  test("useInsertionEffect runs before layout and normal effects", () => {
    const container = document.createElement("div");
    const calls: string[] = [];

    function App() {
      useInsertionEffect(() => {
        calls.push("insertion");
      });
      return createElement("p", null, "Hello");
    }

    render(createElement(App, null), container);

    expect(calls).toEqual(["insertion"]);
  });

  test("StrictMode double invokes render and replays mount effects", () => {
    const container = document.createElement("div");
    const calls: string[] = [];

    function App() {
      calls.push("render");
      useEffect(() => {
        calls.push("effect");
        return () => {
          calls.push("cleanup");
        };
      }, []);
      return createElement("p", null, "strict");
    }

    render(createElement(StrictMode, null, createElement(App, null)), container);

    expect(container.innerHTML).toBe("<p>strict</p>");
    expect(calls).toEqual(["render", "render", "effect", "cleanup", "effect"]);
    expect(getFiberRootForContainer(container)?.current.child?.tag).toBe("strict-mode");
  });

  test("StrictMode keeps the first useMemo value while double invoking the factory", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const values: string[] = [];
    const contextValues = new Set<{ value: string }>();
    const Context = createContext<{ value: string } | null>(null);

    function App() {
      const value = useMemo(() => {
        const nextValue = values.length === 0 ? "cached" : "not cached";
        values.push(nextValue);
        return { value: nextValue };
      }, []);

      return createElement(Context.Provider, { value }, createElement(Consumer, null));
    }

    function Consumer() {
      const value = useContext(Context);
      if (value !== null) {
        contextValues.add(value);
      }
      return createElement("p", null, value?.value);
    }

    root.render(createElement(StrictMode, null, createElement(App, null)));

    expect(values).toEqual(["cached", "not cached"]);
    expect(container.textContent).toBe("cached");
    expect(contextValues.size).toBe(1);
  });

  test("flushSync executes the callback synchronously and returns its value", () => {
    const calls: string[] = [];

    const value = flushSync(() => {
      calls.push("callback");
      return 42;
    });

    expect(value).toBe(42);
    expect(calls).toEqual(["callback"]);
  });

  test("useSyncExternalStore subscribes and re-renders from external snapshots", () => {
    const container = document.createElement("div");
    let value = "A";
    const listeners = new Set<() => void>();

    function subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    function App() {
      const snapshot = useSyncExternalStore(subscribe, () => value);
      return createElement("p", null, snapshot);
    }

    render(createElement(App, null), container);
    expect(container.innerHTML).toBe("<p>A</p>");

    value = "B";
    for (const listener of listeners) {
      listener();
    }

    expect(container.innerHTML).toBe("<p>B</p>");
  });

  test("useState keeps setter identity stable across rerenders", () => {
    const container = document.createElement("div");
    let effectRuns = 0;

    function App() {
      const [count, setCount] = useState(0);
      useEffect(() => {
        effectRuns += 1;
      }, [setCount]);

      return createElement("button", { onClick: () => setCount(count + 1) }, count);
    }

    createRoot(container).render(createElement(App, null));
    container.querySelector("button")?.click();

    expect(container.innerHTML).toBe("<button>1</button>");
    expect(effectRuns).toBe(1);
  });

  test("useSyncExternalStore keeps the subscription stable when getSnapshot identity changes", () => {
    const container = document.createElement("div");
    let value = "A";
    let subscribeCalls = 0;
    const listeners = new Set<() => void>();

    function subscribe(listener: () => void) {
      subscribeCalls += 1;
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    function App() {
      const [count, setCount] = useState(0);
      const snapshot = useSyncExternalStore(subscribe, () => value);
      return createElement(
        "button",
        { onClick: () => setCount(count + 1) },
        `${snapshot}:${count}`,
      );
    }

    createRoot(container).render(createElement(App, null));
    container.querySelector("button")?.click();

    expect(container.innerHTML).toBe("<button>A:1</button>");
    expect(subscribeCalls).toBe(1);
  });

  test("useSyncExternalStore defers listener updates fired during host ref commit", () => {
    const container = document.createElement("div");
    let value = 0;
    const listeners = new Set<() => void>();

    const store = {
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getSnapshot: () => value,
      set(nextValue: number) {
        value = nextValue;
        for (const listener of Array.from(listeners)) {
          listener();
        }
      },
    };

    let reveal = () => undefined;

    function Probe() {
      const [visible, setVisible] = useState(false);
      const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
      reveal = () => setVisible(true);
      return createElement(
        "section",
        null,
        createElement("span", null, snapshot),
        visible
          ? createElement(
              "button",
              {
                ref: (node: HTMLButtonElement | null) => {
                  if (node !== null && value === 0) {
                    store.set(1);
                  }
                },
              },
              "ready",
            )
          : null,
      );
    }

    createRoot(container).render(createElement(Probe, null));
    reveal();

    expect(container.innerHTML).toBe("<section><span>1</span><button>ready</button></section>");
  });

  test("useSyncExternalStore observes ref updates that happen before subscription mount", () => {
    const container = document.createElement("div");
    let value: HTMLButtonElement | null = null;
    const listeners = new Set<() => void>();

    const store = {
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getSnapshot: () => value,
      set(nextValue: HTMLButtonElement | null) {
        if (Object.is(value, nextValue)) {
          return;
        }
        value = nextValue;
        for (const listener of Array.from(listeners)) {
          listener();
        }
      },
    };

    function Probe() {
      const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
      return createElement(
        "section",
        null,
        createElement("span", null, snapshot === null ? "missing" : "ready"),
        createElement(
          "button",
          { ref: (node: HTMLButtonElement | null) => store.set(node) },
          "target",
        ),
      );
    }

    createRoot(container).render(createElement(Probe, null));

    expect(container.innerHTML).toBe(
      "<section><span>ready</span><button>target</button></section>",
    );
  });

  test("useSyncExternalStore observes parent passive effect updates before child subscriptions mount", () => {
    const container = document.createElement("div");
    let value = "initial";
    const listeners = new Set<() => void>();

    const store = {
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getSnapshot: () => value,
      set(nextValue: string) {
        value = nextValue;
        for (const listener of Array.from(listeners)) {
          listener();
        }
      },
    };

    function Child() {
      const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
      return createElement("span", null, snapshot);
    }

    function Parent() {
      useEffect(() => {
        store.set("ready");
      }, []);

      return createElement("section", null, createElement(Child, null));
    }

    createRoot(container).render(createElement(Parent, null));

    expect(container.innerHTML).toBe("<section><span>ready</span></section>");
  });

  test("useSyncExternalStore checks for mutations made while subscribing", () => {
    const container = document.createElement("div");
    let value = 0;

    function subscribe() {
      value = 1;
      return () => undefined;
    }

    function Probe() {
      const snapshot = useSyncExternalStore(subscribe, () => value);
      return createElement("span", null, snapshot);
    }

    createRoot(container).render(createElement(Probe, null));

    expect(container.innerHTML).toBe("<span>1</span>");
  });

  test("useSyncExternalStore unsubscribes when the post-subscribe snapshot throws", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const listeners = new Set<() => void>();
    let subscribed = false;

    function subscribe(listener: () => void) {
      subscribed = true;
      listeners.add(listener);
      return () => {
        subscribed = false;
        listeners.delete(listener);
      };
    }

    function Probe() {
      const snapshot = useSyncExternalStore(subscribe, () => {
        if (subscribed) {
          throw new Error("snapshot boom");
        }
        return 0;
      });
      return createElement("span", null, snapshot);
    }

    expect(() => root.render(createElement(Probe, null))).toThrow("snapshot boom");
    expect(listeners.size).toBe(0);
    root.unmount();
    expect(listeners.size).toBe(0);
  });

  test("useSyncExternalStore checks for mutations missed by an inline resubscribe", () => {
    const container = document.createElement("div");
    const listeners = new Set<() => void>();
    let value = 0;
    let advance = () => undefined;

    function Writer(props: { revision: number }) {
      useEffect(() => {
        if (props.revision === 1) {
          value = 42;
        }
      }, [props.revision]);
      return null;
    }

    function Reader() {
      const snapshot = useSyncExternalStore(
        (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        () => value,
      );
      return createElement("span", null, snapshot);
    }

    function App() {
      const [revision, setRevision] = useState(0);
      advance = () => setRevision(1);
      return createElement(
        "section",
        null,
        createElement(Writer, { revision }),
        createElement(Reader, null),
      );
    }

    createRoot(container).render(createElement(App, null));
    advance();

    expect(container.innerHTML).toBe("<section><span>42</span></section>");
  });

  test("useSyncExternalStore does not add a render for an unchanged inline subscription", () => {
    const container = document.createElement("div");
    const listeners = new Set<() => void>();
    let renders = 0;
    let rerender = () => undefined;

    function Reader() {
      renders += 1;
      const snapshot = useSyncExternalStore(
        (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        () => 7,
      );
      return createElement("span", null, snapshot);
    }

    function App() {
      const [revision, setRevision] = useState(0);
      rerender = () => setRevision(1);
      return createElement("section", { "data-revision": revision }, createElement(Reader, null));
    }

    createRoot(container).render(createElement(App, null));
    rerender();

    expect(renders).toBe(2);
    expect(listeners.size).toBe(1);
    expect(container.innerHTML).toBe('<section data-revision="1"><span>7</span></section>');
  });

  test("useSyncExternalStore host ref updates do not duplicate portal children", () => {
    const container = document.createElement("div");
    const portalContainer = document.createElement("div");
    let value = 0;
    const listeners = new Set<() => void>();

    const store = {
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getSnapshot: () => value,
      set(nextValue: number) {
        value = nextValue;
        for (const listener of Array.from(listeners)) {
          listener();
        }
      },
    };

    function Probe() {
      const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
      return createElement(
        "section",
        null,
        createElement("span", null, snapshot),
        createPortal(
          createElement(
            "button",
            {
              ref: (node: HTMLButtonElement | null) => {
                if (node !== null && value === 0) {
                  store.set(1);
                }
              },
            },
            "portal ready",
          ),
          portalContainer,
        ),
      );
    }

    createRoot(container).render(createElement(Probe, null));

    expect(container.innerHTML).toBe("<section><span>1</span></section>");
    expect(portalContainer.innerHTML).toBe("<button>portal ready</button>");
  });

  test("portal children are replaced when their owner remounts", () => {
    const container = document.createElement("div");
    const portalContainer = document.createElement("div");
    let remount = () => undefined;

    function PortalOwner(props: { version: number }) {
      return createPortal(
        createElement("span", { "data-version": props.version }, `portal ${props.version}`),
        portalContainer,
      );
    }

    function Probe() {
      const [version, setVersion] = useState(0);
      remount = () => setVersion(1);
      return createElement(
        "section",
        null,
        createElement("p", null, version),
        createElement(PortalOwner, { key: version, version }),
      );
    }

    createRoot(container).render(createElement(Probe, null));
    remount();

    expect(container.innerHTML).toBe("<section><p>1</p></section>");
    expect(portalContainer.innerHTML).toBe('<span data-version="1">portal 1</span>');
  });

  test("portal child list updates replace owned children during dirty commits", () => {
    const container = document.createElement("div");
    const portalContainer = document.createElement("div");
    let showSecond = () => undefined;

    function Probe() {
      const [expanded, setExpanded] = useState(false);
      showSecond = () => setExpanded(true);
      return createElement(
        "section",
        null,
        "root",
        createPortal(
          expanded
            ? [
                createElement("span", { key: "first" }, "first"),
                createElement("span", { key: "second" }, "second"),
              ]
            : createElement("span", { key: "first" }, "first"),
          portalContainer,
        ),
      );
    }

    createRoot(container).render(createElement(Probe, null));
    showSecond();

    expect(container.innerHTML).toBe("<section>root</section>");
    expect(portalContainer.innerHTML).toBe("<span>first</span><span>second</span>");
  });

  test("pointer down handlers receive pointer metadata and can prevent default", () => {
    const container = document.createElement("div");
    const events: Array<{
      button: number | undefined;
      defaultPrevented: boolean;
      pointerType: string | undefined;
    }> = [];

    function Probe() {
      return createElement(
        "button",
        {
          onPointerDown: (event: {
            button?: number;
            defaultPrevented: boolean;
            pointerType?: string;
            preventDefault(): void;
          }) => {
            event.preventDefault();
            events.push({
              button: event.button,
              defaultPrevented: event.defaultPrevented,
              pointerType: event.pointerType,
            });
          },
        },
        "toggle",
      );
    }

    createRoot(container).render(createElement(Probe, null));
    container.querySelector("button")?.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        pointerType: "mouse",
      }),
    );

    expect(events).toEqual([{ button: 0, defaultPrevented: true, pointerType: "mouse" }]);
  });

  test("focus event updates preserve the host element", () => {
    const container = document.createElement("div");

    function Probe() {
      const [focused, setFocused] = useState(false);
      return createElement(
        "button",
        {
          "data-focused": focused ? "yes" : "no",
          onFocus: () => setFocused(true),
        },
        "focus target",
      );
    }

    createRoot(container).render(createElement(Probe, null));
    const before = container.querySelector("button");
    before?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    const after = container.querySelector("button");

    expect(after).toBe(before);
    expect(after?.getAttribute("data-focused")).toBe("yes");
  });

  test("memo does not skip external store updates from its own hooks", () => {
    const container = document.createElement("div");
    let value = "empty";
    const listeners = new Set<() => void>();

    function subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    const Subscriber = memo((props: { label: string }) => {
      const snapshot = useSyncExternalStore(subscribe, () => value);
      return createElement("p", null, `${props.label}:${snapshot}`);
    });

    const root = createRoot(container);
    root.render(createElement(Subscriber, { label: "store" }));
    value = "ready";
    for (const listener of listeners) {
      listener();
    }
    root.render(createElement(Subscriber, { label: "store" }));

    expect(container.innerHTML).toBe("<p>store:ready</p>");
  });

  test("memo does not skip external store updates from child hooks", () => {
    const container = document.createElement("div");
    let value = "empty";
    const listeners = new Set<() => void>();

    function subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    function Subscriber() {
      const snapshot = useSyncExternalStore(subscribe, () => value);
      return createElement("p", null, snapshot);
    }

    const Parent = memo((props: { label: string }) =>
      createElement("section", null, props.label, createElement(Subscriber, null)),
    );

    const root = createRoot(container);
    root.render(createElement(Parent, { label: "store:" }));
    value = "ready";
    for (const listener of listeners) {
      listener();
    }

    expect(container.innerHTML).toBe("<section>store:<p>ready</p></section>");
  });

  test("memoized subscribers re-render from layout-effect deferred selector updates", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    type Listener = () => void;
    const SelectorContext = createContext<{
      addEventListener: (callback: Listener, options?: { deferred?: boolean }) => () => void;
      flushDeferred: () => void;
      publish: () => void;
    } | null>(null);
    const valueRef = { current: false };
    const renders: boolean[] = [];
    let publish = () => undefined;

    function useDeferredSelector(selector: () => boolean): boolean {
      const context = useContext(SelectorContext);
      if (context === null) {
        throw new Error("missing selector context");
      }

      const [, forceRender] = useReducer((count: number) => count + 1, 0);
      const latestSelector = useRef<() => boolean>(() => false);
      const latestSelectedState = useRef<boolean | null>(null);
      let selected: boolean;

      if (selector !== latestSelector.current) {
        const next = selector();
        selected = Object.is(latestSelectedState.current, next)
          ? (latestSelectedState.current as boolean)
          : next;
      } else {
        selected = latestSelectedState.current as boolean;
      }

      latestSelector.current = selector;
      latestSelectedState.current = selected;

      const update = useCallback(() => {
        const next = latestSelector.current();
        if (Object.is(latestSelectedState.current, next)) {
          return;
        }

        latestSelectedState.current = next;
        forceRender();
      }, []);

      useLayoutEffect(() => {
        const unsubscribe = context.addEventListener(update, { deferred: true });
        update();
        return unsubscribe;
      }, [context, update]);

      return selected;
    }

    function EditableLike({ children }: { children: ReactCompatNode }) {
      const context = useContext(SelectorContext);
      if (context === null) {
        throw new Error("missing selector context");
      }

      const [, forceRender] = useReducer((count: number) => count + 1, 0);

      useLayoutEffect(() => context.addEventListener(forceRender), [context]);
      useLayoutEffect(context.flushDeferred);

      return createElement("section", null, children);
    }

    function renderElement() {
      const selector = useCallback(() => valueRef.current, []);
      const selected = useDeferredSelector(selector);
      renders.push(selected);
      return createElement("p", null, selected ? "selected" : "empty");
    }

    const MemoSelectorProbe = memo(
      ({ render }: { render: () => ReactCompatNode }) => render(),
      (previous, next) => previous.render === next.render,
    );

    function Provider() {
      const listeners = useRef(new Set<Listener>());
      const deferredListeners = useRef(new Set<Listener>());
      const context = useMemo(
        () => ({
          addEventListener(callback: Listener, { deferred = false }: { deferred?: boolean } = {}) {
            const listener = deferred ? () => deferredListeners.current.add(callback) : callback;
            listeners.current.add(listener);

            return () => {
              listeners.current.delete(listener);
            };
          },
          flushDeferred() {
            for (const listener of deferredListeners.current) {
              listener();
            }
            deferredListeners.current.clear();
          },
          publish() {
            for (const listener of listeners.current) {
              listener();
            }
          },
        }),
        [],
      );

      publish = context.publish;

      return createElement(
        SelectorContext.Provider,
        { value: context },
        createElement(
          EditableLike,
          null,
          createElement(MemoSelectorProbe, { render: renderElement }),
        ),
      );
    }

    root.render(createElement(Provider, null));
    renders.length = 0;
    valueRef.current = true;

    act(() => {
      publish();
    });

    expect(renders).toEqual([true]);
    expect(container.innerHTML).toBe("<section><p>selected</p></section>");
  });

  test("useSyncExternalStore does not rerender subscribers with unchanged snapshots", () => {
    const container = document.createElement("div");
    const listeners = new Set<() => void>();
    let state = {
      count: 0,
      inc() {
        state = { ...state, count: state.count + 1 };
        for (const listener of listeners) {
          listener();
        }
      },
    };
    let counterRenderCount = 0;
    let controlRenderCount = 0;

    function subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }

    function Counter() {
      counterRenderCount += 1;
      const count = useSyncExternalStore(subscribe, () => state.count);
      return createElement("span", null, count);
    }

    function Control() {
      controlRenderCount += 1;
      const inc = useSyncExternalStore(subscribe, () => state.inc);
      return createElement("button", { onClick: inc }, "inc");
    }

    render(
      createElement("div", null, createElement(Counter, null), createElement(Control, null)),
      container,
    );
    container.querySelector("button")?.click();

    expect(container.textContent).toBe("1inc");
    expect(counterRenderCount).toBe(2);
    expect(controlRenderCount).toBe(1);
  });

  test("external store subscription checks do not recursively rerender during effect flush", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let snapshot = 0;
    let subscriberRenders = 0;
    const listenerCountsDuringUpdatedRender: number[] = [];
    const listeners = new Set<() => void>();
    const store = {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      set(value: number) {
        snapshot = value;
        for (const listener of Array.from(listeners)) {
          listener();
        }
      },
    };

    function Subscriber({ index }: { index: number }) {
      subscriberRenders += 1;
      const value = useSyncExternalStore(store.subscribe, store.getSnapshot);
      if (value === 1) {
        listenerCountsDuringUpdatedRender.push(listeners.size);
      }
      return createElement("span", null, `${index}:${value};`);
    }

    function App() {
      useLayoutEffect(() => {
        store.set(1);
      }, []);

      return createElement(
        "section",
        null,
        Array.from({ length: 1200 }, (_, index) =>
          createElement(Subscriber, { key: index, index }),
        ),
      );
    }

    root.render(createElement(App, null));

    expect(container.querySelectorAll("span")).toHaveLength(1200);
    expect(container.textContent).toContain("0:1;");
    expect(container.textContent).toContain("1199:1;");
    expect(subscriberRenders).toBe(2400);
    expect(Math.min(...listenerCountsDuringUpdatedRender)).toBe(1200);
  });

  test("passive mount effects that update external stores do not rerun after subscriber updates", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let snapshot = 0;
    let mountEffects = 0;
    let subscriberRenders = 0;
    const listeners = new Set<() => void>();
    const store = {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      set(value: number) {
        snapshot = value;
        for (const listener of Array.from(listeners)) {
          listener();
        }
      },
    };

    function Subscriber() {
      subscriberRenders += 1;
      const value = useSyncExternalStore(store.subscribe, store.getSnapshot);
      return createElement("span", null, value);
    }

    function Initializer() {
      useEffect(() => {
        mountEffects += 1;
        store.set(1);
      }, []);

      return createElement("div", null, createElement(Subscriber, null));
    }

    root.render(createElement(Initializer, null));

    expect(container.innerHTML).toBe("<div><span>1</span></div>");
    expect(mountEffects).toBe(1);
    expect(subscriberRenders).toBe(2);
  });

  test("useSyncExternalStore restarts render instead of committing torn snapshots", () => {
    const container = document.createElement("div");
    let value = "A";
    let snapshotReads = 0;
    const committedHtml: string[] = [];
    const listeners = new Set<() => void>();

    function subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    function Reader(props: { mutate?: boolean }) {
      const snapshot = useSyncExternalStore(subscribe, () => {
        const snapshotValue = value;
        snapshotReads += 1;

        if (props.mutate === true && snapshotReads === 2) {
          value = "B";
        }

        return snapshotValue;
      });

      return createElement("span", null, snapshot);
    }

    function App() {
      useLayoutEffect(() => {
        committedHtml.push(container.innerHTML);
      });

      return createElement("div", null, [
        createElement(Reader, { key: "left", mutate: true }),
        createElement(Reader, { key: "right" }),
      ]);
    }

    render(createElement(App, null), container);

    expect(container.innerHTML).toBe("<div><span>B</span><span>B</span></div>");
    expect(committedHtml).toEqual(["<div><span>B</span><span>B</span></div>"]);
  });

  test("an aborted torn render does not clean a retained layout effect", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const listeners = new Set<() => void>();
    const ref = { current: null as HTMLDivElement | null };
    let value: "show" | "hide" = "show";
    let armTear = false;
    let cleanups = 0;

    function subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    function Child() {
      useLayoutEffect(() => {
        return () => {
          cleanups += 1;
        };
      }, []);
      return createElement("div", { ref }, "child");
    }

    function App() {
      const snapshot = useSyncExternalStore(subscribe, () => {
        const current = value;
        if (armTear) {
          armTear = false;
          value = "show";
        }
        return current;
      });
      return snapshot === "show" ? createElement(Child, null) : null;
    }

    try {
      root.render(createElement(App, null));
      const node = ref.current;
      value = "hide";
      armTear = true;
      root.render(createElement(App, null));

      expect(cleanups).toBe(0);
      expect(ref.current).toBe(node);
      expect(node?.isConnected).toBe(true);
      expect(container.innerHTML).toBe("<div>child</div>");
    } finally {
      root.unmount();
      container.remove();
    }
  });

  test("hydrateRoot restarts hydration instead of committing torn snapshots", () => {
    const container = document.createElement("div");
    container.innerHTML = "<div><span>A</span><span>A</span></div>";
    let value = "A";
    let snapshotReads = 0;
    const committedHtml: string[] = [];
    const listeners = new Set<() => void>();

    function subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    function Reader(props: { mutate?: boolean }) {
      const snapshot = useSyncExternalStore(subscribe, () => {
        const snapshotValue = value;
        snapshotReads += 1;

        if (props.mutate === true && snapshotReads === 2) {
          value = "B";
        }

        return snapshotValue;
      });

      return createElement("span", null, snapshot);
    }

    function App() {
      useLayoutEffect(() => {
        committedHtml.push(container.innerHTML);
      });

      return createElement("div", null, [
        createElement(Reader, { key: "left", mutate: true }),
        createElement(Reader, { key: "right" }),
      ]);
    }

    hydrateRoot(container, createElement(App, null));

    expect(container.innerHTML).toBe("<div><span>B</span><span>B</span></div>");
    expect(committedHtml).toEqual(["<div><span>B</span><span>B</span></div>"]);
  });

  test("useSyncExternalStore stops when snapshots never stabilize before commit", () => {
    const container = document.createElement("div");
    let value = 0;

    function subscribe() {
      return () => undefined;
    }

    function App() {
      const snapshot = useSyncExternalStore(subscribe, () => {
        value += 1;
        return value;
      });
      return createElement("p", null, snapshot);
    }

    expect(() => render(createElement(App, null), container)).toThrow("Store unstable.");
    expect(container.innerHTML).toBe("");
  });

  test("useId returns stable ids across rerenders", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const renderedIds: string[][] = [];

    function Field(props: { label: string }) {
      const id = useId();
      const currentRender = renderedIds.at(-1);
      currentRender?.push(id);
      return createElement("label", { htmlFor: id }, props.label);
    }

    renderedIds.push([]);
    root.render(
      createElement(StrictMode, null, [
        createElement(Field, { key: "a", label: "A" }),
        createElement(Field, { key: "b", label: "B" }),
      ]),
    );
    renderedIds.push([]);
    root.render(
      createElement(StrictMode, null, [
        createElement(Field, { key: "a", label: "A2" }),
        createElement(Field, { key: "b", label: "B2" }),
      ]),
    );

    expect(renderedIds[0]).toHaveLength(4);
    expect(renderedIds[1]).toHaveLength(4);
    expect(new Set(renderedIds[0])).toEqual(new Set(renderedIds[1]));
    expect(new Set(renderedIds[0]).size).toBe(2);
    expect(renderedIds[0]?.every((id) => /^_r_\d+_$/.test(id))).toBe(true);
  });

  test("useId produces distinct ids across client roots mounted at different times", () => {
    const containers = [
      document.createElement("div"),
      document.createElement("div"),
      document.createElement("div"),
    ];
    const ids: string[] = [];

    function Field(props: { index: number }) {
      const id = useId();
      ids[props.index] = id;
      return createElement("input", { id });
    }

    createRoot(containers[0] as HTMLDivElement).render(createElement(Field, { index: 0 }));
    createRoot(containers[1] as HTMLDivElement).render(createElement(Field, { index: 1 }));
    expect(new Set(ids.slice(0, 2)).size).toBe(2);

    createRoot(containers[2] as HTMLDivElement).render(createElement(Field, { index: 2 }));
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => /^_r_\d+_$/.test(id))).toBe(true);
  });

  test("useId honors root identifierPrefix", () => {
    const container = document.createElement("div");
    const root = createRoot(container, { identifierPrefix: "app-" });

    function Field() {
      const id = useId();
      return createElement("label", { htmlFor: id }, id);
    }

    root.render(createElement(Field, null));

    const label = container.querySelector("label");
    expect(label?.htmlFor).toMatch(/^_app-r_\d+_$/);
    expect(label?.textContent).toBe(label?.htmlFor);
  });

  test("useId honors hydrateRoot identifierPrefix", () => {
    const container = document.createElement("div");
    container.innerHTML = '<label for="_app-R_0_">_app-R_0_</label>';

    function Field() {
      const id = useId();
      return createElement("label", { htmlFor: id }, id);
    }

    hydrateRoot(container, createElement(Field, null), {
      identifierPrefix: "app-",
    });

    expect(container.innerHTML).toBe('<label for="_app-R_0_">_app-R_0_</label>');
  });

  test("useId works during renderToString", () => {
    function Field() {
      const id = useId();
      return `<label for="${id}">Name</label><input id="${id}">`;
    }

    expect(renderToString(Field)).toBe('<label for="_R_0_">Name</label><input id="_R_0_">');
  });

  test("useId honors renderToString identifierPrefix", () => {
    function Field() {
      const id = useId();
      return `<label for="${id}">Name</label><input id="${id}">`;
    }

    expect(renderToString(Field, undefined, { identifierPrefix: "srv-" })).toBe(
      '<label for="_srv-R_0_">Name</label><input id="_srv-R_0_">',
    );
  });

  test("cloneElement, isValidElement, and Children helpers operate on element trees", () => {
    const child = createElement("span", { key: "a" }, "A");
    const cloned = cloneElement(child, { className: "item" }, "B");

    expect(isValidElement(child)).toBe(true);
    expect(isValidElement("text")).toBe(false);
    expect(cloned.props).toEqual({ className: "item", children: "B" });
    expect(cloned.key).toBe("a");
    expect(Children.count([child, null, "text"])).toBe(3);
    expect(Children.toArray([child, null, "text"])).toHaveLength(2);
    expect(Children.map([child, "text"], (value, index) => [value, index])).toEqual([
      [child, 0],
      ["text", 1],
    ]);
    const visited: Array<[unknown, number]> = [];
    Children.forEach([child, null, false, "text"], (value, index) => {
      visited.push([value, index]);
    });
    expect(visited).toEqual([
      [child, 0],
      ["text", 1],
    ]);
    expect(Children.only(child)).toBe(child);
    expect(() => Children.only([child, "text"])).toThrow("Expected exactly one child.");
  });

  test("cloneElement preserves explicit undefined props without reapplying defaultProps", () => {
    function Label(props: { label?: string; tone?: string }) {
      return createElement("span", null, `${props.label}:${props.tone}`);
    }

    Label.defaultProps = { label: "default", tone: "neutral" };

    const child = createElement(Label, { label: "custom", tone: undefined });
    const cloned = cloneElement(child, { label: undefined });

    expect(child.props).toEqual({ label: "custom", tone: "neutral" });
    expect(cloned.props).toEqual({ label: undefined, tone: "neutral" });
  });

  test("class component instances preserve state across setState and root renders", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    class Counter {
      props: { label: string };
      state = { count: 0 };
      setState: (partial: { count: number }) => void = () => {
        throw new Error("setState was not installed.");
      };

      constructor(props: { label: string }) {
        this.props = props;
      }

      render() {
        return createElement(
          "button",
          {
            onClick: () => {
              this.setState({ count: this.state.count + 1 });
            },
          },
          `${this.props.label}:${this.state.count}`,
        );
      }
    }

    root.render(createElement(Counter, { label: "A" }));
    container.querySelector("button")?.click();
    root.render(createElement(Counter, { label: "B" }));

    expect(container.textContent).toBe("B:1");
  });

  test("class component getDerivedStateFromProps initializes and updates state before render", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    class Label {
      props: { value: string };
      state = { label: "unset" };

      constructor(props: { value: string }) {
        this.props = props;
      }

      static getDerivedStateFromProps(props: { value: string }) {
        return { label: props.value.toUpperCase() };
      }

      render() {
        return createElement("span", null, this.state.label);
      }
    }

    root.render(createElement(Label, { value: "ada" }));
    expect(container.innerHTML).toBe("<span>ADA</span>");

    root.render(createElement(Label, { value: "grace" }));
    expect(container.innerHTML).toBe("<span>GRACE</span>");
  });

  test("class component setState supports updater functions and callbacks", () => {
    const container = document.createElement("div");
    const callbacks: string[] = [];

    class Counter {
      props: { step: number };
      state = { count: 0 };
      setState: (
        partial: (
          state: { count: number },
          props: { step: number },
        ) => {
          count: number;
        },
        callback?: () => void,
      ) => void = () => {
        throw new Error("setState was not installed.");
      };

      constructor(props: { step: number }) {
        this.props = props;
      }

      render() {
        return createElement(
          "button",
          {
            onClick: () => {
              this.setState(
                (state, props) => ({ count: state.count + props.step }),
                () => {
                  callbacks.push(`done:${this.state.count}`);
                },
              );
            },
          },
          this.state.count,
        );
      }
    }

    createRoot(container).render(createElement(Counter, { step: 2 }));
    container.querySelector("button")?.click();

    expect(container.textContent).toBe("2");
    expect(callbacks).toEqual(["done:2"]);
  });

  test("class component setState callbacks run after update commit lifecycles", () => {
    const container = document.createElement("div");
    const calls: string[] = [];
    let instance: { increment(): void } | undefined;

    class Counter extends Component<Record<string, never>, { count: number }> {
      state = { count: 0 };

      constructor(props: Record<string, never>) {
        super(props);
        instance = this;
      }

      increment() {
        this.setState(
          (state) => ({ count: state.count + 1 }),
          () => calls.push(`callback:${container.innerHTML}`),
        );
      }

      componentDidUpdate() {
        calls.push(`didUpdate:${container.innerHTML}`);
      }

      render() {
        return createElement("span", null, this.state.count);
      }
    }

    render(createElement(Counter, null), container);
    instance?.increment();

    expect(calls).toEqual(["didUpdate:<span>1</span>", "callback:<span>1</span>"]);
  });

  test("React.Component exposes setState and forceUpdate during subclass construction", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let increment: (() => void) | undefined;
    let force: (() => void) | undefined;
    let forceCallbackCount = 0;

    class Counter extends Component<{ label: string }, { count: number; forced: number }> {
      state = { count: 0, forced: 0 };

      constructor(props: { label: string }) {
        super(props);
        increment = this.setState.bind(this, (state) => ({
          count: state.count + 1,
        }));
        const boundForceUpdate = this.forceUpdate.bind(this, () => {
          forceCallbackCount += 1;
        });
        force = () => {
          this.state = { ...this.state, forced: this.state.forced + 1 };
          boundForceUpdate();
        };
      }

      shouldComponentUpdate() {
        return false;
      }

      render() {
        return createElement(
          "span",
          null,
          `${this.props.label}:${this.state.count}:${this.state.forced}`,
        );
      }
    }

    root.render(createElement(Counter, { label: "A" }));
    increment?.();
    force?.();

    expect(container.textContent).toBe("A:1:1");
    expect(forceCallbackCount).toBe(1);
  });

  test("React.Component and PureComponent support ES5 superclass calls", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let increment: (() => void) | undefined;
    let pureIncrement: (() => void) | undefined;
    const renders: string[] = [];

    function Es5Counter(
      this: {
        props: { label: string };
        state: { count: number };
        setState: (partial: { count: number }) => void;
        render: () => unknown;
      },
      props: { label: string },
    ) {
      (Component as unknown as (this: unknown, props: unknown) => void).call(this, props);
      this.state = { count: 0 };
      increment = () => {
        this.setState({ count: this.state.count + 1 });
      };
    }
    Es5Counter.prototype = Object.create(Component.prototype) as {
      render: () => unknown;
    };
    Es5Counter.prototype.constructor = Es5Counter;
    Es5Counter.prototype.render = function render(this: {
      props: { label: string };
      state: { count: number };
    }) {
      renders.push(`component:${this.state.count}`);
      return createElement("span", null, `${this.props.label}:${this.state.count}`);
    };

    function Es5PureCounter(
      this: {
        props: { label: string };
        state: { count: number };
        setState: (partial: { count: number }) => void;
        render: () => unknown;
      },
      props: { label: string },
    ) {
      (PureComponent as unknown as (this: unknown, props: unknown) => void).call(this, props);
      this.state = { count: 0 };
      pureIncrement = () => {
        this.setState({ count: this.state.count });
      };
    }
    Es5PureCounter.prototype = Object.create(PureComponent.prototype) as {
      render: () => unknown;
    };
    Es5PureCounter.prototype.constructor = Es5PureCounter;
    Es5PureCounter.prototype.render = function render(this: {
      props: { label: string };
      state: { count: number };
    }) {
      renders.push(`pure:${this.state.count}`);
      return createElement("span", null, `${this.props.label}:${this.state.count}`);
    };

    root.render(
      createElement(
        "div",
        null,
        // @ts-expect-error Legacy ES5 constructors intentionally lack a TypeScript construct signature.
        createElement(Es5Counter, { label: "count" }),
        // @ts-expect-error Legacy ES5 constructors intentionally lack a TypeScript construct signature.
        createElement(Es5PureCounter, { label: "pure" }),
      ),
    );
    increment?.();
    pureIncrement?.();

    expect(container.textContent).toBe("count:1pure:0");
    expect(renders.filter((entry) => entry.startsWith("pure:"))).toEqual(["pure:0"]);
    expect(renders).toContain("component:1");
  });

  test("constructor-bound setState updates context provider children", () => {
    const StoreContext = createContext({ value: 11 });
    const container = document.createElement("div");
    const root = createRoot(container);
    let switchStore: (() => void) | undefined;

    class Child extends Component {
      render() {
        return createElement(StoreContext.Consumer, null, (store) =>
          createElement("span", null, `store - ${store.value}`),
        );
      }
    }

    class ProviderContainer extends Component<Record<string, never>, { store: { value: number } }> {
      constructor(props: Record<string, never>) {
        super(props);
        this.state = { store: { value: 11 } };
        switchStore = this.setState.bind(this, { store: { value: 20 } });
      }

      render() {
        return createElement(
          StoreContext.Provider,
          { value: this.state.store },
          createElement(Child, null),
        );
      }
    }

    root.render(createElement(ProviderContainer, {}));
    act(() => {
      switchStore?.();
    });

    expect(container.textContent).toBe("store - 20");
  });

  test("context provider updates preserve stable non-consuming children", () => {
    const LocaleContext = createContext("en");
    const container = document.createElement("div");
    const i18n = { locale: "en" };
    let activate: ((locale: string) => void) | undefined;
    let staticRenderCount = 0;
    let dynamicRenderCount = 0;

    function StaticLabel() {
      staticRenderCount += 1;
      return createElement("span", { id: "static" }, i18n.locale);
    }

    function DynamicLabel() {
      dynamicRenderCount += 1;
      const locale = useContext(LocaleContext);
      return createElement("span", { id: "dynamic" }, locale);
    }

    const stableChildren = createElement(
      "section",
      null,
      createElement(StaticLabel, null),
      createElement(DynamicLabel, null),
    );

    function Provider() {
      const [locale, setLocale] = useState(i18n.locale);
      activate = (nextLocale) => {
        i18n.locale = nextLocale;
        setLocale(nextLocale);
      };

      return createElement(LocaleContext.Provider, { value: locale }, stableChildren);
    }

    render(createElement(Provider, null), container);
    act(() => {
      activate?.("cs");
    });

    expect(container.querySelector("#static")?.textContent).toBe("en");
    expect(container.querySelector("#dynamic")?.textContent).toBe("cs");
    expect(staticRenderCount).toBe(1);
    expect(dynamicRenderCount).toBe(2);
  });

  test("context provider updates object consumers under stable children", () => {
    const LocaleContext = createContext<{ locale: string }>({ locale: "en" });
    const container = document.createElement("div");
    const i18n = { locale: "en" };
    let activate: ((locale: string) => void) | undefined;

    function StaticLabel() {
      return createElement("span", { id: "static" }, i18n.locale);
    }

    function DynamicLabel() {
      const context = useContext(LocaleContext);
      return createElement("span", { id: "dynamic" }, context.locale);
    }

    const stableChildren = createElement(
      "section",
      null,
      createElement(StaticLabel, null),
      createElement(DynamicLabel, null),
    );

    function Provider() {
      const [context, setContext] = useState(() => ({ locale: i18n.locale }));
      activate = (nextLocale) => {
        i18n.locale = nextLocale;
        setContext({ locale: nextLocale });
      };

      return createElement(LocaleContext.Provider, { value: context }, stableChildren);
    }

    render(createElement(Provider, null), container);
    act(() => {
      activate?.("cs");
    });

    expect(container.querySelector("#static")?.textContent).toBe("en");
    expect(container.querySelector("#dynamic")?.textContent).toBe("cs");
  });

  test("context provider effect subscriptions update stable object consumers", () => {
    const LocaleContext = createContext<{ i18n: { locale: string } } | null>(null);
    const container = document.createElement("div");
    const listeners = new Set<() => void>();
    const i18n = {
      locale: "en",
      on(event: string, listener: () => void) {
        if (event === "change") {
          listeners.add(listener);
        }

        return () => listeners.delete(listener);
      },
      activate(locale: string) {
        this.locale = locale;
        for (const listener of listeners) {
          listener();
        }
      },
      load() {
        for (const listener of listeners) {
          listener();
        }
      },
    };

    function StaticLabel() {
      return createElement("span", { id: "static" }, i18n.locale);
    }

    function DynamicLabel() {
      const context = useContext(LocaleContext);
      return createElement("span", { id: "dynamic" }, context?.i18n.locale);
    }

    function Provider({ children }: { children?: ReactCompatNode }) {
      const makeContext = useCallback(() => ({ i18n: new Proxy(i18n, {}) }), []);
      const [context, setContext] = useState(makeContext);

      useEffect(() => {
        const updateContext = () => {
          setContext(makeContext());
        };

        return i18n.on("change", updateContext);
      }, [makeContext]);

      return createElement(LocaleContext.Provider, { value: context }, children);
    }

    render(
      createElement(
        Provider,
        null,
        createElement(StaticLabel, null),
        createElement(DynamicLabel, null),
      ),
      container,
    );
    act(() => {
      i18n.activate("cs");
    });

    expect(container.querySelector("#static")?.textContent).toBe("en");
    expect(container.querySelector("#dynamic")?.textContent).toBe("cs");
  });

  test("effect-driven context provider can mount after a null render", () => {
    const LocaleContext = createContext("en");
    const container = document.createElement("div");
    const listeners = new Set<() => void>();
    const i18n = {
      locale: null as string | null,
      on(event: string, listener: () => void) {
        if (event === "change") {
          listeners.add(listener);
        }

        return () => listeners.delete(listener);
      },
      activate(locale: string) {
        this.locale = locale;
        for (const listener of listeners) {
          listener();
        }
      },
      load() {
        for (const listener of listeners) {
          listener();
        }
      },
    };

    function LocaleLabel() {
      const locale = useContext(LocaleContext);
      return createElement("span", { id: "locale" }, locale);
    }

    function Provider({ children: _children }: { children?: unknown }) {
      const latestKnownLocale = useRef<string | null>(i18n.locale);
      const [locale, setLocale] = useState<string | null>(i18n.locale);

      useEffect(() => {
        const updateContext = () => {
          latestKnownLocale.current = i18n.locale;
          setLocale(i18n.locale);
        };
        const unsubscribe = i18n.on("change", updateContext);

        if (latestKnownLocale.current !== i18n.locale) {
          updateContext();
        }

        return unsubscribe;
      }, []);

      if (latestKnownLocale.current === null || locale === null) {
        return null;
      }

      return createElement(
        LocaleContext.Provider,
        { value: locale },
        createElement(LocaleLabel, null),
      );
    }

    render(createElement(Provider, null, createElement(LocaleLabel, null)), container);
    expect(container.textContent).toBe("");

    act(() => {
      i18n.load();
    });
    expect(container.textContent).toBe("");

    act(() => {
      i18n.activate("cs");
    });

    expect(container.querySelector("#locale")?.textContent).toBe("cs");
  });

  test("async act flushes deferred event-priority state updates", async () => {
    const container = document.createElement("div");
    let update: (() => void) | undefined;

    function App() {
      const [label, setLabel] = useState("pending");
      update = () => {
        runWithEventPriority("default", () => {
          setLabel("data");
        });
      };
      return createElement("button", null, label);
    }

    render(createElement(App, null), container);

    await act(async () => {
      update?.();
      await Promise.resolve();
    });

    expect(container.textContent).toBe("data");
  });

  test("constructor-bound setState updates memoized context provider value", () => {
    const StoreContext = createContext({ store: { value: 11 } });
    const container = document.createElement("div");
    const root = createRoot(container);
    let switchStore: (() => void) | undefined;

    function Provider(props: { store: { value: number }; children?: ReactCompatNode }) {
      const contextValue = useMemo(() => ({ store: props.store }), [props.store]);

      return createElement(StoreContext.Provider, { value: contextValue }, props.children);
    }

    class Child extends Component {
      render() {
        return createElement(StoreContext.Consumer, null, (contextValue) =>
          createElement("span", null, `store - ${contextValue.store.value}`),
        );
      }
    }

    class ProviderContainer extends Component<Record<string, never>, { store: { value: number } }> {
      constructor(props: Record<string, never>) {
        super(props);
        this.state = { store: { value: 11 } };
        switchStore = this.setState.bind(this, { store: { value: 20 } });
      }

      render() {
        return createElement(Provider, { store: this.state.store }, createElement(Child, null));
      }
    }

    root.render(createElement(ProviderContainer, {}));
    act(() => {
      switchStore?.();
    });

    expect(container.textContent).toBe("store - 20");
  });

  test("constructor-bound setState updates provider value with layout subscription effect", () => {
    const StoreContext = createContext({ store: { getState: () => 11 } });
    const container = document.createElement("div");
    const root = createRoot(container);
    let switchStore: (() => void) | undefined;

    function createStore(value: number) {
      return {
        getState: () => value,
        subscribe: () => () => undefined,
      };
    }

    function Provider(props: {
      store: { getState: () => number; subscribe: () => () => void };
      children?: ReactCompatNode;
    }) {
      const contextValue = useMemo(() => ({ store: props.store }), [props.store]);
      const previousState = useMemo(() => props.store.getState(), [props.store]);

      useLayoutEffect(() => {
        const unsubscribe = props.store.subscribe();
        if (previousState !== props.store.getState()) {
          props.store.getState();
        }
        return unsubscribe;
      }, [contextValue, previousState]);

      return createElement(StoreContext.Provider, { value: contextValue }, props.children);
    }

    class Child extends Component {
      render() {
        return createElement(StoreContext.Consumer, null, (contextValue) =>
          createElement("span", null, `store - ${contextValue.store.getState()}`),
        );
      }
    }

    class ProviderContainer extends Component<
      Record<string, never>,
      { store: { getState: () => number; subscribe: () => () => void } }
    > {
      constructor(props: Record<string, never>) {
        super(props);
        this.state = { store: createStore(11) };
        switchStore = this.setState.bind(this, { store: createStore(20) });
      }

      render() {
        return createElement(Provider, { store: this.state.store }, createElement(Child, null));
      }
    }

    root.render(createElement(ProviderContainer, {}));
    act(() => {
      switchStore?.();
    });

    expect(container.textContent).toBe("store - 20");
  });

  test("constructor-bound setState works when React and renderer load separate compat modules", async () => {
    // @ts-expect-error The query creates an intentionally separate module instance in Vite.
    const duplicateReact = await import("../src/index.js?constructor-copy");
    const StoreContext = createContext({ value: 11 });
    const container = document.createElement("div");
    const root = createRoot(container);
    let switchStore: (() => void) | undefined;

    class ProviderContainer extends duplicateReact.Component<
      Record<string, never>,
      { store: { value: number } }
    > {
      constructor(props: Record<string, never>) {
        super(props);
        this.state = { store: { value: 11 } };
        switchStore = this.setState.bind(this, { store: { value: 20 } });
      }

      render() {
        return createElement(
          StoreContext.Provider,
          { value: this.state.store },
          createElement(StoreContext.Consumer, null, (store) =>
            createElement("span", null, `store - ${store.value}`),
          ),
        );
      }
    }

    root.render(createElement(ProviderContainer, {}));
    act(() => {
      switchStore?.();
    });

    expect(container.textContent).toBe("store - 20");
  });

  test("class component lifecycle methods run on mount, update, and unmount", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const calls: string[] = [];

    class Counter {
      props: { label: string };
      state = { count: 0 };
      setState: (partial: { count: number }) => void = () => {
        throw new Error("setState was not installed.");
      };

      constructor(props: { label: string }) {
        this.props = props;
      }

      componentDidMount() {
        calls.push(`mount:${this.props.label}:${this.state.count}`);
      }

      componentDidUpdate(previousProps: { label: string }, previousState: { count: number }) {
        calls.push(
          `update:${previousProps.label}:${previousState.count}->${this.props.label}:${this.state.count}`,
        );
      }

      componentWillUnmount() {
        calls.push(`unmount:${this.props.label}:${this.state.count}`);
      }

      render() {
        return createElement(
          "button",
          {
            onClick: () => {
              this.setState({ count: this.state.count + 1 });
            },
          },
          `${this.props.label}:${this.state.count}`,
        );
      }
    }

    root.render(createElement(Counter, { label: "A" }));
    container.querySelector("button")?.click();
    root.render(createElement(Counter, { label: "B" }));
    root.unmount();

    expect(calls).toEqual(["mount:A:0", "update:A:0->A:1", "update:A:1->B:1", "unmount:B:1"]);
  });

  test("class component shouldComponentUpdate can skip render and update lifecycle", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const calls: string[] = [];

    class Label {
      props: { value: string; version: number };

      constructor(props: { value: string; version: number }) {
        this.props = props;
      }

      shouldComponentUpdate(nextProps: { value: string; version: number }) {
        calls.push(`should:${this.props.version}->${nextProps.version}`);
        return nextProps.version !== this.props.version;
      }

      componentDidUpdate() {
        calls.push("update");
      }

      render() {
        calls.push(`render:${this.props.value}`);
        return createElement("span", null, this.props.value);
      }
    }

    root.render(createElement(Label, { value: "A", version: 1 }));
    root.render(createElement(Label, { value: "B", version: 1 }));
    root.render(createElement(Label, { value: "C", version: 2 }));

    expect(container.innerHTML).toBe("<span>C</span>");
    expect(calls).toEqual(["render:A", "should:1->1", "should:1->2", "render:C", "update"]);
  });

  test("class component forceUpdate bypasses shouldComponentUpdate", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const calls: string[] = [];
    let force: (() => void) | undefined;

    class Label {
      props: { value: string };
      forceUpdate: (callback?: () => void) => void = () => {
        throw new Error("forceUpdate was not installed.");
      };

      constructor(props: { value: string }) {
        this.props = props;
      }

      shouldComponentUpdate() {
        calls.push("should");
        return false;
      }

      render() {
        calls.push(`render:${this.props.value}`);
        force = () => {
          this.forceUpdate(() => {
            calls.push("forced");
          });
        };
        return createElement("span", null, this.props.value);
      }
    }

    root.render(createElement(Label, { value: "A" }));
    root.render(createElement(Label, { value: "B" }));
    force?.();

    expect(container.innerHTML).toBe("<span>B</span>");
    expect(calls).toEqual(["render:A", "should", "render:B", "forced"]);
  });

  test("class component passes getSnapshotBeforeUpdate result to componentDidUpdate", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const calls: string[] = [];

    class Label {
      props: { value: string };

      constructor(props: { value: string }) {
        this.props = props;
      }

      getSnapshotBeforeUpdate(previousProps: { value: string }) {
        calls.push(`snapshot:${previousProps.value}->${this.props.value}`);
        return `${previousProps.value}:${this.props.value}`;
      }

      componentDidUpdate(
        previousProps: { value: string },
        _previousState: Record<string, unknown>,
        snapshot: string,
      ) {
        calls.push(`update:${previousProps.value}:${snapshot}`);
      }

      render() {
        return createElement("span", null, this.props.value);
      }
    }

    root.render(createElement(Label, { value: "A" }));
    root.render(createElement(Label, { value: "B" }));

    expect(calls).toEqual(["snapshot:A->B", "update:A:A:B"]);
  });

  test("useEffectEvent keeps a stable callback that reads latest state", () => {
    const container = document.createElement("div");
    const callbacks: unknown[] = [];

    function App() {
      const [count, setCount] = useState(0);
      const onClick = useEffectEvent(() => {
        setCount((value) => value + 1);
      });
      callbacks.push(onClick);
      return createElement("button", { onClick }, count);
    }

    render(createElement(App, null), container);
    container.querySelector("button")?.click();
    container.querySelector("button")?.click();

    expect(container.textContent).toBe("2");
    expect(callbacks[1]).toBe(callbacks[0]);
    expect(callbacks[2]).toBe(callbacks[0]);
  });

  test("use unwraps fulfilled thenables during render", () => {
    const container = document.createElement("div");
    const fulfilled = Promise.resolve("ready") as Promise<string> & {
      status: "fulfilled";
      value: string;
    };
    fulfilled.status = "fulfilled";
    fulfilled.value = "ready";

    function App() {
      return createElement("p", null, use(fulfilled));
    }

    render(createElement(App, null), container);

    expect(container.innerHTML).toBe("<p>ready</p>");
  });

  test("cache and cacheSignal match React client behavior outside server cache scopes", () => {
    const container = document.createElement("div");
    let calls = 0;
    const read = cache((value: string) => {
      calls += 1;
      return `${value}:${calls}`;
    });
    let refreshResult: unknown = "unset";

    function App() {
      const refresh = unstable_useCacheRefresh();
      refreshResult = refresh();
      return createElement("p", null, "cache");
    }

    expect(read("A")).toBe("A:1");
    expect(read("A")).toBe("A:2");
    expect(cacheSignal()).toBeNull();
    expect(captureOwnerStack()).toBeNull();

    render(createElement(App, null), container);

    expect(refreshResult).toBeUndefined();
  });

  test("cache memoizes by argument identity inside a server cache scope", () => {
    const scope = createCacheScope();
    let calls = 0;
    const read = cache((prefix: string, input: { id: string }) => {
      calls += 1;
      return `${prefix}:${input.id}:${calls}`;
    });
    const objectArg = { id: "A" };

    const values = runWithCacheScope(scope, () => [
      read("item", objectArg),
      read("item", objectArg),
      read("item", { id: "A" }),
    ]);

    expect(values).toEqual(["item:A:1", "item:A:1", "item:A:2"]);
  });

  test("cacheSignal is scoped and aborts when the server cache scope is refreshed", () => {
    const scope = createCacheScope();
    let scopedSignal: AbortSignal | null = null;

    expect(cacheSignal()).toBeNull();

    runWithCacheScope(scope, () => {
      scopedSignal = cacheSignal();
    });

    expect(scopedSignal).toBeInstanceOf(AbortSignal);
    expect(scopedSignal?.aborted).toBe(false);

    refreshCacheScope(scope);

    expect(scopedSignal?.aborted).toBe(true);
  });

  test("runWithCacheScope keeps concurrent async scopes isolated", async () => {
    const scopeA = createCacheScope();
    const scopeB = createCacheScope();
    const aStarted = createDeferred<void>();
    const releaseA = createDeferred<void>();
    const bStarted = createDeferred<void>();
    const releaseB = createDeferred<void>();

    const a = runWithCacheScope(scopeA, async () => {
      aStarted.resolve();
      await releaseA.promise;
      return cacheSignal();
    });
    await aStarted.promise;

    const b = runWithCacheScope(scopeB, async () => {
      bStarted.resolve();
      await releaseB.promise;
      return cacheSignal();
    });
    await bStarted.promise;

    releaseA.resolve();
    await expect(a).resolves.toBe(scopeA.controller.signal);

    releaseB.resolve();
    await expect(b).resolves.toBe(scopeB.controller.signal);
  });

  test("runWithCacheScope fails closed for concurrent async scopes without AsyncLocalStorage", async () => {
    const scopeA = createCacheScope();
    const scopeB = createCacheScope();
    const releaseA = createDeferred<void>();

    __setCacheScopeStorageForTesting(undefined);
    try {
      const a = runWithCacheScope(scopeA, async () => {
        await releaseA.promise;
        return cacheSignal();
      });

      expect(() => runWithCacheScope(scopeB, () => cacheSignal())).toThrow(
        /requires AsyncLocalStorage/,
      );

      releaseA.resolve();
      await expect(a).resolves.toBe(scopeA.controller.signal);
    } finally {
      __setCacheScopeStorageForTesting(createNodeAsyncLocalStorage());
    }
  });

  test("useActionState applies multiple dispatches to the latest queued state", () => {
    const container = document.createElement("div");

    function App() {
      const [state, dispatch] = useActionState(
        (previous: string, next: string) => `${previous}-${next}`,
        "A",
      );
      return createElement(
        "button",
        {
          onClick: () => {
            dispatch("B");
            dispatch("C");
          },
        },
        state,
      );
    }

    render(createElement(App, null), container);
    container.querySelector("button")?.click();

    expect(container.textContent).toBe("A-B-C");
  });

  test("useActionState reports pending state and throws async rejections to error boundaries", async () => {
    const container = document.createElement("div");
    let resolveAction: ((value: string) => void) | undefined;
    let rejectAction: ((error: Error) => void) | undefined;

    function App(props: { reject?: boolean }) {
      const [state, dispatch, pending] = useActionState(
        (previous: string, next: string) =>
          new Promise<string>((resolve, reject) => {
            resolveAction = resolve;
            rejectAction = reject;
          }).then(() => `${previous}-${next}`),
        "A",
      );

      return createElement(
        "button",
        {
          onClick: () => {
            dispatch(props.reject === true ? "ERR" : "B");
          },
        },
        `${state}:${pending}`,
      );
    }

    const root = createRoot(container);
    root.render(createElement(App, null));
    container.querySelector("button")?.click();
    expect(container.textContent).toBe("A:true");

    resolveAction?.("ok");
    await Promise.resolve();
    await Promise.resolve();
    expect(container.textContent).toBe("A-B:false");

    root.render(
      createErrorBoundary(
        { fallback: (error) => createElement("strong", null, error.message) },
        createElement(App, { reject: true }),
      ),
    );
    container.querySelector("button")?.click();
    rejectAction?.(new Error("action failed"));
    await Promise.resolve();
    await Promise.resolve();

    expect(container.innerHTML).toBe("<strong>action failed</strong>");
  });

  test("useOptimistic supports replacement updates and resets when the base state commits", () => {
    const container = document.createElement("div");

    function App() {
      const [base, setBase] = useState("A");
      const [optimistic, setOptimistic] = useOptimistic<string, string>(base);

      return createElement(
        "section",
        null,
        createElement(
          "button",
          { id: "optimistic", onClick: () => setOptimistic("B") },
          optimistic,
        ),
        createElement("button", { id: "base", onClick: () => setBase("C") }, base),
      );
    }

    render(createElement(App, null), container);
    container
      .querySelector("#optimistic")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(container.querySelector("#optimistic")?.textContent).toBe("B");

    container
      .querySelector("#base")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(container.querySelector("#optimistic")?.textContent).toBe("C");
    expect(container.querySelector("#base")?.textContent).toBe("C");
  });

  test("Activity and Profiler render children on the client", () => {
    const container = document.createElement("div");

    render(
      createElement(
        Profiler,
        { id: "profile", onRender: () => undefined },
        createElement(Activity, { mode: "visible" }, createElement("span", null, "Visible")),
      ),
      container,
    );

    expect(container.innerHTML).toBe("<span>Visible</span>");
  });

  test("Activity hidden mode omits children on the client", () => {
    const container = document.createElement("div");

    render(
      createElement(Activity, { mode: "hidden" }, createElement("span", null, "Hidden")),
      container,
    );

    expect(container.innerHTML).toBe("");
  });

  test("Profiler calls onRender after committed mount and update", () => {
    const container = document.createElement("div");
    const calls: Array<{
      id: string;
      phase: string;
      actualDuration: number;
      baseDuration: number;
      startTime: number;
      commitTime: number;
      text: string | null;
    }> = [];

    function Counter() {
      const [count, setCount] = useState(0);
      return createElement("button", { onClick: () => setCount((value) => value + 1) }, count);
    }

    render(
      createElement(
        Profiler,
        {
          id: "counter",
          onRender(
            id: string,
            phase: string,
            actualDuration: number,
            baseDuration: number,
            startTime: number,
            commitTime: number,
          ) {
            calls.push({
              id,
              phase,
              actualDuration,
              baseDuration,
              startTime,
              commitTime,
              text: container.textContent,
            });
          },
        },
        createElement(Counter, null),
      ),
      container,
    );
    container.querySelector("button")?.click();

    expect(calls).toHaveLength(2);
    expect(calls.map((call) => [call.id, call.phase, call.text])).toEqual([
      ["counter", "mount", "0"],
      ["counter", "update", "1"],
    ]);
    for (const call of calls) {
      expect(call.actualDuration).toBeGreaterThanOrEqual(0);
      expect(call.baseDuration).toBeGreaterThanOrEqual(call.actualDuration);
      expect(call.commitTime).toBeGreaterThanOrEqual(call.startTime);
    }
  });

  test("Profiler reports nested-update for updates scheduled during layout effects", () => {
    const container = document.createElement("div");
    const phases: string[] = [];

    function App() {
      const [ready, setReady] = useState(false);
      useLayoutEffect(() => {
        if (!ready) {
          setReady(true);
        }
      }, [ready]);
      return createElement("p", null, ready ? "ready" : "pending");
    }

    render(
      createElement(
        Profiler,
        {
          id: "layout",
          onRender(_id: string, phase: string) {
            phases.push(phase);
          },
        },
        createElement(App, null),
      ),
      container,
    );

    expect(container.textContent).toBe("ready");
    expect(phases).toEqual(["mount", "nested-update"]);
  });

  test("useDebugValue stores formatted debug values for DevTools", () => {
    const container = document.createElement("div");
    const values: unknown[] = [];
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      inject: vi.fn(() => 99),
      onCommitFiberRoot: vi.fn(),
      onCommitFiberUnmount: vi.fn(),
    };

    function App() {
      useDebugValue("ready", (value) => `status:${value}`);
      return createElement("p", null, "debug");
    }

    try {
      render(createElement(App, null), container);

      const fiberRoot = getFiberRootForContainer(container);
      const appState = fiberRoot?.current.child?.memoizedState as
        | { hooks?: Array<{ kind?: string; value?: unknown }> }
        | undefined;
      values.push(...(appState?.hooks ?? []));
    } finally {
      delete globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    }

    expect(values).toEqual([
      {
        kind: "debug",
        value: "status:ready",
      },
    ]);
  });
});

function createDeferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => {};
  let reject: (reason?: unknown) => void = () => {};
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, reject, resolve };
}

function createNodeAsyncLocalStorage() {
  const { AsyncLocalStorage } = process.getBuiltinModule(
    "node:async_hooks",
  ) as typeof import("node:async_hooks");
  return new AsyncLocalStorage<CacheScope>();
}
