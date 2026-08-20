// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import {
  createElement,
  createStreamingHydrationRoot,
  enableEventHydrationManifestReplay,
  enableHydrationEventReplay,
  hydrateRoot,
  queueHydrationEvent,
  readEventHydrationManifest,
  Suspense,
  useId,
  useState,
  useSyncExternalStore,
} from "../src/index.js";
import { getFiberRootForContainer } from "../src/fiber-work-loop.js";

describe("react-compat deep hydration", () => {
  test.each([
    ["text node", "server text", createElement("div", null, "client"), "<div>client</div>"],
    ["comment node", "<!--extension-->", createElement("div", null, "client"), "<div>client</div>"],
    [
      "pretty-printed whitespace",
      "\n<div>client</div>",
      createElement("div", null, "client"),
      "<div>client</div>",
    ],
  ])("recovers when an element position contains a %s", (_name, serverHtml, element, expected) => {
    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    const recoveries: string[] = [];

    expect(() => {
      hydrateRoot(container, element, {
        onRecoverableError(error) {
          recoveries.push(error.message);
        },
      });
    }).not.toThrow();

    expect(container.innerHTML).toBe(expected);
    expect(recoveries.length).toBeGreaterThan(0);
  });

  test("falls back once when a client-only same-tag child shifts hydration", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<div><span class="first" id="one">1</span><span class="second" id="two">2</span></div>';
    const serverSpans = Array.from(container.querySelectorAll("span"));
    const recoveries: Array<{ kind: string; path: string }> = [];

    hydrateRoot(
      container,
      createElement(
        "div",
        null,
        createElement("span", { className: "banner", id: "banner" }, "NEW"),
        createElement("span", { className: "first", id: "one" }, "1"),
        createElement("span", { className: "second", id: "two" }, "2"),
      ),
      {
        onRecoverableError(_error, info) {
          recoveries.push({ kind: info.kind, path: info.path });
        },
      },
    );

    expect(container.innerHTML).toBe(
      '<div><span class="banner" id="banner">NEW</span><span class="first" id="one">1</span><span class="second" id="two">2</span></div>',
    );
    const ids = Array.from(container.querySelectorAll("span"), (span) => span.id);
    expect(ids).toEqual(["banner", "one", "two"]);
    expect(new Set(ids).size).toBe(3);
    expect(serverSpans.every((span) => !container.contains(span))).toBe(true);
    expect(recoveries).toHaveLength(1);
    expect(recoveries[0]?.kind).toBe("text");
  });

  test("falls back once when a same-length same-tag shift only reports text mismatches", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<div><span class="first" id="one">1</span><span class="second" id="two">2</span></div>';
    const serverSpans = Array.from(container.querySelectorAll("span"));
    const recoveries: string[] = [];

    hydrateRoot(
      container,
      createElement(
        "div",
        null,
        createElement("span", { className: "banner", id: "banner" }, "NEW"),
        createElement("span", { className: "first", id: "one" }, "1"),
      ),
      {
        onRecoverableError(_error, info) {
          recoveries.push(info.kind);
        },
      },
    );

    expect(container.innerHTML).toBe(
      '<div><span class="banner" id="banner">NEW</span><span class="first" id="one">1</span></div>',
    );
    expect(serverSpans.every((span) => !container.contains(span))).toBe(true);
    expect(recoveries).toEqual(["text"]);
  });

  test("hydrates dangerouslySetInnerHTML without removing its owned children", () => {
    const container = document.createElement("div");
    container.innerHTML = "<article><strong>server</strong></article>";
    const strong = container.querySelector("strong");
    const recoveries: string[] = [];

    hydrateRoot(
      container,
      createElement("article", {
        dangerouslySetInnerHTML: { __html: "<strong>server</strong>", source: "cms" },
      }),
      {
        onRecoverableError(error) {
          recoveries.push(error.message);
        },
      },
    );

    expect(container.querySelector("strong")).toBe(strong);
    expect(container.innerHTML).toBe("<article><strong>server</strong></article>");
    expect(recoveries).toEqual([]);
  });

  test("replaces mismatched dangerouslySetInnerHTML during hydration", () => {
    const container = document.createElement("div");
    container.innerHTML = "<article><strong>server</strong></article>";
    const recoveries: string[] = [];

    hydrateRoot(
      container,
      createElement("article", {
        dangerouslySetInnerHTML: { __html: "<em>client</em>" },
      }),
      {
        onRecoverableError(error, info) {
          recoveries.push(`${info.kind}:${error.message}`);
        },
      },
    );

    expect(container.innerHTML).toBe("<article><em>client</em></article>");
    expect(recoveries).toEqual(["attribute:Hydration inner HTML mismatch."]);
  });

  test("preserves user-edited uncontrolled form state during hydration", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<form><input name="user" value="server"><input type="checkbox" checked><textarea>server bio</textarea><select><option value="admin" selected>Admin</option><option value="user">User</option></select></form>';
    const input = container.querySelector<HTMLInputElement>('input[name="user"]')!;
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea")!;
    const select = container.querySelector<HTMLSelectElement>("select")!;
    const recoveries: string[] = [];

    input.value = "USER TYPED";
    checkbox.checked = false;
    textarea.value = "USER BIO";
    select.value = "user";

    hydrateRoot(
      container,
      createElement(
        "form",
        null,
        createElement("input", { name: "user", defaultValue: "server" }),
        createElement("input", { type: "checkbox", defaultChecked: true }),
        createElement("textarea", { defaultValue: "server bio" }),
        createElement(
          "select",
          { defaultValue: "admin" },
          createElement("option", { value: "admin" }, "Admin"),
          createElement("option", { value: "user" }, "User"),
        ),
      ),
      {
        onRecoverableError(error) {
          recoveries.push(error.message);
        },
      },
    );

    expect(container.querySelector('input[name="user"]')).toBe(input);
    expect(input.value).toBe("USER TYPED");
    expect(checkbox.checked).toBe(false);
    expect(textarea.value).toBe("USER BIO");
    expect(select.value).toBe("user");
    expect(recoveries).toEqual([]);
  });

  test("applies controlled form state during hydration", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<form><input value="server"><input type="checkbox"><textarea>server</textarea><select><option value="server" selected>Server</option><option value="client">Client</option></select></form>';
    const input = container.querySelector<HTMLInputElement>('input:not([type="checkbox"])')!;
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea")!;
    const select = container.querySelector<HTMLSelectElement>("select")!;

    input.value = "USER";
    checkbox.checked = false;
    textarea.value = "USER";
    select.value = "server";

    hydrateRoot(
      container,
      createElement(
        "form",
        null,
        createElement("input", { value: "client" }),
        createElement("input", { type: "checkbox", checked: true }),
        createElement("textarea", { value: "client" }),
        createElement(
          "select",
          { value: "client" },
          createElement("option", { value: "server" }, "Server"),
          createElement("option", { value: "client" }, "Client"),
        ),
      ),
    );

    expect(input.value).toBe("client");
    expect(checkbox.checked).toBe(true);
    expect(textarea.value).toBe("client");
    expect(select.value).toBe("client");
  });

  test("hydrates adjacent and empty text children from compat SSR without recoveries", () => {
    const container = document.createElement("div");
    const element = createElement(
      "section",
      null,
      createElement("p", null, "Hello, ", "Ada"),
      createElement("p", null, ""),
    );
    container.innerHTML = "<section><p>Hello, <!-- -->Ada</p><p></p></section>";
    const recoveries: string[] = [];

    hydrateRoot(container, element, {
      onRecoverableError(error) {
        recoveries.push(error.message);
      },
    });

    expect(container.textContent).toBe("Hello, Ada");
    expect(recoveries).toEqual([]);
  });

  test("preserves useState across the first hydrated update", () => {
    const container = document.createElement("div");
    container.innerHTML = "<button>0</button>";
    const renders: number[] = [];

    function Counter() {
      const [count, setCount] = useState(0);
      renders.push(count);
      return createElement("button", { onClick: () => setCount(count + 1) }, count);
    }

    hydrateRoot(container, createElement(Counter, null));
    container.querySelector("button")?.click();

    expect(renders).toEqual([0, 1]);
    expect(container.textContent).toBe("1");
  });

  test("preserves nested hook state across the first hydrated update", () => {
    const container = document.createElement("div");
    container.innerHTML = "<main><button>0</button></main>";

    function Counter() {
      const [count, setCount] = useState(0);
      return createElement("button", { onClick: () => setCount(count + 1) }, count);
    }

    function App() {
      return createElement("main", null, createElement(Counter, null));
    }

    hydrateRoot(container, createElement(App, null));
    container.querySelector("button")?.click();

    expect(container.textContent).toBe("1");
  });

  test("useSyncExternalStore keeps the server snapshot for the hydration pass", () => {
    const container = document.createElement("div");
    container.innerHTML = "<p>server</p>";
    const renderedSnapshots: string[] = [];
    const recoveries: string[] = [];
    let snapshot = "client";
    const listeners = new Set<() => void>();

    function StoreLabel() {
      const value = useSyncExternalStore(
        (listener) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        () => snapshot,
        () => "server",
      );
      renderedSnapshots.push(value);
      return createElement("p", null, value);
    }

    hydrateRoot(container, createElement(StoreLabel, null), {
      onRecoverableError(error, info) {
        recoveries.push(`${info.kind}:${error.message}`);
      },
    });

    expect(renderedSnapshots[0]).toBe("server");
    expect(container.innerHTML).toBe("<p>client</p>");
    expect(recoveries).toEqual([]);

    snapshot = "latest";
    for (const listener of listeners) {
      listener();
    }

    expect(container.innerHTML).toBe("<p>latest</p>");
  });

  test("uses client-mode ids for components mounted after hydration", () => {
    const container = document.createElement("div");
    container.innerHTML = "<section></section>";

    function ClientOnlyField() {
      const id = useId();
      return createElement("input", { id });
    }

    function App({ showClientOnly }: { showClientOnly: boolean }) {
      return createElement("section", null, [
        showClientOnly ? createElement(ClientOnlyField, { key: "client" }) : null,
      ]);
    }

    const root = hydrateRoot(container, createElement(App, { showClientOnly: false }), {
      identifierPrefix: "app-",
    });

    root.render(createElement(App, { showClientOnly: true }));

    expect(container.querySelector("input")?.id).toBe("_app-r_0_");
  });

  test("reports one boundary recovery for a structural tag mismatch", () => {
    const container = document.createElement("div");
    container.innerHTML = '<span id="server">server</span>';
    const recoveries: string[] = [];

    hydrateRoot(container, createElement("p", { id: "client" }, "client"), {
      onRecoverableError(error, info) {
        recoveries.push(`${info.kind}:${info.path}:${error.message}`);
      },
    });

    expect(container.innerHTML).toBe('<p id="client">client</p>');
    expect(recoveries).toEqual(["tag:0:Hydration tag mismatch: expected <p> but found <span>."]);
  });

  test("publishes structural recoveries after the hydrated root becomes current", () => {
    const container = document.createElement("div");
    container.innerHTML = "<span>server</span>";
    const recoveries: string[] = [];
    let update!: (value: number) => void;

    function App() {
      const [value, setValue] = useState(0);
      update = setValue;
      return createElement("div", null, String(value));
    }

    hydrateRoot(container, createElement(App, null), {
      onRecoverableError(_error, info) {
        recoveries.push(info.kind);
        if (recoveries.length === 1) {
          update(1);
        }
      },
    });

    expect(container.innerHTML).toBe("<div>1</div>");
    expect(recoveries).toEqual(["tag"]);
  });

  test("preserves style mismatches during hydration like React", () => {
    const container = document.createElement("div");
    container.innerHTML = '<p style="color: red; font-size: 12px;">server</p>';
    const recoveries: string[] = [];

    hydrateRoot(container, createElement("p", { style: { color: "blue" } }, "server"), {
      onRecoverableError(error, info) {
        recoveries.push(`${info.kind}:${info.path}:${error.message}`);
      },
    });

    const paragraph = container.querySelector("p");
    expect(paragraph?.style.color).toBe("red");
    expect(paragraph?.style.fontSize).toBe("12px");
    expect(recoveries).toEqual([]);
  });

  test("preserves boolean attribute mismatches during hydration like React", () => {
    const container = document.createElement("div");
    container.innerHTML = "<button>Save</button>";
    const recoveries: string[] = [];

    hydrateRoot(container, createElement("button", { disabled: true }, "Save"), {
      onRecoverableError(error, info) {
        recoveries.push(`${info.kind}:${info.path}:${error.message}`);
      },
    });

    const button = container.querySelector("button");
    expect(button?.disabled).toBe(false);
    expect(button?.hasAttribute("disabled")).toBe(false);
    expect(recoveries).toEqual([]);
  });

  test("preserves htmlFor attribute mismatches during hydration like React", () => {
    const container = document.createElement("div");
    container.innerHTML = '<label for="server">Name</label>';
    const recoveries: string[] = [];

    hydrateRoot(container, createElement("label", { htmlFor: "client" }, "Name"), {
      onRecoverableError(error, info) {
        recoveries.push(`${info.kind}:${info.path}:${error.message}`);
      },
    });

    const label = container.querySelector("label");
    expect(label?.getAttribute("for")).toBe("server");
    expect(label?.hasAttribute("htmlFor")).toBe(false);
    expect(recoveries).toEqual([]);
  });

  test("reports and removes extra server child nodes during hydration", () => {
    const container = document.createElement("div");
    container.innerHTML = "<div><span>extra</span></div>";
    const recoveries: string[] = [];

    hydrateRoot(container, createElement("div", null), {
      onRecoverableError(error, info) {
        recoveries.push(`${info.kind}:${info.path}:${error.message}`);
      },
    });

    expect(container.innerHTML).toBe("<div></div>");
    expect(recoveries).toContain("node:0.c:Hydration extra node mismatch.");
  });

  test("reports and inserts missing server child nodes during hydration", () => {
    const container = document.createElement("div");
    container.innerHTML = "<ul><li>A</li></ul>";
    const recoveries: string[] = [];

    hydrateRoot(
      container,
      createElement("ul", null, [
        createElement("li", { key: "a" }, "A"),
        createElement("li", { key: "b" }, "B"),
      ]),
      {
        onRecoverableError(error, info) {
          recoveries.push(`${info.kind}:${info.path}:${error.message}`);
        },
      },
    );

    expect(container.innerHTML).toBe("<ul><li>A</li><li>B</li></ul>");
    expect(recoveries).toContain("node:0.c.k:b:Hydration missing node mismatch.");
  });

  test("reports and replaces server elements when the client expects text", () => {
    const container = document.createElement("div");
    container.innerHTML = "<div><span>server</span></div>";
    const recoveries: string[] = [];

    hydrateRoot(container, createElement("div", null, "client"), {
      onRecoverableError(error, info) {
        recoveries.push(`${info.kind}:${info.path}:${error.message}`);
      },
    });

    expect(container.innerHTML).toBe("<div>client</div>");
    expect(recoveries).toContain(
      "node:0.c.0:Hydration node type mismatch: expected text but found <span>.",
    );
  });

  test("passes component stack to recoverable hydration errors", () => {
    const container = document.createElement("div");
    container.innerHTML = "<span>server</span>";
    const recoveries: string[] = [];

    function Label() {
      return createElement("p", null, "client");
    }

    hydrateRoot(container, createElement(Label, null), {
      onRecoverableError(error, info) {
        recoveries.push(`${error.message}${info.componentStack ?? ""}`);
      },
    });

    expect(container.innerHTML).toBe("<p>client</p>");
    expect(recoveries).toContain(
      "Hydration tag mismatch: expected <p> but found <span>.\n    at Label",
    );
  });

  test("passes class component stack to recoverable hydration errors", () => {
    const container = document.createElement("div");
    container.innerHTML = "<span>server</span>";
    const recoveries: string[] = [];

    class Label {
      props: Record<string, unknown>;

      constructor(props: Record<string, unknown>) {
        this.props = props;
      }

      render() {
        return createElement("p", null, "client");
      }
    }

    hydrateRoot(container, createElement(Label, null), {
      onRecoverableError(error, info) {
        recoveries.push(`${error.message}${info.componentStack ?? ""}`);
      },
    });

    expect(container.innerHTML).toBe("<p>client</p>");
    expect(recoveries).toContain(
      "Hydration tag mismatch: expected <p> but found <span>.\n    at Label",
    );
  });

  test("replays queued click events after handler attachment", () => {
    const container = document.createElement("div");
    container.innerHTML = "<button>Save</button>";
    const button = container.querySelector("button");
    let clicks = 0;

    if (button === null) {
      throw new Error("Expected server button.");
    }

    queueHydrationEvent(container, new MouseEvent("click", { bubbles: true }), button);
    hydrateRoot(
      container,
      createElement(
        "button",
        {
          onClick: () => {
            clicks += 1;
          },
        },
        "Save",
      ),
    );

    expect(clicks).toBe(1);
  });

  test("captures replayable browser events before hydration", () => {
    const container = document.createElement("div");
    container.innerHTML = "<button>Save</button>";
    const button = container.querySelector("button");
    let clicks = 0;

    if (button === null) {
      throw new Error("Expected server button.");
    }

    const disposeReplayCapture = enableHydrationEventReplay(container);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    hydrateRoot(
      container,
      createElement(
        "button",
        {
          onClick: () => {
            clicks += 1;
          },
        },
        "Save",
      ),
    );
    disposeReplayCapture();

    expect(clicks).toBe(1);
  });

  test("captured replay events do not reach pre-hydration listeners", () => {
    const container = document.createElement("div");
    container.innerHTML = "<button>Save</button>";
    const button = container.querySelector("button");
    let preHydrationClicks = 0;
    let hydratedClicks = 0;

    if (button === null) {
      throw new Error("Expected server button.");
    }

    const preHydrationListener = () => {
      preHydrationClicks += 1;
    };
    button.addEventListener("click", preHydrationListener);

    const disposeReplayCapture = enableHydrationEventReplay(container);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    button.removeEventListener("click", preHydrationListener);

    hydrateRoot(
      container,
      createElement(
        "button",
        {
          onClick: () => {
            hydratedClicks += 1;
          },
        },
        "Save",
      ),
    );
    disposeReplayCapture();

    expect(preHydrationClicks).toBe(0);
    expect(hydratedClicks).toBe(1);
  });

  test("captures only events listed in the server event hydration manifest", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<button>Save</button><input value="server"><script type="application/json" data-mreact-event-manifest>{"version":1,"events":[{"id":"App:0","event":"click","handler":"onClick"}]}</script>';
    const button = container.querySelector("button");
    const input = container.querySelector("input");
    let preHydrationClicks = 0;
    let preHydrationInputs = 0;
    let hydratedClicks = 0;

    if (button === null || input === null) {
      throw new Error("Expected server controls.");
    }

    const preHydrationClickListener = () => {
      preHydrationClicks += 1;
    };
    button.addEventListener("click", preHydrationClickListener);
    input.addEventListener("input", () => {
      preHydrationInputs += 1;
    });

    const manifest = readEventHydrationManifest(container);
    const disposeReplayCapture = enableEventHydrationManifestReplay(container, manifest);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    button.removeEventListener("click", preHydrationClickListener);

    hydrateRoot(container, [
      createElement(
        "button",
        {
          onClick: () => {
            hydratedClicks += 1;
          },
        },
        "Save",
      ),
      createElement("input", { value: "client" }),
    ]);
    disposeReplayCapture();

    expect(preHydrationClicks).toBe(0);
    expect(preHydrationInputs).toBe(1);
    expect(hydratedClicks).toBe(1);
  });

  test("uses resume boundary markers as hydration scope", () => {
    const container = document.createElement("div");
    container.innerHTML =
      "<span>outside</span><!--mreact-h:start:app--><button>client</button><!--mreact-h:end:app-->";
    const outside = container.querySelector("span");
    const serverButton = container.querySelector("button");

    hydrateRoot(container, createElement("button", null, "client"), { resumeId: "app" });

    expect(container.querySelector("span")).toBe(outside);
    expect(container.querySelector("button")).toBe(serverButton);
    expect(container.innerHTML).toBe(
      "<span>outside</span><!--mreact-h:start:app--><button>client</button><!--mreact-h:end:app-->",
    );

    const fiberRoot = getFiberRootForContainer(container);
    expect(fiberRoot?.hydrationState?.resumeId).toBe("app");
    expect(fiberRoot?.current.child?.tag).toBe("host-component");
  });

  test("reuses keyed list DOM nodes inside resume hydration scope and replays events", () => {
    const container = document.createElement("div");
    container.innerHTML =
      "<!--mreact-h:start:catalog--><div><ul><li>A<!-- --> <button>add</button></li><li>B<!-- --> <button>add</button></li></ul><p>in cart: <!-- -->0</p></div><!--mreact-h:end:catalog-->";
    const beforeItems = Array.from(container.querySelectorAll("li"));
    const beforeButtons = Array.from(container.querySelectorAll("button"));
    let clicks = 0;

    const catalog = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ];

    if (beforeButtons[0] === undefined) {
      throw new Error("Expected server button.");
    }

    queueHydrationEvent(container, new MouseEvent("click", { bubbles: true }), beforeButtons[0]);
    hydrateRoot(
      container,
      createElement(
        "div",
        null,
        createElement(
          "ul",
          null,
          catalog.map((item) =>
            createElement(
              "li",
              { key: item.id },
              item.name,
              " ",
              createElement(
                "button",
                {
                  onClick: () => {
                    clicks += 1;
                  },
                },
                "add",
              ),
            ),
          ),
        ),
        createElement("p", null, "in cart: ", clicks),
      ),
      { resumeId: "catalog" },
    );

    Array.from(container.querySelectorAll("li")).forEach((item, index) => {
      expect(item).toBe(beforeItems[index]);
    });
    Array.from(container.querySelectorAll("button")).forEach((button, index) => {
      expect(button).toBe(beforeButtons[index]);
    });
    expect(clicks).toBe(1);
  });

  test("can consume resume boundary markers after hydration", () => {
    const container = document.createElement("div");
    container.innerHTML =
      "<span>outside</span><!--mreact-h:start:app--><button>server</button><!--mreact-h:end:app-->";

    hydrateRoot(container, createElement("button", null, "client"), {
      resumeId: "app",
      consumeResumeMarkers: true,
    });

    expect(container.innerHTML).toBe("<span>outside</span><button>client</button>");
  });

  test("keeps a consumed resume scope across repeated updates and unmount", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<header id="hdr">HEADER</header><!--mreact-h:start:app--><button>0</button><!--mreact-h:end:app--><footer id="ftr">FOOTER</footer>';
    const header = container.querySelector("header");
    const footer = container.querySelector("footer");

    function Counter() {
      const [count, setCount] = useState(0);
      return createElement("button", { onClick: () => setCount((value) => value + 1) }, count);
    }

    const root = hydrateRoot(container, createElement(Counter, null), {
      resumeId: "app",
      consumeResumeMarkers: true,
    });
    const button = container.querySelector("button")!;

    expect(container.querySelector("header")).toBe(header);
    expect(container.querySelector("footer")).toBe(footer);
    expect(container.innerHTML).not.toContain("mreact-h:");

    button.click();
    expect(button.textContent).toBe("1");
    expect(container.querySelector("header")).toBe(header);
    expect(container.querySelector("footer")).toBe(footer);

    button.click();
    expect(button.textContent).toBe("2");
    expect(container.querySelector("header")).toBe(header);
    expect(container.querySelector("footer")).toBe(footer);

    root.unmount();
    expect(container.innerHTML).toBe(
      '<header id="hdr">HEADER</header><footer id="ftr">FOOTER</footer>',
    );
    expect(container.querySelector("header")).toBe(header);
    expect(container.querySelector("footer")).toBe(footer);
  });

  test("keeps resume boundary scope when a hydrated Suspense boundary retries", async () => {
    const container = document.createElement("div");
    container.innerHTML =
      "<span>outside</span><!--mreact-h:start:app--><em>loading</em><!--mreact-h:end:app-->";
    const outside = container.querySelector("span");
    let ready = false;
    let resolvePromise: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    function AsyncChild() {
      if (!ready) {
        throw pending;
      }

      return createElement("strong", null, "ready");
    }

    hydrateRoot(
      container,
      createElement(
        Suspense,
        { fallback: createElement("em", null, "loading") },
        createElement(AsyncChild, null),
      ),
      { resumeId: "app" },
    );

    expect(container.querySelector("span")).toBe(outside);
    expect(container.innerHTML).toBe(
      "<span>outside</span><!--mreact-h:start:app--><em>loading</em><!--mreact-h:end:app-->",
    );

    ready = true;
    resolvePromise();
    await pending;
    await Promise.resolve();

    expect(container.querySelector("span")).toBe(outside);
    expect(container.innerHTML).toBe(
      "<span>outside</span><!--mreact-h:start:app--><strong>ready</strong><!--mreact-h:end:app-->",
    );
  });

  test("hydrates and consumes completed React Suspense comment markers", () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--$--><span>ready</span><!--/$-->";
    const serverSpan = container.querySelector("span");

    hydrateRoot(
      container,
      createElement(
        Suspense,
        { fallback: createElement("em", null, "loading") },
        createElement("span", null, "ready"),
      ),
    );

    expect(container.querySelector("span")).toBe(serverSpan);
    expect(container.innerHTML).toBe("<span>ready</span>");

    const fiberRoot = getFiberRootForContainer(container);
    expect(fiberRoot?.finishedWork).toBeUndefined();
    expect(fiberRoot?.workInProgress).toBeUndefined();
    expect(fiberRoot?.current.child?.tag).toBe("suspense");
    expect(fiberRoot?.current.child?.memoizedState).toEqual({
      didSuspend: false,
    });
  });

  test("hydrates and consumes pending React Suspense fallback markers", () => {
    const container = document.createElement("div");
    container.innerHTML = '<!--$?--><template id="B:0"></template><em>loading</em><!--/$-->';
    const serverFallback = container.querySelector("em");
    const pending = new Promise<void>(() => {});

    function AsyncChild(): never {
      throw pending;
    }

    hydrateRoot(
      container,
      createElement(
        Suspense,
        { fallback: createElement("em", null, "loading") },
        createElement(AsyncChild, null),
      ),
    );

    expect(container.querySelector("em")).toBe(serverFallback);
    expect(container.innerHTML).toBe("<em>loading</em>");

    const fiberRoot = getFiberRootForContainer(container);
    expect(fiberRoot?.finishedWork).toBeUndefined();
    expect(fiberRoot?.workInProgress).toBeUndefined();
    expect(fiberRoot?.current.child?.tag).toBe("suspense");
    expect(fiberRoot?.current.child?.memoizedState).toEqual({
      didSuspend: true,
    });
  });

  test("reports React Suspense server error markers and hydrates client content", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<!--$!--><template data-msg="server boom" data-stck="\n    at ServerName"></template><em>retry</em><!--/$-->';
    const recoveries: string[] = [];

    hydrateRoot(
      container,
      createElement(
        Suspense,
        { fallback: createElement("em", null, "loading") },
        createElement("strong", null, "client ready"),
      ),
      {
        onRecoverableError(error, info) {
          recoveries.push(`${info.kind}:${error.message}:${info.componentStack ?? ""}`);
        },
      },
    );

    expect(container.innerHTML).toBe("<strong>client ready</strong>");
    expect(recoveries).toEqual(["suspense-server-error:server boom:\n    at ServerName"]);
  });

  test("keeps DOM outside React Suspense markers when pending boundary retries", async () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<span>outside</span><!--$?--><template id="B:0"></template><em>loading</em><!--/$-->';
    const outside = container.querySelector("span");
    const fallback = container.querySelector("em");
    let ready = false;
    let resolvePromise: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    function AsyncChild() {
      if (!ready) {
        throw pending;
      }

      return createElement("strong", null, "ready");
    }

    hydrateRoot(container, [
      createElement("span", null, "outside"),
      createElement(
        Suspense,
        { fallback: createElement("em", null, "loading") },
        createElement(AsyncChild, null),
      ),
    ]);

    expect(container.querySelector("span")).toBe(outside);
    expect(container.querySelector("em")).toBe(fallback);
    expect(container.innerHTML).toBe("<span>outside</span><em>loading</em>");

    ready = true;
    resolvePromise();
    await pending;
    await Promise.resolve();

    expect(container.querySelector("span")).toBe(outside);
    expect(container.innerHTML).toBe("<span>outside</span><strong>ready</strong>");
  });

  test("selectively hydrates only the event target resume boundary from a manifest event", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<!--mreact-h:start:left--><button>left 0</button><!--mreact-h:end:left--><!--mreact-h:start:right--><button>right</button><!--mreact-h:end:right--><script type="application/json" data-mreact-event-manifest>{"version":1,"events":[{"id":"left:0","event":"click","handler":"onClick"},{"id":"right:0","event":"click","handler":"onClick"}]}</script>';
    const leftButton = container.querySelector("button");
    const rightButton = container.querySelectorAll("button")[1];
    let rightClicks = 0;

    if (leftButton === null) {
      throw new Error("Expected left button.");
    }

    function LeftCounter() {
      const [count, setCount] = useState(0);
      return createElement(
        "button",
        { onClick: () => setCount((value) => value + 1) },
        `left ${count}`,
      );
    }

    const streamingRoot = createStreamingHydrationRoot(container, {
      selectiveHydration: {
        boundaries: {
          left: {
            element: createElement(LeftCounter, null),
          },
          right: {
            element: createElement(
              "button",
              {
                onClick: () => {
                  rightClicks += 1;
                },
              },
              "right",
            ),
          },
        },
      },
    });

    leftButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(leftButton.textContent).toBe("left 1");
    expect(rightClicks).toBe(0);
    expect(container.innerHTML).not.toContain("<!--mreact-h:start:left-->");
    expect(container.innerHTML).not.toContain("<!--mreact-h:end:left-->");
    expect(container.innerHTML).toContain("<!--mreact-h:start:right-->");
    expect(container.innerHTML).toContain("<!--mreact-h:end:right-->");
    expect(container.querySelectorAll("button")[1]).toBe(rightButton);

    leftButton.click();
    expect(leftButton.textContent).toBe("left 2");
    expect(container.querySelectorAll("button")[1]).toBe(rightButton);
    expect(container.innerHTML).toContain("<!--mreact-h:start:right-->");

    streamingRoot.dispose();
  });

  test("replays the triggering event on a structurally recovered resume boundary", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<!--mreact-h:start:action--><div><button id="one">one</button><button id="two">two</button></div><!--mreact-h:end:action--><script type="application/json" data-mreact-event-manifest>{"version":1,"events":[{"id":"action:0","event":"click","handler":"onClick"}]}</script>';
    const serverButton = container.querySelector<HTMLButtonElement>("#one");
    let clicks = 0;

    if (serverButton === null) {
      throw new Error("Expected server button.");
    }

    const streamingRoot = createStreamingHydrationRoot(container, {
      selectiveHydration: {
        boundaries: {
          action: {
            element: createElement("div", null, [
              createElement("button", { id: "banner" }, "new"),
              createElement(
                "button",
                {
                  id: "one",
                  onClick: () => {
                    clicks += 1;
                  },
                },
                "one",
              ),
              createElement("button", { id: "two" }, "two"),
            ]),
          },
        },
      },
    });

    serverButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(container.querySelector("div")?.textContent).toBe("newonetwo");
    expect(container.querySelector("#one")).not.toBe(serverButton);
    expect(clicks).toBe(1);
    streamingRoot.dispose();
  });

  test("does not retarget a recovered event by a shifted element index", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<!--mreact-h:start:action--><div><button>one</button><button>two</button></div><!--mreact-h:end:action--><script type="application/json" data-mreact-event-manifest>{"version":1,"events":[{"id":"action:0","event":"click","handler":"onClick"}]}</script>';
    const serverButton = container.querySelector("button");
    let bannerClicks = 0;
    let originalClicks = 0;

    if (serverButton === null) {
      throw new Error("Expected server button.");
    }

    const streamingRoot = createStreamingHydrationRoot(container, {
      selectiveHydration: {
        boundaries: {
          action: {
            element: createElement("div", null, [
              createElement(
                "button",
                {
                  onClick: () => {
                    bannerClicks += 1;
                  },
                },
                "new",
              ),
              createElement(
                "button",
                {
                  onClick: () => {
                    originalClicks += 1;
                  },
                },
                "one",
              ),
            ]),
          },
        },
      },
    });

    serverButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(bannerClicks).toBe(0);
    expect(originalClicks).toBe(0);
    streamingRoot.dispose();
  });

  test("selective hydration ignores manifest events outside a matching resume boundary", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<button>outside</button><!--mreact-h:start:left--><button>left</button><!--mreact-h:end:left--><script type="application/json" data-mreact-event-manifest>{"version":1,"events":[{"id":"left:0","event":"click","handler":"onClick"}]}</script>';
    const outsideButton = container.querySelector("button");
    let leftClicks = 0;

    if (outsideButton === null) {
      throw new Error("Expected outside button.");
    }

    const streamingRoot = createStreamingHydrationRoot(container, {
      selectiveHydration: {
        boundaries: {
          left: {
            element: createElement(
              "button",
              {
                onClick: () => {
                  leftClicks += 1;
                },
              },
              "left",
            ),
          },
        },
      },
    });

    outsideButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(leftClicks).toBe(0);
    expect(container.innerHTML).toContain("<!--mreact-h:start:left-->");
    expect(container.innerHTML).toContain("<!--mreact-h:end:left-->");

    streamingRoot.dispose();
  });
});
