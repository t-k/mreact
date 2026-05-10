// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import {
  Children,
  cloneElement,
  createContext,
  createElement,
  createRoot,
  forwardRef,
  flushSync,
  hydrateRoot,
  isValidElement,
  lazy,
  memo,
  render,
  renderToString,
  StrictMode,
  useEffect,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useState,
  useSyncExternalStore,
} from "../src/index.js";

describe("react-compat common API subset", () => {
  test("forwardRef passes ref as second argument", () => {
    const container = document.createElement("div");
    const ref = { current: null as HTMLButtonElement | null };
    const Button = forwardRef<{ label: string }, HTMLButtonElement>(
      (props, forwardedRef) =>
        createElement("button", { ref: forwardedRef }, props.label),
    );

    render(createElement(Button, { label: "Save", ref }), container);

    expect(container.innerHTML).toBe("<button>Save</button>");
    expect(ref.current).toBe(container.querySelector("button"));
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

  test("memo renders the wrapped component", () => {
    const container = document.createElement("div");
    const Label = memo((props: { value: string }) =>
      createElement("span", null, props.value),
    );

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

  test("lazy renders fallback first and resolved component after promise resolves", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let resolveModule: (module: { default: (props: { value: string }) => unknown }) => void =
      () => {};
    const LazyLabel = lazy(
      () =>
        new Promise<{ default: (props: { value: string }) => unknown }>(
          (resolve) => {
            resolveModule = resolve;
          },
        ),
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
        createElement(Theme.Consumer, null, (value: string) =>
          createElement("p", null, value),
        ),
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

  test("StrictMode double invokes render without double committing effects", () => {
    const container = document.createElement("div");
    const calls: string[] = [];

    function App() {
      calls.push("render");
      useEffect(() => {
        calls.push("effect");
      }, []);
      return createElement("p", null, "strict");
    }

    render(createElement(StrictMode, null, createElement(App, null)), container);

    expect(container.innerHTML).toBe("<p>strict</p>");
    expect(calls).toEqual(["render", "render", "effect"]);
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

  test("useId returns stable root-local ids across rerenders", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    function Field(props: { label: string }) {
      const id = useId();
      return createElement("label", { htmlFor: id }, props.label);
    }

    root.render(
      createElement(
        StrictMode,
        null,
        [createElement(Field, { key: "a", label: "A" }), createElement(Field, { key: "b", label: "B" })],
      ),
    );
    root.render(
      createElement(
        StrictMode,
        null,
        [createElement(Field, { key: "a", label: "A2" }), createElement(Field, { key: "b", label: "B2" })],
      ),
    );

    expect(container.innerHTML).toBe(
      '<label for=":mreact-0:">A2</label><label for=":mreact-1:">B2</label>',
    );
  });

  test("useId honors root identifierPrefix", () => {
    const container = document.createElement("div");
    const root = createRoot(container, { identifierPrefix: "app-" });

    function Field() {
      const id = useId();
      return createElement("label", { htmlFor: id }, id);
    }

    root.render(createElement(Field, null));

    expect(container.innerHTML).toBe(
      '<label for=":app-0:">:app-0:</label>',
    );
  });

  test("useId honors hydrateRoot identifierPrefix", () => {
    const container = document.createElement("div");
    container.innerHTML = '<label for=":app-0:">:app-0:</label>';

    function Field() {
      const id = useId();
      return createElement("label", { htmlFor: id }, id);
    }

    hydrateRoot(container, createElement(Field, null), {
      identifierPrefix: "app-",
    });

    expect(container.innerHTML).toBe(
      '<label for=":app-0:">:app-0:</label>',
    );
  });

  test("useId works during renderToString", () => {
    function Field() {
      const id = useId();
      return `<label for="${id}">Name</label><input id="${id}">`;
    }

    expect(renderToString(Field)).toBe(
      '<label for=":mreact-0:">Name</label><input id=":mreact-0:">',
    );
  });

  test("useId honors renderToString identifierPrefix", () => {
    function Field() {
      const id = useId();
      return `<label for="${id}">Name</label><input id="${id}">`;
    }

    expect(renderToString(Field, undefined, { identifierPrefix: "srv-" })).toBe(
      '<label for=":srv-0:">Name</label><input id=":srv-0:">',
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
    expect(Children.only(child)).toBe(child);
    expect(() => Children.only([child, "text"])).toThrow(
      "Expected exactly one child.",
    );
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

  test("class component setState supports updater functions and callbacks", () => {
    const container = document.createElement("div");
    const callbacks: string[] = [];

    class Counter {
      props: { step: number };
      state = { count: 0 };
      setState: (
        partial: (state: { count: number }, props: { step: number }) => {
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

      componentDidUpdate(
        previousProps: { label: string },
        previousState: { count: number },
      ) {
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

    expect(calls).toEqual([
      "mount:A:0",
      "update:A:0->A:1",
      "update:A:1->B:1",
      "unmount:B:1",
    ]);
  });
});
