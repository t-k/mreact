// @vitest-environment happy-dom

import { describe, expect, test, vi } from "vitest";
import {
  Fragment,
  createElement,
  createRoot,
  hydrateRoot,
  render,
  unmountComponentAtNode,
} from "../src/index.js";

describe("react-compat render", () => {
  test("renders DOM elements and text", () => {
    const container = document.createElement("div");

    render(createElement("div", { id: "app" }, "Hello"), container);

    expect(container.innerHTML).toBe('<div id="app">Hello</div>');
  });

  test("renders fragments and array children", () => {
    const container = document.createElement("div");

    render(
      createElement(Fragment, null, [
        createElement("span", null, "A"),
        createElement("span", null, "B"),
      ]),
      container,
    );

    expect(container.innerHTML).toBe("<span>A</span><span>B</span>");
  });

  test("renders function components", () => {
    const container = document.createElement("div");

    function App() {
      return createElement("p", null, "Hello");
    }

    render(createElement(App, null), container);

    expect(container.innerHTML).toBe("<p>Hello</p>");
  });

  test("applies className, style, attributes, and events", () => {
    const container = document.createElement("div");
    const onClick = vi.fn();

    render(
      createElement(
        "div",
        null,
        createElement(
          "button",
          {
            className: "primary",
            disabled: true,
            style: { color: "red" },
          },
          "Save",
        ),
        createElement("button", { id: "event", onClick }, "Click"),
      ),
      container,
    );

    const button = container.querySelector("button");
    expect(button?.className).toBe("primary");
    expect(button?.disabled).toBe(true);
    expect(button?.style.color).toBe("red");

    container.querySelector<HTMLButtonElement>("#event")?.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("createRoot unmount clears DOM", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    root.render(createElement("div", null, "Hello"));
    root.unmount();

    expect(container.innerHTML).toBe("");
  });

  test("legacy unmountComponentAtNode clears DOM", () => {
    const container = document.createElement("div");

    render(createElement("div", null, "Hello"), container);

    expect(unmountComponentAtNode(container)).toBe(true);
    expect(container.innerHTML).toBe("");
  });

  test("hydrateRoot renders into an existing container", () => {
    const container = document.createElement("div");
    container.innerHTML = "<p>server</p>";

    const root = hydrateRoot(container, createElement("p", null, "client"));

    expect(container.innerHTML).toBe("<p>client</p>");

    root.unmount();
    expect(container.innerHTML).toBe("");
  });
});
