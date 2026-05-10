// @vitest-environment happy-dom

import { describe, expect, test, vi } from "vitest";
import {
  createElement,
  createRoot,
  render,
  unmountComponentAtNode,
  useEffect,
  useLayoutEffect,
  useState,
} from "../src/index.js";

describe("react-compat effect hooks", () => {
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

    expect(calls).toEqual([
      "effect 0",
      "cleanup 0",
      "effect 1",
      "cleanup 1",
    ]);
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
