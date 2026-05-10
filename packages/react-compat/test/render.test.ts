// @vitest-environment happy-dom

import { describe, expect, test, vi } from "vitest";
import {
  Fragment,
  createElement,
  createPortal,
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

  test("passes a synthetic event wrapper to event handlers", () => {
    const container = document.createElement("div");
    let seen:
      | {
          nativeEvent: boolean;
          currentTarget: EventTarget | null;
          defaultPrevented: boolean;
        }
      | undefined;

    render(
      createElement("button", {
        onClick: (event: {
          nativeEvent: Event;
          currentTarget: EventTarget | null;
          preventDefault(): void;
          isDefaultPrevented(): boolean;
        }) => {
          event.preventDefault();
          seen = {
            nativeEvent: event.nativeEvent instanceof Event,
            currentTarget: event.currentTarget,
            defaultPrevented: event.isDefaultPrevented(),
          };
        },
      }, "Click"),
      container,
    );

    const button = container.querySelector("button");
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(seen).toEqual({
      nativeEvent: true,
      currentTarget: button,
      defaultPrevented: true,
    });
  });

  test("delegates event listeners through the root container", () => {
    const container = document.createElement("div");
    const addedListeners: string[] = [];
    const originalAddEventListener = HTMLElement.prototype.addEventListener;

    HTMLElement.prototype.addEventListener = function addEventListenerSpy(
      this: HTMLElement,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      addedListeners.push(`${this.tagName.toLowerCase()}:${type}`);
      return originalAddEventListener.call(this, type, listener, options);
    };

    try {
      render(
        createElement("button", { onClick: () => undefined }, "Click"),
        container,
      );
    } finally {
      HTMLElement.prototype.addEventListener = originalAddEventListener;
    }

    expect(addedListeners).toContain("div:click");
    expect(addedListeners).not.toContain("button:click");
  });

  test("synthetic stopPropagation stops delegated parent handlers", () => {
    const container = document.createElement("div");
    const child = vi.fn((event: { stopPropagation(): void }) => {
      event.stopPropagation();
    });
    const parent = vi.fn();

    render(
      createElement(
        "div",
        { onClick: parent },
        createElement("button", { onClick: child }, "Click"),
      ),
      container,
    );

    container.querySelector("button")?.click();

    expect(child).toHaveBeenCalledTimes(1);
    expect(parent).not.toHaveBeenCalled();
  });

  test("delegates capture handlers before bubble handlers", () => {
    const container = document.createElement("div");
    const calls: string[] = [];

    render(
      createElement(
        "div",
        {
          onClick: () => { calls.push("parent:bubble"); },
          onClickCapture: () => { calls.push("parent:capture"); },
        },
        createElement("button", {
          onClick: () => { calls.push("child:bubble"); },
          onClickCapture: () => { calls.push("child:capture"); },
        }, "Click"),
      ),
      container,
    );

    container.querySelector("button")?.click();

    expect(calls).toEqual([
      "parent:capture",
      "child:capture",
      "child:bubble",
      "parent:bubble",
    ]);
  });

  test("capture stopPropagation prevents target and bubble handlers", () => {
    const container = document.createElement("div");
    const calls: string[] = [];

    render(
      createElement(
        "div",
        {
          onClick: () => { calls.push("parent:bubble"); },
          onClickCapture: (event: { stopPropagation(): void }) => {
            calls.push("parent:capture");
            event.stopPropagation();
          },
        },
        createElement("button", {
          onClick: () => { calls.push("child:bubble"); },
          onClickCapture: () => { calls.push("child:capture"); },
        }, "Click"),
      ),
      container,
    );

    container.querySelector("button")?.click();

    expect(calls).toEqual(["parent:capture"]);
  });

  test("normalizes onDoubleClick to the native dblclick event", () => {
    const container = document.createElement("div");
    const calls: string[] = [];

    render(
      createElement("button", { onDoubleClick: () => { calls.push("double"); } }, "Click"),
      container,
    );

    container.querySelector("button")?.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true }),
    );

    expect(calls).toEqual(["double"]);
  });

  test("normalizes focus and blur to bubbling focusin and focusout events", () => {
    const container = document.createElement("div");
    const calls: string[] = [];

    render(
      createElement(
        "label",
        {
          onFocus: () => { calls.push("parent:focus"); },
          onBlur: () => { calls.push("parent:blur"); },
        },
        createElement("input", {
          onFocus: () => { calls.push("input:focus"); },
          onBlur: () => { calls.push("input:blur"); },
        }),
      ),
      container,
    );

    const input = container.querySelector("input");
    input?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    input?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));

    expect(calls).toEqual([
      "input:focus",
      "parent:focus",
      "input:blur",
      "parent:blur",
    ]);
  });

  test("createRoot unmount clears DOM", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    root.render(createElement("div", null, "Hello"));
    root.unmount();

    expect(container.innerHTML).toBe("");
  });

  test("renders portals into an external container and clears them on root unmount", () => {
    const container = document.createElement("div");
    const target = document.createElement("aside");
    const root = createRoot(container);

    root.render(
      createElement(
        "section",
        null,
        "Main",
        createPortal(createElement("strong", null, "Portal"), target),
      ),
    );

    expect(container.innerHTML).toBe("<section>Main</section>");
    expect(target.innerHTML).toBe("<strong>Portal</strong>");

    root.unmount();

    expect(container.innerHTML).toBe("");
    expect(target.innerHTML).toBe("");
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

  test("hydrateRoot reuses matching DOM nodes and attaches event handlers", () => {
    const container = document.createElement("div");
    container.innerHTML = "<button>server</button>";
    const button = container.firstChild;
    let clicks = 0;

    hydrateRoot(
      container,
      createElement("button", { onClick: () => { clicks += 1; } }, "client"),
    );

    expect(container.firstChild).toBe(button);
    expect(container.innerHTML).toBe("<button>client</button>");

    (container.firstChild as HTMLElement).click();
    expect(clicks).toBe(1);
  });

  test("render reorders keyed DOM children without recreating matching nodes", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    root.render(
      createElement("ul", null, [
        createElement("li", { key: "a" }, "A"),
        createElement("li", { key: "b" }, "B"),
      ]),
    );

    const firstA = container.querySelectorAll("li")[0];
    const firstB = container.querySelectorAll("li")[1];

    root.render(
      createElement("ul", null, [
        createElement("li", { key: "b" }, "B2"),
        createElement("li", { key: "a" }, "A2"),
      ]),
    );

    const nextItems = container.querySelectorAll("li");
    expect(nextItems[0]).toBe(firstB);
    expect(nextItems[0]?.textContent).toBe("B2");
    expect(nextItems[1]).toBe(firstA);
    expect(nextItems[1]?.textContent).toBe("A2");
  });
});
