// @vitest-environment happy-dom

import { describe, expect, test, vi } from "vitest";
import {
  createElement,
  createRoot,
  render,
  useReducer,
  useState,
} from "../src/index.js";

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

  test("schedules continuous event updates on a microtask", async () => {
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
