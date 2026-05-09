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

describe("react-compat identity hooks", () => {
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
