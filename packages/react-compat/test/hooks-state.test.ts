// @vitest-environment happy-dom

import { afterEach, describe, expect, test, vi } from "vitest";
import {
  Children,
  cloneElement,
  createElement,
  createRoot,
  forwardRef,
  isValidElement,
  render,
  StrictMode,
  useReducer,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "../src/index.js";
import { getFiberRootForContainer } from "../src/fiber-work-loop.js";
import type { Fiber } from "../src/fiber.js";
import {
  forceFrameRate,
  setSchedulerHostForTesting,
  type SchedulerHost,
} from "../src/fiber-scheduler.js";
import { __getStrictMemoOwnerKeyForTesting } from "../src/hooks.js";

interface TestSchedulerHost extends SchedulerHost {
  flushOneHostCallback(): void;
}

function createTestSchedulerHost(): TestSchedulerHost {
  const callbacks: (() => void)[] = [];
  return {
    now: () => 0,
    scheduleHostCallback(callback) {
      callbacks.push(callback);
      return callback;
    },
    scheduleHostTimeout(callback) {
      callbacks.push(callback);
      return callback;
    },
    cancelHostTimeout() {},
    flushOneHostCallback() {
      callbacks.shift()?.();
    },
  };
}

afterEach(() => {
  setSchedulerHostForTesting(undefined);
  forceFrameRate(0);
});

describe("react-compat useState", () => {
  test("updates state and re-renders synchronously", () => {
    const container = document.createElement("div");

    function Counter() {
      const [count, setCount] = useState(0);
      return createElement(
        "button",
        { onClick: () => setCount(count + 1) },
        count,
      );
    }

    createRoot(container).render(createElement(Counter, null));

    const button = container.querySelector("button");
    expect(button?.textContent).toBe("0");

    button?.click();
    expect(container.querySelector("button")?.textContent).toBe("1");
  });

  test("updates compiler-proven direct text bindings without re-rendering the component", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const container = document.createElement("div");
    const reactiveTextBindingMeta = Symbol.for("modular.react.reactive_text_binding_meta");
    let renders = 0;
    let update: (value: number) => void = () => {};

    function Counter() {
      renders += 1;
      const state = useState(0) as unknown as [
        number,
        (value: number) => void,
      ] & Record<PropertyKey, unknown>;
      expect(state).toHaveLength(2);
      const [count, setCount] = state;
      const textBinding = state[reactiveTextBindingMeta];
      update = setCount;
      return createElement("p", { [reactiveTextBindingMeta]: textBinding }, count);
    }

    try {
      createRoot(container).render(createElement(Counter, null));

      expect(container.innerHTML).toBe("<p>0</p>");
      expect(renders).toBe(1);

      update(1);

      expect(container.innerHTML).toBe("<p>1</p>");
      expect(renders).toBe(1);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  test("batches discrete event updates and flushes once after the handler", () => {
    const container = document.createElement("div");
    let renders = 0;
    let textDuringHandler = "";

    function Counter() {
      renders += 1;
      const [count, setCount] = useState(0);
      return createElement(
        "button",
        {
          onClick: () => {
            setCount((value) => value + 1);
            setCount((value) => value + 1);
            textDuringHandler = container.textContent ?? "";
          },
        },
        count,
      );
    }

    createRoot(container).render(createElement(Counter, null));
    container.querySelector("button")?.click();

    expect(textDuringHandler).toBe("0");
    expect(container.querySelector("button")?.textContent).toBe("2");
    expect(renders).toBe(2);
  });

  test("automatically batches updates from timers", async () => {
    const container = document.createElement("div");
    let renders = 0;
    let trigger: () => void = () => {};

    function Counter() {
      renders += 1;
      const [count, setCount] = useState(0);
      trigger = () => {
        setTimeout(() => {
          setCount((value) => value + 1);
          setCount((value) => value + 1);
        }, 0);
      };
      return createElement("p", null, count);
    }

    createRoot(container).render(createElement(Counter, null));
    trigger();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();

    expect(container.innerHTML).toBe("<p>2</p>");
    expect(renders).toBe(2);
  });

  test("render-phase state updates restart before commit", () => {
    const container = document.createElement("div");

    function Derived(props: { value: number }) {
      const [derived, setDerived] = useState(2);
      if (props.value > derived) {
        setDerived(props.value);
      }
      return createElement("p", null, derived);
    }

    createRoot(container).render(createElement(Derived, { value: 10 }));

    expect(container.innerHTML).toBe("<p>10</p>");
  });

  test("passive effect cleanup runs for all slots before setup", async () => {
    const container = document.createElement("div");
    const order: string[] = [];
    let setValue: (value: number) => void = () => {};

    function Item(props: { label: string; value: number }) {
      useEffect(() => {
        order.push(`setup:${props.label}:${props.value}`);
        return () => order.push(`cleanup:${props.label}:${props.value}`);
      }, [props.value]);
      return createElement("span", null, props.label);
    }

    function App() {
      const [value, update] = useState(0);
      setValue = update;
      return createElement(
        "div",
        null,
        createElement(Item, { label: "A", value }),
        createElement(Item, { label: "B", value }),
      );
    }

    createRoot(container).render(createElement(App, null));
    order.length = 0;
    setValue(1);
    await Promise.resolve();

    expect(order).toEqual([
      "cleanup:A:0",
      "cleanup:B:0",
      "setup:A:1",
      "setup:B:1",
    ]);
  });

  test("layout effect cleanup runs for all slots before setup", () => {
    const container = document.createElement("div");
    const order: string[] = [];
    let setValue: (value: number) => void = () => {};

    function Item(props: { label: string; value: number }) {
      useLayoutEffect(() => {
        order.push(`setup:${props.label}:${props.value}`);
        return () => order.push(`cleanup:${props.label}:${props.value}`);
      }, [props.value]);
      return createElement("span", null, props.label);
    }

    function App() {
      const [value, update] = useState(0);
      setValue = update;
      return createElement(
        "div",
        null,
        createElement(Item, { label: "A", value }),
        createElement(Item, { label: "B", value }),
      );
    }

    createRoot(container).render(createElement(App, null));
    order.length = 0;
    setValue(1);

    expect(order).toEqual([
      "cleanup:A:0",
      "cleanup:B:0",
      "setup:A:1",
      "setup:B:1",
    ]);
  });

  test("defers state updates from ref callbacks until after host commit", () => {
    const container = document.createElement("div");

    function RefObserver() {
      const [node, setNode] = useState<HTMLButtonElement | null>(null);
      return createElement(
        "div",
        null,
        createElement("button", { ref: setNode }, "Open"),
        node === null ? null : createElement("span", null, "Ready"),
      );
    }

    createRoot(container).render(createElement(RefObserver, null));

    expect(container.textContent).toBe("OpenReady");
  });

  test("does not publish stale root current after ref callback rerenders", () => {
    const container = document.createElement("div");

    function RefObserver() {
      const [node, setNode] = useState<HTMLButtonElement | null>(null);
      return createElement(
        "div",
        null,
        createElement("button", { ref: setNode }, "Open"),
        node === null ? null : createElement("span", null, "Ready"),
      );
    }

    createRoot(container).render(createElement(RefObserver, null));
    const fiberRoot = getFiberRootForContainer(container);

    expect(container.textContent).toBe("OpenReady");
    expect(collectFiberText(fiberRoot?.current.child)).toBe("OpenReady");
  });

  test("does not rerender when changed ref callbacks restore the same node during commit", () => {
    const container = document.createElement("div");
    let renders = 0;

    function RefObserver() {
      renders += 1;
      const [node, setNode] = useState<HTMLButtonElement | null>(null);
      return createElement(
        "button",
        { ref: (nextNode: HTMLButtonElement | null) => setNode(nextNode) },
        node === null ? "Missing" : "Ready",
      );
    }

    createRoot(container).render(createElement(RefObserver, null));

    expect(container.textContent).toBe("Ready");
    expect(renders).toBe(2);
  });

  test("settles nested cloned refs that update state during host commit", () => {
    const container = document.createElement("div");
    const hostNodes: Element[] = [];

    function composeRefs<T>(...refs: unknown[]) {
      return (node: T | null) => {
        for (const ref of refs) {
          if (typeof ref === "function") {
            ref(node);
          } else if (typeof ref === "object" && ref !== null && "current" in ref) {
            (ref as { current: T | null }).current = node;
          }
        }
      };
    }

    const Slot = forwardRef<{ children?: unknown }, HTMLElement>((props, forwardedRef) => {
      const child = Children.only(props.children as never);

      if (!isValidElement(child)) {
        return null;
      }

      return cloneElement(child, {
        ref: composeRefs(forwardedRef, child.ref),
      });
    });

    const Layer = forwardRef<{ children?: unknown }, HTMLDivElement>((props, forwardedRef) => {
      const [node, setNode] = useState<HTMLDivElement | null>(null);
      const localRef = useCallback((nextNode: HTMLDivElement | null) => {
        if (nextNode !== null) {
          hostNodes.push(nextNode);
        }
        setNode(nextNode);
      }, []);

      return createElement(
        "div",
        { ref: composeRefs(forwardedRef, localRef) },
        node === null ? null : props.children,
      );
    });

    function PresenceLike(props: { present: boolean; children?: unknown }) {
      const [node, setNode] = useState<HTMLElement | null>(null);
      const child = Children.only(props.children as never);
      const ref = useCallback((nextNode: HTMLElement | null) => {
        setNode(nextNode);
      }, []);

      if (!props.present && node === null) {
        return null;
      }

      if (!isValidElement(child)) {
        return null;
      }

      return cloneElement(child, { ref });
    }

    function App() {
      const [open, setOpen] = useState(false);
      const outerRef = useRef<HTMLDivElement | null>(null);

      return createElement(
        "section",
        null,
        createElement("button", { onClick: () => setOpen(true) }, "Open"),
        createElement(
          PresenceLike,
          { present: open },
          createElement(
            Slot,
            { ref: outerRef },
            createElement(Layer, null, createElement("span", null, "Close")),
          ),
        ),
      );
    }

    createRoot(container).render(createElement(App, null));
    container.querySelector("button")?.click();

    expect(container.textContent).toBe("OpenClose");
    expect(new Set(hostNodes).size).toBe(1);
  });

  test("schedules continuous event updates on the scheduler host", async () => {
    const host = createTestSchedulerHost();
    setSchedulerHostForTesting(host);
    const container = document.createElement("div");

    function Tracker() {
      const [count, setCount] = useState(0);
      return createElement(
        "button",
        { onMouseMove: () => setCount((value) => value + 1) },
        count,
      );
    }

    createRoot(container).render(createElement(Tracker, null));
    container.querySelector("button")?.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true }),
    );

    expect(container.querySelector("button")?.textContent).toBe("0");
    await Promise.resolve();
    expect(container.querySelector("button")?.textContent).toBe("0");
    host.flushOneHostCallback();
    expect(container.querySelector("button")?.textContent).toBe("1");
  });

  test("supports updater functions", () => {
    const container = document.createElement("div");

    function Counter() {
      const [count, setCount] = useState(0);
      return createElement(
        "button",
        { onClick: () => setCount((value) => value + 1) },
        count,
      );
    }

    createRoot(container).render(createElement(Counter, null));
    container.querySelector("button")?.click();
    container.querySelector("button")?.click();

    expect(container.querySelector("button")?.textContent).toBe("2");
  });

  test("useReducer dispatches actions and preserves dispatch identity", () => {
    const container = document.createElement("div");
    const dispatches: unknown[] = [];

    function reducer(state: number, action: { type: "add"; value: number }) {
      return action.type === "add" ? state + action.value : state;
    }

    function Counter() {
      const [count, dispatch] = useReducer(reducer, 1, (value) => value + 1);
      dispatches.push(dispatch);
      return createElement(
        "button",
        { onClick: () => dispatch({ type: "add", value: 2 }) },
        count,
      );
    }

    createRoot(container).render(createElement(Counter, null));
    container.querySelector("button")?.click();
    container.querySelector("button")?.click();

    expect(container.querySelector("button")?.textContent).toBe("6");
    expect(dispatches[0]).toBe(dispatches[1]);
    expect(dispatches[1]).toBe(dispatches[2]);
  });

  test("useReducer dispatch updates synchronously outside event handlers", () => {
    const container = document.createElement("div");
    let dispatch: (action: { type: "add"; value: number }) => void = () => {};

    function reducer(state: number, action: { type: "add"; value: number }) {
      return action.type === "add" ? state + action.value : state;
    }

    function Counter() {
      const [count, innerDispatch] = useReducer(reducer, 0);
      dispatch = innerDispatch;
      return createElement("span", null, count);
    }

    createRoot(container).render(createElement(Counter, null));

    dispatch({ type: "add", value: 1 });

    expect(container.innerHTML).toBe("<span>1</span>");
  });

  test("evaluates lazy initializer once", () => {
    const container = document.createElement("div");
    const initializer = vi.fn(() => 0);

    function Counter() {
      const [count, setCount] = useState(initializer);
      return createElement("button", { onClick: () => setCount(1) }, count);
    }

    createRoot(container).render(createElement(Counter, null));
    container.querySelector("button")?.click();

    expect(initializer).toHaveBeenCalledTimes(1);
    expect(container.querySelector("button")?.textContent).toBe("1");
  });

  test("legacy render preserves hook state for the same container", () => {
    const container = document.createElement("div");

    function Counter(props: { label: string }) {
      const [count, setCount] = useState(0);
      return createElement(
        "button",
        { onClick: () => setCount((value) => value + 1) },
        `${props.label}:${count}`,
      );
    }

    render(createElement(Counter, { label: "A" }), container);
    container.querySelector("button")?.click();
    render(createElement(Counter, { label: "B" }), container);

    expect(container.textContent).toBe("B:1");
  });

  test("resets hook state when a different function component takes the same tree position", () => {
    const container = document.createElement("div");

    function PreviousSubscription() {
      useMemo(() => ({ subscribe: () => () => {} }), []);
      return null;
    }

    function CurrentSubscription() {
      const subscription = useMemo(
        () => ({ initialValueFn: () => "ready" }),
        [],
      );
      const [value] = useState(() => subscription.initialValueFn());
      return createElement("span", null, value);
    }

    function App(props: { current: boolean }) {
      return props.current
        ? createElement(CurrentSubscription, null)
        : createElement(PreviousSubscription, null);
    }

    const root = createRoot(container);
    root.render(createElement(App, { current: false }));
    root.render(createElement(App, { current: true }));

    expect(container.innerHTML).toBe("<span>ready</span>");
  });

  test("keeps StrictMode memo replay aligned across subscription-like siblings", () => {
    const container = document.createElement("div");

    function SetupPlugin() {
      useMemo(() => ({ subscribe: () => () => {} }), []);
      return null;
    }

    function SubscriptionReader() {
      const subscription = useMemo(
        () => ({ initialValueFn: () => "ready" }),
        [],
      );
      const [value] = useState(() => subscription.initialValueFn());
      return createElement("span", null, value);
    }

    createRoot(container).render(
      createElement(
        StrictMode,
        null,
        createElement(SetupPlugin, null),
        createElement(SubscriptionReader, null),
      ),
    );

    expect(container.innerHTML).toBe("<span>ready</span>");
  });

  test("derives StrictMode memo replay keys for primitive owners without retaining them", () => {
    expect(__getStrictMemoOwnerKeyForTesting(undefined)).toBe("p:undefined:undefined");
    expect(__getStrictMemoOwnerKeyForTesting("route:1")).toBe("p:string:route:1");
    expect(__getStrictMemoOwnerKeyForTesting(1)).toBe("p:number:1");
    expect(__getStrictMemoOwnerKeyForTesting(1)).toBe("p:number:1");
  });

  test("throws when called outside render", () => {
    expect(() => useState(0)).toThrow(
      "Hooks can only be called while rendering.",
    );
  });

  test("preserves component hook state by key when list order changes", () => {
    const container = document.createElement("div");
    let items = ["A", "B"];

    function Item(props: { label: string }) {
      const [count, setCount] = useState(0);
      return createElement(
        "button",
        { onClick: () => setCount((value) => value + 1) },
        `${props.label}:${count}`,
      );
    }

    function App() {
      return createElement(
        "div",
        null,
        items.map((label) => createElement(Item, { key: label, label })),
      );
    }

    const root = createRoot(container);
    root.render(createElement(App, null));
    container.querySelector("button")?.click();

    expect(container.textContent).toBe("A:1B:0");

    items = ["B", "A"];
    root.render(createElement(App, null));

    expect(container.textContent).toBe("B:0A:1");
  });
});

function collectFiberText(fiber: Fiber | undefined): string {
  let text = "";
  let cursor = fiber;

  while (cursor !== undefined) {
    if (cursor.tag === "host-text") {
      text += String(cursor.pendingProps);
    }
    text += collectFiberText(cursor.child);
    cursor = cursor.sibling;
  }

  return text;
}
