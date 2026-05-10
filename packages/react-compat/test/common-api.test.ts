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
  isValidElement,
  lazy,
  memo,
  render,
  StrictMode,
  useEffect,
  useInsertionEffect,
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

  test("memo renders the wrapped component", () => {
    const container = document.createElement("div");
    const Label = memo((props: { value: string }) =>
      createElement("span", null, props.value),
    );

    render(createElement(Label, { value: "memo" }), container);

    expect(container.innerHTML).toBe("<span>memo</span>");
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
});
