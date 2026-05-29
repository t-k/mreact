// @vitest-environment happy-dom

import { afterEach, describe, expect, test, vi } from "vitest";
import {
  Fragment,
  createElement,
  createPortal,
  createRoot,
  flushSync,
  hydrateRoot,
  render,
  unmountComponentAtNode,
  useLayoutEffect,
  useState,
} from "../src/index.js";
import { getFiberRootForContainer } from "../src/fiber-work-loop.js";
import { getAppliedProps } from "../src/host-event-binder.js";

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

    expect(container.innerHTML).toBe(
      '<div contenteditable="true"><p dir="auto"><br></p></div>',
    );
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
        createElement("a", {
          href: "/msgs",
          __self: { component: "TransLink" },
          __source: { fileName: "Trans.jsx", lineNumber: 13 },
        }, "there"),
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

    flushSync(() =>
      root.render(createElement("div", { className: "row", "data-key": 1 }, "A")),
    );

    const setAttribute = vi.spyOn(Element.prototype, "setAttribute");
    flushSync(() =>
      root.render(createElement("div", { className: "row", "data-key": 1 }, "A")),
    );

    expect(setAttribute).not.toHaveBeenCalled();
  });

  test("compares unchanged host props without Object.keys allocations", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    flushSync(() =>
      root.render(createElement("div", { "data-key": 1, title: "row" }, "A")),
    );

    const originalKeys = Object.keys;
    let objectKeyCalls = 0;
    Object.keys = ((value) => {
      objectKeyCalls += 1;
      return originalKeys(value);
    }) as typeof Object.keys;
    try {
      flushSync(() =>
        root.render(createElement("div", { "data-key": 1, title: "row" }, "A")),
      );
    } finally {
      Object.keys = originalKeys;
    }

    expect(objectKeyCalls).toBe(0);
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
      createElement(
        "div",
        { className: undefined, "data-selected": undefined },
        "row",
      ),
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

  test("normalizes camel-case mouse over and out events", () => {
    const container = document.createElement("div");
    const calls: string[] = [];

    render(
      createElement("button", {
        onMouseOver: () => { calls.push("over"); },
        onMouseOut: () => { calls.push("out"); },
      }, "Hover"),
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
          onMouseEnter: () => { calls.push("parent:enter"); },
          onMouseLeave: () => { calls.push("parent:leave"); },
        },
        createElement("button", {
          onMouseEnter: () => { calls.push("child:enter"); },
          onMouseLeave: () => { calls.push("child:leave"); },
        }, "Hover"),
      ),
      container,
    );

    const parent = container.querySelector("div");
    const child = container.querySelector("button");

    child?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    parent?.dispatchEvent(
      new MouseEvent("mouseover", { bubbles: true, relatedTarget: child }),
    );
    child?.dispatchEvent(
      new MouseEvent("mouseout", { bubbles: true, relatedTarget: parent }),
    );
    parent?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));

    expect(calls).toEqual([
      "parent:enter",
      "child:enter",
      "child:leave",
      "parent:leave",
    ]);
  });

  test("normalizes React multi-word and composition event names", () => {
    const container = document.createElement("div");
    const calls: string[] = [];

    render(
      createElement("input", {
        onBeforeInput: () => { calls.push("beforeinput"); },
        onCompositionStart: () => { calls.push("compositionstart"); },
        onCompositionUpdate: () => { calls.push("compositionupdate"); },
        onCompositionEnd: () => { calls.push("compositionend"); },
        onContextMenu: () => { calls.push("contextmenu"); },
        onDragEnter: () => { calls.push("dragenter"); },
        onTouchStart: () => { calls.push("touchstart"); },
      }),
      container,
    );

    const input = container.querySelector("input");
    input?.dispatchEvent(new InputEvent("beforeinput", { bubbles: true }));
    input?.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    input?.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true }));
    input?.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    input?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    input?.dispatchEvent(new DragEvent("dragenter", { bubbles: true }));
    input?.dispatchEvent(new Event("touchstart", { bubbles: true }));

    expect(calls).toEqual([
      "beforeinput",
      "compositionstart",
      "compositionupdate",
      "compositionend",
      "contextmenu",
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
          onPointerEnter: () => { calls.push("parent:enter"); },
          onPointerLeave: () => { calls.push("parent:leave"); },
        },
        createElement("button", {
          onPointerEnter: () => { calls.push("child:enter"); },
          onPointerLeave: () => { calls.push("child:leave"); },
        }, "Hover"),
      ),
      container,
    );

    const parent = container.querySelector("div");
    const child = container.querySelector("button");

    child?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    parent?.dispatchEvent(
      new MouseEvent("pointerover", { bubbles: true, relatedTarget: child }),
    );
    child?.dispatchEvent(
      new MouseEvent("pointerout", { bubbles: true, relatedTarget: parent }),
    );
    parent?.dispatchEvent(new MouseEvent("pointerout", { bubbles: true }));

    expect(calls).toEqual([
      "parent:enter",
      "child:enter",
      "child:leave",
      "parent:leave",
    ]);
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
      createElement("button", {
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
      }, "Click"),
      container,
    );

    container.querySelector("button")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );

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
        { onClick: () => { calls.push("owner"); } },
        createPortal(
          createElement("button", { onClick: () => { calls.push("portal"); } }, "Portal"),
          portalTarget,
        ),
      ),
      container,
    );

    portalTarget.querySelector("button")?.click();

    expect(calls).toEqual(["portal", "owner"]);
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
      return mounted
        ? createPortal(createElement("strong", null, "Portal"), document.body)
        : null;
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
    container.querySelector<SVGPathElement>(".curve")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );

    expect(onClick).toHaveBeenCalledTimes(1);
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
    const fiberRoot = getFiberRootForContainer(container);
    expect(fiberRoot?.finishedWork).toBeUndefined();
    expect(fiberRoot?.workInProgress).toBeUndefined();
    expect(nextItems[0]).toBe(firstB);
    expect(nextItems[0]?.textContent).toBe("B2");
    expect(nextItems[1]).toBe(firstA);
    expect(nextItems[1]?.textContent).toBe("A2");
  });

  test("append-only keyed rows reuse the unchanged prefix fibers", () => {
    vi.stubEnv("NODE_ENV", "production");
    const container = document.createElement("div");
    const root = createRoot(container);
    const firstRows = [
      createElement("div", { key: 0, "data-key": 0 }, "0"),
      createElement("div", { key: 1, "data-key": 1 }, "1"),
    ];
    const nextRows = [
      ...firstRows,
      createElement("div", { key: 2, "data-key": 2 }, "2"),
    ];

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
      createElement(
        "main",
        null,
        createElement("span", { ref: () => undefined }, "A"),
      ),
    );

    const withRefFiberRoot = getFiberRootForContainer(withRefContainer);
    expect(withRefFiberRoot?.refCleanupKnown).toBe(true);
    expect(withRefFiberRoot?.current.hasRefSubtree).toBe(true);
  });
});
