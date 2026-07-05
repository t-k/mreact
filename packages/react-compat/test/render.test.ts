// @vitest-environment happy-dom

import { afterEach, describe, expect, test, vi } from "vitest";
import {
  Children,
  Fragment,
  cloneElement,
  createElement,
  createPortal,
  createRoot,
  flushSync,
  forwardRef,
  hydrateRoot,
  isValidElement,
  memo,
  render,
  unmountComponentAtNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "../src/index.js";
import { getFiberRootForContainer } from "../src/fiber-work-loop.js";
import { getAppliedEventHandler, getAppliedProps } from "../src/host-event-binder.js";
import { getEventPath, setLogicalEventParent } from "../src/events.js";
import { bindEvent } from "@reckona/mreact-reactive-dom";
import { createReactiveDomBlock } from "../src/jsx-runtime.js";
import type { Fiber } from "../src/fiber.js";

function countFiberSubtree(fiber: Fiber | undefined): number {
  let count = 0;
  const seen = new Set<Fiber>();
  const stack = fiber === undefined ? [] : [fiber];

  while (stack.length > 0) {
    const current = stack.pop();

    if (current === undefined || seen.has(current)) {
      continue;
    }

    seen.add(current);
    count += 1;

    if (current.child !== undefined) {
      stack.push(current.child);
    }

    if (current.sibling !== undefined) {
      stack.push(current.sibling);
    }
  }

  return count;
}

function findFiberByKey(fiber: Fiber | undefined, key: string): Fiber | undefined {
  const seen = new Set<Fiber>();
  const stack = fiber === undefined ? [] : [fiber];

  while (stack.length > 0) {
    const current = stack.pop();

    if (current === undefined || seen.has(current)) {
      continue;
    }

    seen.add(current);

    if (current.key === key) {
      return current;
    }

    if (current.child !== undefined) {
      stack.push(current.child);
    }

    if (current.sibling !== undefined) {
      stack.push(current.sibling);
    }
  }

  return undefined;
}

describe("react-compat render", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  test("drops removed row subtrees from the retained alternate fiber tree", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const rows = Array.from({ length: 20 }, (_, index) => ({
      id: index,
      label: `Row ${index}`,
    }));

    function Rows({ rows }: { rows: readonly { id: number; label: string }[] }) {
      return createElement(
        Fragment,
        null,
        rows.map((row) =>
          createElement(
            "div",
            { "data-key": row.id, key: row.id },
            createElement("span", null, row.label),
            createElement("button", { type: "button", onClick: () => row.id }, "select"),
          ),
        ),
      );
    }

    flushSync(() => root.render(createElement(Rows, { rows })));
    flushSync(() => root.render(createElement(Rows, { rows: [] })));

    const fiberRoot = getFiberRootForContainer(container);

    expect(container.children).toHaveLength(0);
    expect(countFiberSubtree(fiberRoot?.current.alternate?.child)).toBeLessThan(5);
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

  test("serializes React booleanish string DOM attributes", () => {
    const container = document.createElement("div");

    render(
      createElement("div", {
        "aria-expanded": true,
        "aria-invalid": false,
        "aria-required": false,
        "data-enabled": true,
        "data-ready": false,
        contentEditable: true,
        disabled: true,
        spellCheck: true,
      }),
      container,
    );

    const element = container.querySelector("div")!;
    expect(element.getAttribute("contenteditable")).toBe("true");
    expect(element.getAttribute("spellcheck")).toBe("true");
    expect(element.getAttribute("aria-expanded")).toBe("true");
    expect(element.getAttribute("aria-invalid")).toBe("false");
    expect(element.getAttribute("aria-required")).toBe("false");
    expect(element.getAttribute("data-enabled")).toBe("true");
    expect(element.getAttribute("data-ready")).toBe("false");
    expect(element.getAttribute("disabled")).toBe("");
  });

  test("preserves contentEditable children inserted by a ref initializer", () => {
    const container = document.createElement("div");

    render(
      createElement("div", {
        contentEditable: true,
        ref: (node: HTMLDivElement | null) => {
          if (node === null || node.firstChild !== null) {
            return;
          }

          const paragraph = document.createElement("p");
          paragraph.setAttribute("dir", "auto");
          paragraph.appendChild(document.createElement("br"));
          node.appendChild(paragraph);
        },
      }),
      container,
    );

    expect(container.innerHTML).toBe('<div contenteditable="true"><p dir="auto"><br></p></div>');
  });

  test("preserves contentEditable attributes inserted by a ref initializer across updates", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let initialized = false;

    const initializeEditorRoot = (node: HTMLDivElement | null) => {
      if (node === null || initialized) {
        return;
      }

      initialized = true;
      node.style.userSelect = "text";
      node.style.whiteSpace = "pre-wrap";
      node.style.wordBreak = "break-word";
      node.setAttribute("data-lexical-editor", "true");
    };

    root.render(
      createElement("div", {
        contentEditable: true,
        ref: initializeEditorRoot,
        role: "textbox",
        spellCheck: true,
      }),
    );

    const editor = container.querySelector<HTMLDivElement>("div")!;
    root.render(
      createElement("div", {
        contentEditable: true,
        ref: initializeEditorRoot,
        role: "textbox",
        spellCheck: true,
      }),
    );

    expect(container.querySelector("div")).toBe(editor);
    expect(editor.style.userSelect).toBe("text");
    expect(editor.style.whiteSpace).toBe("pre-wrap");
    expect(editor.style.wordBreak).toBe("break-word");
    expect(editor.getAttribute("data-lexical-editor")).toBe("true");
  });

  test("does not render React dev metadata props as DOM attributes", () => {
    const container = document.createElement("div");

    render(
      createElement(
        "div",
        {
          __self: { component: "Trans" },
          __source: { fileName: "Trans.jsx", lineNumber: 12 },
        },
        createElement(
          "a",
          {
            href: "/msgs",
            __self: { component: "TransLink" },
            __source: { fileName: "Trans.jsx", lineNumber: 13 },
          },
          "there",
        ),
      ),
      container,
    );

    expect(container.innerHTML).toBe('<div><a href="/msgs">there</a></div>');
    expect(container.querySelector("div")?.hasAttribute("__self")).toBe(false);
    expect(container.querySelector("div")?.hasAttribute("__source")).toBe(false);
    expect(container.querySelector("a")?.hasAttribute("__self")).toBe(false);
    expect(container.querySelector("a")?.hasAttribute("__source")).toBe(false);
  });

  test("applies React numeric style unit rules on the client", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const setProperty = vi.spyOn(CSSStyleDeclaration.prototype, "setProperty");

    root.render(
      createElement("div", {
        style: {
          flex: 1,
          height: 300,
          lineHeight: 1.5,
          opacity: 0.5,
          width: 640,
          zIndex: 2,
          "--gap": 4,
        },
      }),
    );

    const view = container.querySelector<HTMLDivElement>("div")!;
    expect(view.style.height).toBe("300px");
    expect(view.style.width).toBe("640px");
    expect(view.style.opacity).toBe("0.5");
    expect(view.style.zIndex).toBe("2");
    expect(view.style.lineHeight).toBe("1.5");
    expect(view.style.getPropertyValue("--gap")).toBe("4");
    expect(setProperty).toHaveBeenCalledWith("height", "300px");
    expect(setProperty).toHaveBeenCalledWith("width", "640px");
    expect(setProperty).toHaveBeenCalledWith("opacity", "0.5");
    expect(setProperty).toHaveBeenCalledWith("flex", "1");
    expect(setProperty).toHaveBeenCalledWith("--gap", "4");

    root.render(createElement("div", { style: { width: 0 } }));
    expect(view.style.height).toBe("");
    expect(view.style.width).toBe("0px");
    expect(view.style.getPropertyValue("--gap")).toBe("");
  });

  test("skips unchanged host attribute writes on rerender", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    flushSync(() => root.render(createElement("div", { className: "row", "data-key": 1 }, "A")));

    const setAttribute = vi.spyOn(Element.prototype, "setAttribute");
    flushSync(() => root.render(createElement("div", { className: "row", "data-key": 1 }, "A")));

    expect(setAttribute).not.toHaveBeenCalled();
  });

  test("compares unchanged host props without Object.keys allocations", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    flushSync(() => root.render(createElement("div", { "data-key": 1, title: "row" }, "A")));

    const originalKeys = Object.keys;
    let objectKeyCalls = 0;
    Object.keys = ((value) => {
      objectKeyCalls += 1;
      return originalKeys(value);
    }) as typeof Object.keys;
    try {
      flushSync(() => root.render(createElement("div", { "data-key": 1, title: "row" }, "A")));
    } finally {
      Object.keys = originalKeys;
    }

    expect(objectKeyCalls).toBe(0);
  });

  test("updates host props without Object.entries allocations", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    flushSync(() => root.render(createElement("div", { "data-key": 1, title: "row" }, "A")));

    const originalEntries = Object.entries;
    let objectEntriesCalls = 0;
    Object.entries = ((value) => {
      objectEntriesCalls += 1;
      return originalEntries(value);
    }) as typeof Object.entries;
    try {
      flushSync(() => root.render(createElement("div", { "data-key": 1, title: "updated" }, "A")));
    } finally {
      Object.entries = originalEntries;
    }

    expect(objectEntriesCalls).toBe(0);
  });

  test("skips unchanged host attribute writes when children change", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    flushSync(() => root.render(createElement("div", { "data-key": 1 }, "A")));

    const setAttribute = vi.spyOn(Element.prototype, "setAttribute");
    flushSync(() => root.render(createElement("div", { "data-key": 1 }, "B")));

    expect(container.textContent).toBe("B");
    expect(setAttribute).not.toHaveBeenCalledWith("data-key", "1");
  });

  test("skips nullish initial host attributes before querying the DOM", () => {
    const container = document.createElement("div");
    const hasAttribute = vi.spyOn(Element.prototype, "hasAttribute");

    render(
      createElement("div", { className: undefined, "data-selected": undefined }, "row"),
      container,
    );

    expect(container.innerHTML).toBe("<div>row</div>");
    expect(hasAttribute).not.toHaveBeenCalledWith("class");
    expect(hasAttribute).not.toHaveBeenCalledWith("data-selected");
  });

  test("reuses compat element props as the applied host props snapshot", () => {
    const container = document.createElement("div");
    const element = createElement("div", { "data-key": 1 }, "row");

    render(element, container);

    const rendered = container.querySelector("div")!;
    expect(getAppliedProps(rendered)?.props).toBe(element.props);
  });

  test("defers host attribute-name snapshots until the first update", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    flushSync(() =>
      root.render(createElement("div", { className: "selected", "data-key": 1 }, "row")),
    );

    const rendered = container.querySelector("div")!;
    expect(getAppliedProps(rendered)?.attributeNames).toBeUndefined();

    flushSync(() => root.render(createElement("div", { "data-key": 1 }, "row")));

    expect(rendered.className).toBe("");
    expect(getAppliedProps(rendered)?.attributeNames).toEqual(["data-key"]);
  });

  test("creates SVG subtrees in the SVG namespace and foreignObject children in HTML", () => {
    const container = document.createElement("div");
    const createElementNS = vi.spyOn(document, "createElementNS");

    render(
      createElement(
        "section",
        null,
        createElement(
          "svg",
          { viewBox: "0 0 10 10" },
          createElement("rect", { width: 10, height: 10 }),
          createElement(
            "foreignObject",
            null,
            createElement("div", { id: "inside-foreign-object" }, "HTML"),
          ),
        ),
      ),
      container,
    );

    const svg = container.querySelector("svg")!;
    const rect = container.querySelector("rect")!;
    const foreignObject = container.querySelector("foreignObject")!;
    const htmlChild = container.querySelector("#inside-foreign-object")!;

    expect(createElementNS).toHaveBeenCalledWith("http://www.w3.org/2000/svg", "svg");
    expect(createElementNS).toHaveBeenCalledWith("http://www.w3.org/2000/svg", "rect");
    expect(createElementNS).toHaveBeenCalledWith("http://www.w3.org/2000/svg", "foreignObject");
    expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(svg).toBeInstanceOf(SVGSVGElement);
    expect(rect.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(rect).toBeInstanceOf(SVGRectElement);
    expect(foreignObject.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(htmlChild.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
    expect(htmlChild).toBeInstanceOf(HTMLDivElement);
  });

  test("applies React SVG attribute aliases", () => {
    const container = document.createElement("div");

    render(
      createElement(
        "svg",
        null,
        createElement("path", {
          clipPath: "url(#clip)",
          fillOpacity: 0.5,
          strokeDasharray: "0px 0px",
          strokeLinecap: "round",
          strokeWidth: 2,
        }),
      ),
      container,
    );

    const path = container.querySelector("path")!;
    expect(path.getAttribute("clip-path")).toBe("url(#clip)");
    expect(path.getAttribute("fill-opacity")).toBe("0.5");
    expect(path.getAttribute("stroke-dasharray")).toBe("0px 0px");
    expect(path.getAttribute("stroke-linecap")).toBe("round");
    expect(path.getAttribute("stroke-width")).toBe("2");
  });

  test("applies input default props as DOM initial state", () => {
    const container = document.createElement("div");

    render(
      createElement(
        "form",
        null,
        createElement("input", { name: "user", defaultValue: "Ada" }),
        createElement("input", { type: "checkbox", defaultChecked: true }),
      ),
      container,
    );

    const user = container.querySelector<HTMLInputElement>('input[name="user"]');
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]');

    expect(user?.value).toBe("Ada");
    expect(user?.getAttribute("value")).toBe("Ada");
    expect(user?.hasAttribute("defaultValue")).toBe(false);
    expect(checkbox?.checked).toBe(true);
    expect(checkbox?.hasAttribute("checked")).toBe(true);
    expect(checkbox?.hasAttribute("defaultChecked")).toBe(false);
  });

  test("preserves uncontrolled form state across unrelated rerenders", () => {
    const container = document.createElement("div");

    function Form({ tick }: { tick: number }) {
      return createElement(
        "form",
        { "data-render": tick },
        createElement("input", { name: "user", defaultValue: "Ada" }),
        createElement("textarea", { name: "bio", defaultValue: "Hello" }),
        createElement(
          "select",
          { name: "role", defaultValue: "admin" },
          createElement("option", { value: "admin" }, "Admin"),
          createElement("option", { value: "user" }, "User"),
        ),
        createElement("input", { type: "checkbox", defaultChecked: true }),
      );
    }

    render(createElement(Form, { tick: 0 }), container);

    const user = container.querySelector<HTMLInputElement>('input[name="user"]')!;
    const bio = container.querySelector<HTMLTextAreaElement>("textarea")!;
    const role = container.querySelector<HTMLSelectElement>("select")!;
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;

    user.value = "Grace";
    bio.value = "Updated";
    role.value = "user";
    checkbox.checked = false;

    render(createElement(Form, { tick: 1 }), container);

    expect(container.querySelector("form")?.getAttribute("data-render")).toBe("1");
    expect(user.value).toBe("Grace");
    expect(bio.value).toBe("Updated");
    expect(role.value).toBe("user");
    expect(checkbox.checked).toBe(false);
  });

  test("keeps controlled form props updating live DOM state", () => {
    const container = document.createElement("div");

    function Form({ value, checked }: { value: string; checked: boolean }) {
      return createElement(
        "form",
        null,
        createElement("input", { name: "user", value }),
        createElement("textarea", { value }),
        createElement(
          "select",
          { value },
          createElement("option", { value: "Ada" }, "Ada"),
          createElement("option", { value: "Grace" }, "Grace"),
        ),
        createElement("input", { type: "checkbox", checked }),
      );
    }

    render(createElement(Form, { value: "Ada", checked: false }), container);

    const user = container.querySelector<HTMLInputElement>('input[name="user"]')!;
    const bio = container.querySelector<HTMLTextAreaElement>("textarea")!;
    const role = container.querySelector<HTMLSelectElement>("select")!;
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;

    user.value = "Manual";
    bio.value = "Manual";
    role.value = "Grace";
    checkbox.checked = false;

    render(createElement(Form, { value: "Grace", checked: true }), container);

    expect(user.value).toBe("Grace");
    expect(bio.value).toBe("Grace");
    expect(role.value).toBe("Grace");
    expect(checkbox.checked).toBe(true);
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
      createElement(
        "button",
        {
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
        },
        "Click",
      ),
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

  test("copies pointer, mouse button, and modifier fields onto pointer synthetic events", () => {
    const container = document.createElement("div");
    let seen:
      | {
          pointerId: number | undefined;
          pointerType: string | undefined;
          isPrimary: boolean | undefined;
          button: number | undefined;
          buttons: number | undefined;
          ctrlKey: boolean | undefined;
          shiftKey: boolean | undefined;
          altKey: boolean | undefined;
          metaKey: boolean | undefined;
        }
      | undefined;

    render(
      createElement(
        "button",
        {
          onPointerDown: (event: {
            pointerId?: number;
            pointerType?: string;
            isPrimary?: boolean;
            button?: number;
            buttons?: number;
            ctrlKey?: boolean;
            shiftKey?: boolean;
            altKey?: boolean;
            metaKey?: boolean;
          }) => {
            seen = {
              pointerId: event.pointerId,
              pointerType: event.pointerType,
              isPrimary: event.isPrimary,
              button: event.button,
              buttons: event.buttons,
              ctrlKey: event.ctrlKey,
              shiftKey: event.shiftKey,
              altKey: event.altKey,
              metaKey: event.metaKey,
            };
          },
        },
        "Open",
      ),
      container,
    );

    const event = new MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      ctrlKey: false,
      shiftKey: true,
      altKey: false,
      metaKey: true,
    });
    Object.defineProperties(event, {
      pointerId: { value: 7 },
      pointerType: { value: "mouse" },
      isPrimary: { value: true },
    });

    container.querySelector("button")?.dispatchEvent(event);

    expect(seen).toEqual({
      pointerId: 7,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: 1,
      ctrlKey: false,
      shiftKey: true,
      altKey: false,
      metaKey: true,
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
      render(createElement("button", { onClick: () => undefined }, "Click"), container);
    } finally {
      HTMLElement.prototype.addEventListener = originalAddEventListener;
    }

    expect(addedListeners).toContain("div:click");
    expect(addedListeners).not.toContain("button:click");
  });

  test("promotes delegated events from reactive-dom blocks after commit without detached fallbacks", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const addedListeners: string[] = [];
    const originalDocumentAddEventListener = document.addEventListener;
    const originalAddEventListener = HTMLElement.prototype.addEventListener;
    const originalRemoveEventListener = HTMLElement.prototype.removeEventListener;

    document.addEventListener = function documentAddEventListenerSpy(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      addedListeners.push(`#document:${type}`);
      return originalDocumentAddEventListener.call(this, type, listener, options);
    } as typeof document.addEventListener;

    HTMLElement.prototype.addEventListener = function addEventListenerSpy(
      this: HTMLElement,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      addedListeners.push(`${this.tagName.toLowerCase()}:${type}`);
      return originalAddEventListener.call(this, type, listener, options);
    };

    HTMLElement.prototype.removeEventListener = function removeEventListenerSpy(
      this: HTMLElement,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) {
      addedListeners.push(`remove:${this.tagName.toLowerCase()}:${type}`);
      return originalRemoveEventListener.call(this, type, listener, options);
    };

    try {
      render(
        createReactiveDomBlock(() => {
          const button = document.createElement("button");
          button.textContent = "Click";
          const dispose = bindEvent(button, "click", () => {
            button.textContent = "Clicked";
          });
          return { node: button, dispose };
        }),
        container,
      );

      container.querySelector("button")?.click();

      expect(container.textContent).toBe("Clicked");
      expect(addedListeners).toContain("#document:click");
      expect(addedListeners).not.toContain("button:click");
      expect(addedListeners).not.toContain("remove:button:click");
    } finally {
      document.addEventListener = originalDocumentAddEventListener;
      HTMLElement.prototype.addEventListener = originalAddEventListener;
      HTMLElement.prototype.removeEventListener = originalRemoveEventListener;
      container.remove();
    }
  });

  test("reads event handlers from applied props without separate listener metadata", () => {
    const container = document.createElement("div");
    const onClick = () => undefined;

    render(createElement("button", { onClick }, "Click"), container);

    const button = container.querySelector("button");
    expect(getAppliedProps(button!)?.listeners).toBeUndefined();
    expect(getAppliedEventHandler(button!, "onClick")).toBe(onClick);
  });

  test("classifies event props without regex checks on the mount path", () => {
    const container = document.createElement("div");
    const testSpy = vi.spyOn(RegExp.prototype, "test");

    render(createElement("button", { onClick: () => undefined }, "Click"), container);

    expect(testSpy).not.toHaveBeenCalled();
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
          onClick: () => {
            calls.push("parent:bubble");
          },
          onClickCapture: () => {
            calls.push("parent:capture");
          },
        },
        createElement(
          "button",
          {
            onClick: () => {
              calls.push("child:bubble");
            },
            onClickCapture: () => {
              calls.push("child:capture");
            },
          },
          "Click",
        ),
      ),
      container,
    );

    container.querySelector("button")?.click();

    expect(calls).toEqual(["parent:capture", "child:capture", "child:bubble", "parent:bubble"]);
  });

  test("capture stopPropagation prevents target and bubble handlers", () => {
    const container = document.createElement("div");
    const calls: string[] = [];

    render(
      createElement(
        "div",
        {
          onClick: () => {
            calls.push("parent:bubble");
          },
          onClickCapture: (event: { stopPropagation(): void }) => {
            calls.push("parent:capture");
            event.stopPropagation();
          },
        },
        createElement(
          "button",
          {
            onClick: () => {
              calls.push("child:bubble");
            },
            onClickCapture: () => {
              calls.push("child:capture");
            },
          },
          "Click",
        ),
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
      createElement(
        "button",
        {
          onDoubleClick: () => {
            calls.push("double");
          },
        },
        "Click",
      ),
      container,
    );

    container.querySelector("button")?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

    expect(calls).toEqual(["double"]);
  });

  test("normalizes focus and blur to bubbling focusin and focusout events", () => {
    const container = document.createElement("div");
    const calls: string[] = [];

    render(
      createElement(
        "label",
        {
          onFocus: () => {
            calls.push("parent:focus");
          },
          onBlur: () => {
            calls.push("parent:blur");
          },
        },
        createElement("input", {
          onFocus: () => {
            calls.push("input:focus");
          },
          onBlur: () => {
            calls.push("input:blur");
          },
        }),
      ),
      container,
    );

    const input = container.querySelector("input");
    input?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    input?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));

    expect(calls).toEqual(["input:focus", "parent:focus", "input:blur", "parent:blur"]);
  });

  test("normalizes text input events to onChange handlers", () => {
    const container = document.createElement("div");
    const calls: string[] = [];

    render(
      createElement("input", {
        onChange: (event: { currentTarget: HTMLInputElement }) => {
          calls.push(event.currentTarget.value);
        },
      }),
      container,
    );

    const input = container.querySelector("input");
    if (input !== null) {
      input.value = "Ada";
      input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }

    expect(calls).toEqual(["Ada"]);
  });

  test("does not fire text input onChange again for a native change event", () => {
    const container = document.createElement("div");
    const calls: string[] = [];

    render(
      createElement("input", {
        onChange: (event: { currentTarget: HTMLInputElement }) => {
          calls.push(event.currentTarget.value);
        },
      }),
      container,
    );

    const input = container.querySelector("input");
    if (input !== null) {
      input.value = "Ada";
      input.dispatchEvent(new InputEvent("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    expect(calls).toEqual(["Ada"]);
  });

  test("normalizes camel-case mouse over and out events", () => {
    const container = document.createElement("div");
    const calls: string[] = [];

    render(
      createElement(
        "button",
        {
          onMouseOver: () => {
            calls.push("over");
          },
          onMouseOut: () => {
            calls.push("out");
          },
        },
        "Hover",
      ),
      container,
    );

    const button = container.querySelector("button");
    button?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    button?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));

    expect(calls).toEqual(["over", "out"]);
  });

  test("normalizes mouse enter and leave without firing for internal movement", () => {
    const container = document.createElement("div");
    const calls: string[] = [];

    render(
      createElement(
        "div",
        {
          onMouseEnter: () => {
            calls.push("parent:enter");
          },
          onMouseLeave: () => {
            calls.push("parent:leave");
          },
        },
        createElement(
          "button",
          {
            onMouseEnter: () => {
              calls.push("child:enter");
            },
            onMouseLeave: () => {
              calls.push("child:leave");
            },
          },
          "Hover",
        ),
      ),
      container,
    );

    const parent = container.querySelector("div");
    const child = container.querySelector("button");

    child?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    parent?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: child }));
    child?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: parent }));
    parent?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));

    expect(calls).toEqual(["parent:enter", "child:enter", "child:leave", "parent:leave"]);
  });

  test("normalizes React multi-word and composition event names", () => {
    const container = document.createElement("div");
    const calls: string[] = [];

    render(
      createElement("input", {
        onBeforeInput: () => {
          calls.push("beforeinput");
        },
        onCompositionStart: () => {
          calls.push("compositionstart");
        },
        onCompositionUpdate: () => {
          calls.push("compositionupdate");
        },
        onCompositionEnd: () => {
          calls.push("compositionend");
        },
        onContextMenu: () => {
          calls.push("contextmenu");
        },
        onDrag: () => {
          calls.push("drag");
        },
        onDragEnter: () => {
          calls.push("dragenter");
        },
        onTouchStart: () => {
          calls.push("touchstart");
        },
      }),
      container,
    );

    const input = container.querySelector("input");
    input?.dispatchEvent(new InputEvent("beforeinput", { bubbles: true }));
    input?.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    input?.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true }));
    input?.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    input?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    input?.dispatchEvent(new DragEvent("drag", { bubbles: true }));
    input?.dispatchEvent(new DragEvent("dragenter", { bubbles: true }));
    input?.dispatchEvent(new Event("touchstart", { bubbles: true }));

    expect(calls).toEqual([
      "beforeinput",
      "compositionstart",
      "compositionupdate",
      "compositionend",
      "contextmenu",
      "drag",
      "dragenter",
      "touchstart",
    ]);
  });

  test("normalizes pointer enter and leave without firing for internal movement", () => {
    const container = document.createElement("div");
    const calls: string[] = [];

    render(
      createElement(
        "div",
        {
          onPointerEnter: () => {
            calls.push("parent:enter");
          },
          onPointerLeave: () => {
            calls.push("parent:leave");
          },
        },
        createElement(
          "button",
          {
            onPointerEnter: () => {
              calls.push("child:enter");
            },
            onPointerLeave: () => {
              calls.push("child:leave");
            },
          },
          "Hover",
        ),
      ),
      container,
    );

    const parent = container.querySelector("div");
    const child = container.querySelector("button");

    child?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    parent?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true, relatedTarget: child }));
    child?.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: parent }));
    parent?.dispatchEvent(new MouseEvent("pointerout", { bubbles: true }));

    expect(calls).toEqual(["parent:enter", "child:enter", "child:leave", "parent:leave"]);
  });

  test("synthetic event exposes React-compatible base fields", () => {
    const container = document.createElement("div");
    let seen:
      | {
          bubbles: boolean;
          cancelable: boolean;
          defaultPrevented: boolean;
          eventPhase: number;
          isTrusted: boolean;
          persistentBefore: boolean;
          persistentAfter: boolean;
          timeStamp: number;
        }
      | undefined;

    render(
      createElement(
        "button",
        {
          onClick: (event: {
            bubbles: boolean;
            cancelable: boolean;
            defaultPrevented: boolean;
            eventPhase: number;
            isTrusted: boolean;
            isPersistent(): boolean;
            persist(): void;
            preventDefault(): void;
            timeStamp: number;
          }) => {
            const persistentBefore = event.isPersistent();
            event.persist();
            event.preventDefault();
            seen = {
              bubbles: event.bubbles,
              cancelable: event.cancelable,
              defaultPrevented: event.defaultPrevented,
              eventPhase: event.eventPhase,
              isTrusted: event.isTrusted,
              persistentBefore,
              persistentAfter: event.isPersistent(),
              timeStamp: event.timeStamp,
            };
          },
        },
        "Click",
      ),
      container,
    );

    container
      .querySelector("button")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(seen).toEqual({
      bubbles: true,
      cancelable: true,
      defaultPrevented: true,
      eventPhase: expect.any(Number),
      isTrusted: false,
      persistentBefore: true,
      persistentAfter: true,
      timeStamp: expect.any(Number),
    });
  });

  test("portal events dispatch from the portal container and bubble through the owner tree", () => {
    const container = document.createElement("div");
    const portalTarget = document.createElement("aside");
    const calls: string[] = [];

    render(
      createElement(
        "section",
        {
          onClick: () => {
            calls.push("owner");
          },
        },
        createPortal(
          createElement(
            "button",
            {
              onClick: () => {
                calls.push("portal");
              },
            },
            "Portal",
          ),
          portalTarget,
        ),
      ),
      container,
    );

    portalTarget.querySelector("button")?.click();

    expect(calls).toEqual(["portal", "owner"]);
  });

  test("delegated portal events stop when a logical parent cycle reaches the same node twice", () => {
    const portalTarget = document.createElement("aside");
    const owner = document.createElement("section");
    const button = document.createElement("button");
    let ownerParentReads = 0;

    owner.append(button);
    portalTarget.append(owner);
    Object.defineProperty(owner, "parentNode", {
      configurable: true,
      get() {
        ownerParentReads += 1;
        if (ownerParentReads > 1) {
          throw new Error("logical parent cycle was not guarded");
        }
        return portalTarget;
      },
    });
    setLogicalEventParent(portalTarget, owner);
    const event = new MouseEvent("click", { bubbles: true });
    Object.defineProperty(event, "target", {
      configurable: true,
      value: button,
    });

    const path = getEventPath(portalTarget, event);

    expect(path).toEqual([button, owner, portalTarget]);
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

  test("commits wide host trees without recursive portal collection overflow", () => {
    vi.stubEnv("NODE_ENV", "production");
    const container = document.createElement("div");
    const root = createRoot(container);
    const rows = Array.from({ length: 10_000 }, (_, index) =>
      createElement("div", { key: index, "data-key": index }, String(index)),
    );

    try {
      root.render(createElement(Fragment, null, rows));

      expect(container.children).toHaveLength(10_000);
    } finally {
      root.unmount();
    }
  });

  test("mounts interaction-triggered layout effect portals into document body", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    function PortalContent() {
      const [mounted, setMounted] = useState(false);
      useLayoutEffect(() => {
        setMounted(true);
      }, []);
      return mounted ? createPortal(createElement("strong", null, "Portal"), document.body) : null;
    }

    function App() {
      const [open, setOpen] = useState(false);
      return createElement(
        "section",
        null,
        createElement("button", { onClick: () => setOpen(true) }, "Open"),
        open ? createElement(PortalContent, null) : null,
      );
    }

    root.render(createElement(App, null));
    container.querySelector("button")?.click();

    expect(document.body.querySelector("strong")?.textContent).toBe("Portal");

    root.unmount();
    document.body.replaceChildren();
  });

  test("keeps Radix-style presence portals opened by an interaction", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    function useStateMachine(
      initialState: "mounted" | "unmountSuspended" | "unmounted",
      machine: Record<
        string,
        Record<string, "mounted" | "unmountSuspended" | "unmounted" | undefined>
      >,
    ) {
      return useReducer((state: "mounted" | "unmountSuspended" | "unmounted", event: string) => {
        return machine[state]?.[event] ?? state;
      }, initialState);
    }

    function Presence(props: { present: boolean; children?: unknown }) {
      const presence = usePresence(props.present);
      const child = Children.only(props.children as never);

      if (!presence.isPresent || !isValidElement(child)) {
        return null;
      }

      return cloneElement(child, { ref: presence.ref });
    }

    function usePresence(present: boolean) {
      const [node, setNode] = useState<HTMLElement | undefined>();
      const stylesRef = useRef<CSSStyleDeclaration | null>(null);
      const previousPresentRef = useRef(present);
      const [state, send] = useStateMachine(present ? "mounted" : "unmounted", {
        mounted: { UNMOUNT: "unmounted", ANIMATION_OUT: "unmountSuspended" },
        unmountSuspended: { MOUNT: "mounted", ANIMATION_END: "unmounted" },
        unmounted: { MOUNT: "mounted" },
      });

      useLayoutEffect(() => {
        if (previousPresentRef.current !== present) {
          send(present ? "MOUNT" : "UNMOUNT");
          previousPresentRef.current = present;
        }
      }, [present, send]);
      useLayoutEffect(() => {
        if (node === undefined) {
          send("ANIMATION_END");
        }
      }, [node, send]);

      return {
        isPresent: state === "mounted" || state === "unmountSuspended",
        ref: useCallback((nextNode: HTMLElement | null) => {
          stylesRef.current = nextNode === null ? null : getComputedStyle(nextNode);
          setNode(nextNode ?? undefined);
        }, []),
      };
    }

    const PortalPrimitive = forwardRef<{ children?: unknown }, HTMLDivElement>(
      (props, forwardedRef) => {
        const [mounted, setMounted] = useState(false);
        useLayoutEffect(() => {
          setMounted(true);
        }, []);

        return mounted
          ? createPortal(createElement("div", { ref: forwardedRef }, props.children), document.body)
          : null;
      },
    );

    function DialogLike() {
      const [open, setOpen] = useState(false);
      return createElement(
        "section",
        null,
        createElement("button", { onClick: () => setOpen((value) => !value) }, "Open"),
        createElement(
          Presence,
          { present: open },
          createElement(PortalPrimitive, null, createElement("strong", null, "Dialog content")),
        ),
      );
    }

    root.render(createElement(DialogLike, null));
    container.querySelector("button")?.click();

    expect(document.body.querySelector("strong")?.textContent).toBe("Dialog content");

    root.unmount();
    document.body.replaceChildren();
  });

  test("removes portaled content after an interaction inside the portal closes it", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    function App() {
      const [open, setOpen] = useState(false);
      return createElement(
        "section",
        null,
        createElement("button", { onClick: () => setOpen(true) }, "Open"),
        open
          ? createPortal(
              createElement("button", { onClick: () => setOpen(false) }, "Portal close"),
              document.body,
            )
          : null,
      );
    }

    root.render(createElement(App, null));
    container
      .querySelector("button")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(document.body.querySelector("button")?.textContent).toBe("Portal close");

    document.body
      .querySelector("button")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(document.body.querySelector("button")).toBeNull();

    root.unmount();
    document.body.replaceChildren();
  });

  test("focuses interaction-mounted portal content from a layout effect", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    function PortalContent() {
      const buttonRef = useRef<HTMLButtonElement | null>(null);

      useLayoutEffect(() => {
        buttonRef.current?.focus();
      }, []);

      return createPortal(
        createElement("button", { ref: buttonRef, type: "button" }, "Portal action"),
        document.body,
      );
    }

    function App() {
      const [open, setOpen] = useState(false);
      return createElement(
        "section",
        null,
        createElement("button", { onClick: () => setOpen(true) }, "Open"),
        open ? createElement(PortalContent, null) : null,
      );
    }

    root.render(createElement(App, null));
    container.querySelector("button")?.click();

    expect(document.activeElement?.textContent).toBe("Portal action");

    root.unmount();
    document.body.replaceChildren();
  });

  test("runs effects scheduled after host ref state updates during portal commit", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const effects: string[] = [];

    function FocusScopeLike(props: { children?: unknown }) {
      const [scope, setScope] = useState<HTMLDivElement | null>(null);

      useEffect(() => {
        effects.push(scope?.textContent ?? "none");
        scope?.querySelector<HTMLButtonElement>("button")?.focus();
      }, [scope]);

      return createElement("div", { ref: setScope }, props.children);
    }

    function PortalContent() {
      return createPortal(
        createElement(
          FocusScopeLike,
          null,
          createElement("button", { type: "button" }, "Portal action"),
        ),
        document.body,
      );
    }

    function App() {
      const [open, setOpen] = useState(false);
      return createElement(
        "section",
        null,
        createElement("button", { onClick: () => setOpen(true) }, "Open"),
        open ? createElement(PortalContent, null) : null,
      );
    }

    root.render(createElement(App, null));
    container.querySelector("button")?.click();

    expect(document.activeElement?.textContent).toBe("Portal action");
    expect(effects).toEqual(["Portal action"]);

    root.unmount();
    document.body.replaceChildren();
  });

  test("applies multiple owner state updates from a portaled interaction", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    function App() {
      const [open, setOpen] = useState(false);
      const [value, setValue] = useState("alpha");
      return createElement(
        "section",
        null,
        createElement("button", { onClick: () => setOpen(true) }, value),
        open
          ? createPortal(
              createElement(
                "button",
                {
                  onClick: () => {
                    setValue("beta");
                    setOpen(false);
                  },
                },
                "Beta option",
              ),
              document.body,
            )
          : null,
      );
    }

    root.render(createElement(App, null));
    container
      .querySelector("button")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    document.body
      .querySelector("button")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(container.querySelector("button")?.textContent).toBe("beta");
    expect(document.body.querySelector("button")).toBeNull();

    root.unmount();
    document.body.replaceChildren();
  });

  test("removes portal nodes when a stable child component stops returning a portal", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    function PortalGate(props: { open: boolean; onClose(): void }) {
      return props.open
        ? createPortal(
            createElement("button", { onClick: props.onClose }, "Portal close"),
            document.body,
          )
        : null;
    }

    function App() {
      const [open, setOpen] = useState(false);
      return createElement(
        "section",
        null,
        createElement("button", { onClick: () => setOpen(true) }, "Open"),
        createElement(PortalGate, { open, onClose: () => setOpen(false) }),
      );
    }

    root.render(createElement(App, null));
    container
      .querySelector("button")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(document.body.querySelector("button")?.textContent).toBe("Portal close");

    document.body
      .querySelector("button")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(document.body.querySelector("button")).toBeNull();

    root.unmount();
    document.body.replaceChildren();
  });

  test("does not redispatch the same native event through a portal listener mounted during bubbling", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const calls: string[] = [];

    function App() {
      const [open, setOpen] = useState(false);
      return createElement(
        "section",
        null,
        createElement(
          "button",
          {
            onClick: () => {
              calls.push("trigger");
              setOpen(true);
            },
          },
          "Open",
        ),
        open
          ? createPortal(
              createElement(
                "div",
                {
                  onClick: () => {
                    calls.push("portal");
                  },
                },
                "Portal",
              ),
              document.body,
            )
          : null,
      );
    }

    root.render(createElement(App, null));
    container
      .querySelector("button")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(calls).toEqual(["trigger"]);
    expect(document.body.querySelector("div:last-child")?.textContent).toBe("Portal");

    root.unmount();
    document.body.replaceChildren();
  });

  test("preserves foreign document.body children when rendering a portal", () => {
    const container = document.createElement("div");
    const foreign = document.createElement("div");
    foreign.id = "foreign";
    document.body.append(container, foreign);
    const root = createRoot(container);

    try {
      root.render(createPortal(createElement("strong", null, "Portal"), document.body));

      expect(foreign.parentNode).toBe(document.body);
      expect(document.body.querySelector("strong")?.textContent).toBe("Portal");

      root.render(null);

      expect(foreign.parentNode).toBe(document.body);
      expect(document.body.querySelector("strong")).toBeNull();
    } finally {
      root.unmount();
      container.remove();
      foreign.remove();
    }
  });

  test("keeps portal content when the same-root target commits after the portal owner", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    function App() {
      const [target, setTarget] = useState<SVGGElement | null>(null);

      return createElement(
        "svg",
        null,
        target === null
          ? null
          : createPortal(createElement("path", { className: "curve" }), target),
        createElement("g", { ref: setTarget, className: "layer" }),
      );
    }

    root.render(createElement(App, null));

    expect(container.querySelector(".layer")?.innerHTML).toBe('<path class="curve"></path>');
    expect(container.querySelector("svg")?.childNodes).toHaveLength(1);
  });

  test("same-root SVG portal events dispatch from the portal target", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onClick = vi.fn();

    function App() {
      const [target, setTarget] = useState<SVGGElement | null>(null);

      return createElement(
        "svg",
        null,
        createElement("g", { ref: setTarget, className: "layer" }),
        target === null
          ? null
          : createPortal(createElement("path", { className: "curve", onClick }), target),
      );
    }

    root.render(createElement(App, null));
    container
      .querySelector<SVGPathElement>(".curve")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("creates HTML portal children when an SVG owner portals into an HTML container", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    function App() {
      const [target, setTarget] = useState<HTMLDivElement | null>(null);

      return createElement(
        "div",
        null,
        createElement(
          "svg",
          null,
          target === null
            ? null
            : createPortal(
                createElement("div", { "data-svg-owner-html-portal": true }, "Portal"),
                target,
              ),
        ),
        createElement("div", { ref: setTarget, className: "html-portal-target" }),
      );
    }

    root.render(createElement(App, null));

    const portal = container.querySelector("[data-svg-owner-html-portal]");
    expect(portal?.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
    expect(container.querySelector(".html-portal-target")?.textContent).toBe("Portal");
  });

  test("updates an SVG-owned HTML portal from an external store subscription", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let open = false;
    const listeners = new Set<() => void>();

    const store = {
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getSnapshot: () => open,
      set(nextOpen: boolean) {
        open = nextOpen;
        for (const listener of Array.from(listeners)) {
          listener();
        }
      },
    };

    function PortalSubscriber(props: { target: HTMLDivElement | null }) {
      const isOpen = useSyncExternalStore(store.subscribe, store.getSnapshot);
      return isOpen && props.target !== null
        ? createPortal(
            createElement("div", { "data-svg-owner-store-portal": true }, "Store portal"),
            props.target,
          )
        : null;
    }

    function App() {
      const [target, setTarget] = useState<HTMLDivElement | null>(null);

      useEffect(() => {
        store.set(true);
      }, []);

      return createElement(
        "div",
        null,
        createElement("svg", null, createElement(PortalSubscriber, { target })),
        createElement("div", { ref: setTarget, className: "html-store-portal-target" }),
      );
    }

    root.render(createElement(App, null));

    const portal = container.querySelector("[data-svg-owner-store-portal]");
    expect(portal?.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
    expect(container.querySelector(".html-store-portal-target")?.textContent).toBe("Store portal");
  });

  test("keeps sibling SVG host nodes when a fragment also returns an HTML portal", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let open = false;
    const listeners = new Set<() => void>();

    const store = {
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getSnapshot: () => open,
      set(nextOpen: boolean) {
        open = nextOpen;
        for (const listener of Array.from(listeners)) {
          listener();
        }
      },
    };

    function MixedSvgPortal(props: { target: HTMLDivElement | null }) {
      const isOpen = useSyncExternalStore(store.subscribe, store.getSnapshot);
      return createElement(
        Fragment,
        null,
        createElement("path", { className: "edge-path", d: "M0 0L10 10" }),
        isOpen && props.target !== null
          ? createPortal(
              createElement("div", { "data-mixed-svg-html-portal": true }, "Mixed portal"),
              props.target,
            )
          : null,
      );
    }

    function App() {
      const [target, setTarget] = useState<HTMLDivElement | null>(null);

      useEffect(() => {
        store.set(true);
      }, []);

      return createElement(
        "div",
        null,
        createElement("svg", null, createElement("g", null, createElement(MixedSvgPortal, { target }))),
        createElement("div", { ref: setTarget, className: "mixed-html-portal-target" }),
      );
    }

    root.render(createElement(App, null));

    const portal = container.querySelector("[data-mixed-svg-html-portal]");
    expect(container.querySelector(".edge-path")).not.toBeNull();
    expect(portal?.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
    expect(container.querySelector(".mixed-html-portal-target")?.textContent).toBe("Mixed portal");
  });

  test("custom-edge-portal keeps portal content after a memo owner bailout", () => {
    const container = document.createElement("div");
    const portalTarget = document.createElement("div");
    const root = createRoot(container);

    const MemoizedEdgeOwner = memo((props: { target: HTMLDivElement }) =>
      createElement(
        "svg",
        null,
        createElement(
          "g",
          null,
          createElement("path", { className: "memo-bailout-edge-path", d: "M0 0L10 10" }),
          createPortal(
            createElement("div", { "data-memo-bailout-portal": true }, "Memo portal"),
            props.target,
          ),
        ),
      ),
    );

    function App() {
      return createElement(MemoizedEdgeOwner, { target: portalTarget });
    }

    root.render(createElement(App, null));
    expect(portalTarget.textContent).toBe("Memo portal");

    root.render(createElement(App, null));

    expect(container.querySelector(".memo-bailout-edge-path")).not.toBeNull();
    expect(portalTarget.textContent).toBe("Memo portal");
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

  test("hydrateRoot keeps siblings after a reactive DOM block aligned", () => {
    const container = document.createElement("div");
    container.innerHTML = "<span>block</span><em>after</em>";
    const previousSibling = container.querySelector("em");

    hydrateRoot(
      container,
      createElement(
        Fragment,
        null,
        createReactiveDomBlock(() => {
          const node = document.createElement("span");
          node.textContent = "block";
          return { node };
        }),
        createElement("em", null, "after"),
      ),
    );

    expect(container.children).toHaveLength(2);
    expect(container.querySelector("em")).toBe(previousSibling);
    expect(container.innerHTML).toBe("<span>block</span><em>after</em>");
  });

  test("hydrateRoot reuses matching DOM nodes and attaches event handlers", () => {
    const container = document.createElement("div");
    container.innerHTML = "<button>server</button>";
    const button = container.firstChild;
    let clicks = 0;

    hydrateRoot(
      container,
      createElement(
        "button",
        {
          onClick: () => {
            clicks += 1;
          },
        },
        "client",
      ),
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
    const fiberRoot = getFiberRootForContainer(container);
    expect(fiberRoot?.finishedWork).toBeUndefined();
    expect(fiberRoot?.workInProgress).toBeUndefined();
    expect(nextItems[0]).toBe(firstB);
    expect(nextItems[0]?.textContent).toBe("B2");
    expect(nextItems[1]).toBe(firstA);
    expect(nextItems[1]?.textContent).toBe("A2");
  });

  test("render reorders keyed fragments returned from maps without recreating fragment children", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const sections = [
      { id: "intro", title: "Intro" },
      { id: "api", title: "API" },
    ];
    const renderSections = (items: typeof sections) =>
      createElement(
        "dl",
        null,
        items.map((section) =>
          createElement(Fragment, { key: section.id }, [
            createElement("dt", { key: "term" }, section.id),
            createElement("dd", { key: "desc" }, section.title),
          ]),
        ),
      );

    root.render(renderSections(sections));
    const introTerm = container.querySelector("dt");
    const introDescription = container.querySelector("dd");
    const apiTerm = container.querySelectorAll("dt")[1];
    const apiDescription = container.querySelectorAll("dd")[1];

    root.render(renderSections(sections.toReversed()));

    expect(container.innerHTML).toBe(
      "<dl><dt>api</dt><dd>API</dd><dt>intro</dt><dd>Intro</dd></dl>",
    );
    expect(container.querySelectorAll("dt")[0]).toBe(apiTerm);
    expect(container.querySelectorAll("dd")[0]).toBe(apiDescription);
    expect(container.querySelectorAll("dt")[1]).toBe(introTerm);
    expect(container.querySelectorAll("dd")[1]).toBe(introDescription);
  });

  test("append-only keyed rows reuse the unchanged prefix fibers", () => {
    vi.stubEnv("NODE_ENV", "production");
    const container = document.createElement("div");
    const root = createRoot(container);
    const firstRows = [
      createElement("div", { key: 0, "data-key": 0 }, "0"),
      createElement("div", { key: 1, "data-key": 1 }, "1"),
    ];
    const nextRows = [...firstRows, createElement("div", { key: 2, "data-key": 2 }, "2")];

    root.render(createElement(Fragment, null, firstRows));
    const firstRowFiber = getFiberRootForContainer(container)?.current.child?.child;
    const secondRowFiber = firstRowFiber?.sibling;

    root.render(createElement(Fragment, null, nextRows));
    const nextFirstRowFiber = getFiberRootForContainer(container)?.current.child?.child;
    const nextSecondRowFiber = nextFirstRowFiber?.sibling;

    expect(nextFirstRowFiber).toBe(firstRowFiber);
    expect(nextSecondRowFiber).toBe(secondRowFiber);
    expect(container.children).toHaveLength(3);
  });

  test("append-only keyed rows skip deleted subtree cleanup", () => {
    vi.stubEnv("NODE_ENV", "production");
    const container = document.createElement("div");
    const root = createRoot(container);
    const firstRows = Array.from({ length: 3 }, (_, index) =>
      createElement("div", { key: index, "data-key": index }, String(index)),
    );
    const nextRows = [
      ...firstRows,
      createElement("div", { key: 3, "data-key": 3 }, "3"),
    ];

    root.render(createElement(Fragment, null, firstRows));

    const originalAdd = Set.prototype.add;
    let retainedFiberAdds = 0;

    try {
      Set.prototype.add = function countedAdd<T>(this: Set<T>, value: T): Set<T> {
        if (
          typeof value === "object" &&
          value !== null &&
          "tag" in value &&
          "pendingProps" in value &&
          "memoizedProps" in value
        ) {
          retainedFiberAdds += 1;
        }

        return originalAdd.call(this, value);
      };

      root.render(createElement(Fragment, null, nextRows));
    } finally {
      Set.prototype.add = originalAdd;
    }

    expect(retainedFiberAdds).toBeLessThanOrEqual(1);
    expect(container.children).toHaveLength(4);
  });

  test("clears removed direct keyed row fibers from the retained alternate tree", () => {
    vi.stubEnv("NODE_ENV", "production");
    const container = document.createElement("div");
    const root = createRoot(container);
    const rows = Array.from({ length: 20 }, (_, index) =>
      createElement("div", { key: index, "data-key": index }, `Row ${index}`),
    );

    root.render(createElement(Fragment, null, rows));
    root.render(createElement(Fragment, null, rows.filter((row) => row.key !== "10")));

    const deletedFiber = findFiberByKey(
      getFiberRootForContainer(container)?.current.alternate?.child?.child,
      "10",
    );

    expect(deletedFiber?.memoizedProps).toBeUndefined();
    expect(deletedFiber?.pendingProps).toBeUndefined();
    expect(deletedFiber?.stateNode).toBeUndefined();
  });

  test("render detaches refs for removed host children through the Fiber commit path", () => {
    const calls: unknown[] = [];
    const container = document.createElement("div");
    const root = createRoot(container);

    root.render(
      createElement(
        "div",
        null,
        createElement("span", { ref: (node: unknown) => calls.push(node) }, "A"),
      ),
    );
    expect(calls[0]).toBeInstanceOf(HTMLSpanElement);

    root.render(createElement("div", null, null));

    expect(calls).toContain(null);
    expect(container.innerHTML).toBe("<div></div>");
  });

  test("tracks whether the committed host fiber tree contains refs", () => {
    const noRefContainer = document.createElement("div");
    const noRefRoot = createRoot(noRefContainer);

    noRefRoot.render(
      createElement("main", null, [
        createElement("span", { key: "a" }, "A"),
        createElement("span", { key: "b" }, "B"),
      ]),
    );

    const noRefFiberRoot = getFiberRootForContainer(noRefContainer);
    expect(noRefFiberRoot?.refCleanupKnown).toBe(true);
    expect(noRefFiberRoot?.current.hasRefSubtree).toBe(false);

    const withRefContainer = document.createElement("div");
    const withRefRoot = createRoot(withRefContainer);

    withRefRoot.render(
      createElement("main", null, createElement("span", { ref: () => undefined }, "A")),
    );

    const withRefFiberRoot = getFiberRootForContainer(withRefContainer);
    expect(withRefFiberRoot?.refCleanupKnown).toBe(true);
    expect(withRefFiberRoot?.current.hasRefSubtree).toBe(true);
  });

  test("stable function refs are not re-invoked on unrelated prop updates", () => {
    const container = document.createElement("div");
    const calls: string[] = [];
    let setTitle = (_value: string) => {};

    function App() {
      const [title, updateTitle] = useState("before");
      setTitle = updateTitle;
      const ref = useCallback((node: HTMLDivElement | null) => {
        calls.push(node === null ? "null" : "node");
      }, []);

      return createElement("div", { ref, title }, "content");
    }

    createRoot(container).render(createElement(App, null));
    setTitle("after");

    expect(calls).toEqual(["node"]);
  });
});
