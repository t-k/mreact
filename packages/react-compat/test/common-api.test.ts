// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import {
  Activity,
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
  Profiler,
  render,
  renderToString,
  StrictMode,
  useEffect,
  useEffectEvent,
  useDebugValue,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  use,
  cache,
  cacheSignal,
  captureOwnerStack,
  unstable_useCacheRefresh,
} from "../src/index.js";
import { getFiberRootForContainer } from "../src/fiber-work-loop.js";

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
    expect(getFiberRootForContainer(container)?.current.child?.tag).toBe(
      "strict-mode",
    );
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

    expect(() => render(createElement(App, null), container)).toThrow(
      "Store unstable.",
    );
    expect(container.innerHTML).toBe("");
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
      '<label for="_r_0_">A2</label><label for="_r_1_">B2</label>',
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
      '<label for="_app-r_0_">_app-r_0_</label>',
    );
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

    expect(container.innerHTML).toBe(
      '<label for="_app-R_0_">_app-R_0_</label>',
    );
  });

  test("useId works during renderToString", () => {
    function Field() {
      const id = useId();
      return `<label for="${id}">Name</label><input id="${id}">`;
    }

    expect(renderToString(Field)).toBe(
      '<label for="_R_0_">Name</label><input id="_R_0_">',
    );
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
    expect(calls).toEqual([
      "render:A",
      "should:1->1",
      "should:1->2",
      "render:C",
      "update",
    ]);
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
    expect(calls).toEqual([
      "render:A",
      "should",
      "render:B",
      "forced",
    ]);
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

  test("Activity and Profiler render children on the client", () => {
    const container = document.createElement("div");

    render(
      createElement(
        Profiler,
        { id: "profile", onRender: () => undefined },
        createElement(
          Activity,
          { mode: "visible" },
          createElement("span", null, "Visible"),
        ),
      ),
      container,
    );

    expect(container.innerHTML).toBe("<span>Visible</span>");
  });

  test("Activity hidden mode omits children on the client", () => {
    const container = document.createElement("div");

    render(
      createElement(
        Activity,
        { mode: "hidden" },
        createElement("span", null, "Hidden"),
      ),
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
      return createElement(
        "button",
        { onClick: () => setCount((value) => value + 1) },
        count,
      );
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

    function App() {
      useDebugValue("ready", (value) => `status:${value}`);
      return createElement("p", null, "debug");
    }

    render(createElement(App, null), container);

    const fiberRoot = getFiberRootForContainer(container);
    const appState = fiberRoot?.current.child?.memoizedState as
      | { hooks?: Array<{ kind?: string; value?: unknown }> }
      | undefined;
    values.push(...(appState?.hooks ?? []));

    expect(values).toEqual([
      {
        kind: "debug",
        value: "status:ready",
      },
    ]);
  });
});
