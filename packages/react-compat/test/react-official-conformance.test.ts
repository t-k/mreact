// @vitest-environment happy-dom

import * as React from "react";
import { act } from "react";
import { createPortal as createReactPortal } from "react-dom";
import { createRoot as createReactRoot, hydrateRoot as hydrateReactRoot } from "react-dom/client";
import { renderToString as renderReactToString } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as Compat from "../src/index.js";

type RuntimeApi = {
  Component: typeof React.Component;
  Fragment: unknown;
  PureComponent: typeof React.PureComponent;
  StrictMode: unknown;
  Children: {
    count(children: unknown): number;
    map<T>(children: unknown, fn: (child: unknown, index: number) => T): T[] | null;
    only(children: unknown): unknown;
    toArray(children: unknown): unknown[];
  };
  cloneElement: (element: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => unknown;
  createContext: <T>(defaultValue: T) => unknown;
  createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => unknown;
  createPortal: (children: unknown, container: Element, key?: unknown) => unknown;
  createRef: <T>() => { current: T | null };
  forwardRef: (render: (props: Record<string, unknown>, ref: unknown) => unknown) => unknown;
  memo: (
    component: (props: Record<string, unknown>) => unknown,
    compare?: (previous: Record<string, unknown>, next: Record<string, unknown>) => boolean,
  ) => unknown;
  useContext: <T>(context: unknown) => T;
  useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => void;
  useId: () => string;
  useImperativeHandle: <T>(ref: unknown, create: () => T, deps?: readonly unknown[]) => void;
  useInsertionEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => void;
  useLayoutEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => void;
  useMemo: <T>(factory: () => T, deps: readonly unknown[]) => T;
  useReducer: <TState, TAction>(
    reducer: (state: TState, action: TAction) => TState,
    initialArg: TState,
  ) => [TState, (action: TAction) => void];
  useRef: <T>(initial: T) => { current: T };
  useState: <T>(initial: T | (() => T)) => [T, (value: T | ((previous: T) => T)) => void];
  useSyncExternalStore: <T>(
    subscribe: (listener: () => void) => () => void,
    getSnapshot: () => T,
    getServerSnapshot?: () => T,
  ) => T;
  useTransition: () => [boolean, (scope: () => void) => void];
  useDeferredValue: <T>(value: T) => T;
};

type ElementFactory = (api: RuntimeApi) => unknown;

const reactApi: RuntimeApi = {
  ...(React as unknown as RuntimeApi),
  createPortal: createReactPortal,
};
const compatApi: RuntimeApi = Compat as unknown as RuntimeApi;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("react-compat official React conformance", () => {
  test.each([
    {
      name: "renders host elements, attributes, styles, and escaped text on the server",
      createElement(api: RuntimeApi) {
        return api.createElement(
          "main",
          { className: "page", style: { color: "red", marginTop: "2px" } },
          api.createElement("h1", null, "Hello <Ada>"),
          api.createElement("input", { disabled: true, value: "fixed", readOnly: true }),
        );
      },
    },
    {
      name: "renders fragments, arrays, null, and boolean children on the server",
      createElement(api: RuntimeApi) {
        return api.createElement(
          api.Fragment,
          null,
          [
            api.createElement("span", { key: "a" }, "A"),
            null,
            false,
            api.createElement("span", { key: "b" }, "B"),
          ],
        );
      },
    },
    {
      name: "renders stable useId output on the server",
      createElement(api: RuntimeApi) {
        function Field() {
          const id = api.useId();
          return api.createElement(
            "label",
            { htmlFor: id },
            "Name",
            api.createElement("input", { id }),
          );
        }

        return api.createElement(Field, null);
      },
    },
    {
      name: "renders context providers and consumers on the server",
      createElement(api: RuntimeApi) {
        const Theme = api.createContext("light") as {
          Provider: unknown;
          Consumer: unknown;
        };

        return api.createElement(
          Theme.Provider,
          { value: "dark" },
          api.createElement(Theme.Consumer, null, (value: string) =>
            api.createElement("p", null, value),
          ),
        );
      },
    },
    {
      name: "renders memoized components and useMemo results on the server",
      createElement(api: RuntimeApi) {
        const Label = api.memo((props: Record<string, unknown>) => {
          const value = api.useMemo(
            () => String(props.value).toUpperCase(),
            [props.value],
          );
          return api.createElement("strong", null, value);
        });

        return api.createElement(Label, { value: "ada" });
      },
    },
    {
      name: "renders cloned children on the server",
      createElement(api: RuntimeApi) {
        const child = api.createElement("span", { className: "old" }, "old");

        return api.createElement(
          "div",
          null,
          api.cloneElement(child, { className: "new" }, "new"),
        );
      },
    },
    {
      name: "renders form default values on the server",
      createElement(api: RuntimeApi) {
        return api.createElement(
          "form",
          null,
          api.createElement("textarea", { defaultValue: "Ada" }),
          api.createElement(
            "select",
            { defaultValue: "b" },
            api.createElement("option", { value: "a" }, "A"),
            api.createElement("option", { value: "b" }, "B"),
          ),
        );
      },
    },
  ])("$name", ({ createElement }) => {
    expect(renderCompatElementToString(createElement)).toBe(
      renderReactElementToString(createElement),
    );
  });

  test("matches React.Children traversal helpers", () => {
    function createChildren(api: RuntimeApi) {
      return [
        api.createElement("span", { key: "a" }, "A"),
        [null, false, api.createElement("span", { key: "b" }, "B")],
      ];
    }

    const reactChildren = createChildren(reactApi);
    const compatChildren = createChildren(compatApi);
    const react = {
      count: reactApi.Children.count(reactChildren),
      mapped: reactApi.Children.map(reactChildren, (_child, index) => index),
      onlyThrows: throws(() => reactApi.Children.only(reactChildren)),
      toArrayLength: reactApi.Children.toArray(reactChildren).length,
    };
    const compat = {
      count: compatApi.Children.count(compatChildren),
      mapped: compatApi.Children.map(compatChildren, (_child, index) => index),
      onlyThrows: throws(() => compatApi.Children.only(compatChildren)),
      toArrayLength: compatApi.Children.toArray(compatChildren).length,
    };

    expect(compat).toEqual(react);
  });

  test.each([
    {
      name: "mounts function components and updates state from a click",
      createElement(api: RuntimeApi, log: string[]) {
        function Counter() {
          const [count, setCount] = api.useState(0);
          log.push(`render:${count}`);
          return api.createElement(
            "button",
            { onClick: () => { setCount((value) => value + 1); } },
            `count:${count}`,
          );
        }

        return api.createElement(Counter, null);
      },
      interact(container: Element) {
        container.querySelector("button")?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      },
    },
    {
      name: "bubbles synthetic click events through parents after child handlers",
      createElement(api: RuntimeApi, log: string[]) {
        return api.createElement(
          "div",
          { onClick: () => { log.push("parent"); } },
          api.createElement("button", { onClick: () => { log.push("child"); } }, "Save"),
        );
      },
      interact(container: Element) {
        container.querySelector("button")?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      },
    },
    {
      name: "keeps reducer dispatch behavior aligned with React",
      createElement(api: RuntimeApi, log: string[]) {
        function Counter() {
          const [count, dispatch] = api.useReducer(
            (state: number, action: { type: "inc" }) =>
              action.type === "inc" ? state + 1 : state,
            0,
          );
          log.push(`render:${count}`);
          return api.createElement(
            "button",
            { onClick: () => { dispatch({ type: "inc" }); } },
            `count:${count}`,
          );
        }

        return api.createElement(Counter, null);
      },
      interact(container: Element) {
        container.querySelector("button")?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      },
    },
    {
      name: "runs insertion, layout, and passive effects in React order",
      createElement(api: RuntimeApi, log: string[]) {
        function Effects() {
          api.useInsertionEffect(() => {
            log.push("insertion");
          }, []);
          api.useLayoutEffect(() => {
            log.push("layout");
          }, []);
          api.useEffect(() => {
            log.push("effect");
          }, []);
          return api.createElement("p", null, "effects");
        }

        return api.createElement(Effects, null);
      },
      interact() {
        return;
      },
    },
    {
      name: "reads the current provider value through useContext",
      createElement(api: RuntimeApi) {
        const Theme = api.createContext("light") as { Provider: unknown };

        function Label() {
          const value = api.useContext<string>(Theme);
          return api.createElement("p", null, value);
        }

        return api.createElement(
          Theme.Provider,
          { value: "dark" },
          api.createElement(Label, null),
        );
      },
      interact() {
        return;
      },
    },
  ])("$name", async ({ createElement, interact }) => {
    const react = await renderReactDomConformance(createElement, interact);
    const compat = await renderCompatDomConformance(createElement, interact);

    expect(compat).toEqual(react);
  });

  test("keeps forwardRef host refs aligned with React", async () => {
    function createElement(api: RuntimeApi, log: string[]) {
      const ref = { current: null as Element | null };
      const Button = api.forwardRef((props, forwardedRef) =>
        api.createElement("button", { ref: forwardedRef }, props.label),
      );

      function App() {
        api.useLayoutEffect(() => {
          log.push(ref.current?.tagName ?? "missing");
        }, []);
        return api.createElement(Button, { label: "Save", ref });
      }

      return api.createElement(App, null);
    }

    const react = await renderReactDomConformance(createElement, () => undefined);
    const compat = await renderCompatDomConformance(createElement, () => undefined);

    expect(compat).toEqual(react);
  });

  test("exposes imperative handles with React timing", async () => {
    function createElement(api: RuntimeApi, log: string[]) {
      type Handle = { focusLabel(): string };
      const ref = { current: null as Handle | null };
      const Field = api.forwardRef((_props, forwardedRef) => {
        api.useImperativeHandle(
          forwardedRef,
          () => ({
            focusLabel: () => "focused",
          }),
          [],
        );
        return api.createElement("input", { defaultValue: "Ada" });
      });

      function App() {
        api.useLayoutEffect(() => {
          log.push(ref.current?.focusLabel() ?? "missing");
        }, []);
        return api.createElement(Field, { ref });
      }

      return api.createElement(App, null);
    }

    const react = await renderReactDomConformance(createElement, () => undefined);
    const compat = await renderCompatDomConformance(createElement, () => undefined);

    expect(compat).toEqual(react);
  });

  test("keeps createRef and class component setState behavior aligned with React", async () => {
    function createElement(api: RuntimeApi, log: string[]) {
      const BaseComponent = api.Component as typeof React.Component<
        { label: string },
        { count: number }
      >;

      class Counter extends BaseComponent {
        state = { count: 0 };

        render() {
          log.push(`render:${this.state.count}`);
          return api.createElement(
            "button",
            {
              onClick: () => {
                this.setState((state) => ({ count: state.count + 1 }));
              },
            },
            `${this.props.label}:${this.state.count}`,
          );
        }
      }

      const ref = api.createRef<InstanceType<typeof Counter>>();

      function App() {
        api.useLayoutEffect(() => {
          log.push(ref.current instanceof Counter ? "ref:class" : "ref:missing");
        }, []);
        return api.createElement(Counter, { label: "count", ref });
      }

      return api.createElement(App, null);
    }

    const react = await renderReactDomConformance(createElement, (container) => {
      container.querySelector("button")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    const compat = await renderCompatDomConformance(createElement, (container) => {
      container.querySelector("button")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(compat).toEqual(react);
  });

  test("skips PureComponent updates with shallowly equal props like React", async () => {
    function createScenario(api: RuntimeApi, log: string[]) {
      const BasePureComponent = api.PureComponent as typeof React.PureComponent<{
        value: string;
      }>;

      class Label extends BasePureComponent {
        render() {
          log.push(`render:${this.props.value}`);
          return api.createElement("span", null, this.props.value);
        }
      }

      return (label: string) => api.createElement(Label, { value: label });
    }

    const react = await renderReactDomUpdateConformance(createScenario);
    const compat = await renderCompatDomUpdateConformance(createScenario);

    expect(compat).toEqual(react);
  });

  test("keeps useSyncExternalStore snapshots aligned with React", async () => {
    function createStore() {
      let value = "A";
      const listeners = new Set<() => void>();

      return {
        getSnapshot: () => value,
        subscribe(listener: () => void) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        set(next: string) {
          value = next;
          for (const listener of listeners) {
            listener();
          }
        },
      };
    }

    function createElement(api: RuntimeApi, log: string[], store: ReturnType<typeof createStore>) {
      function Label() {
        const value = api.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
        log.push(`render:${value}`);
        return api.createElement(
          "button",
          { onClick: () => { store.set("B"); } },
          value,
        );
      }

      return api.createElement(Label, null);
    }

    const reactStore = createStore();
    const compatStore = createStore();
    const react = await renderReactDomConformance(
      (api, log) => createElement(api, log, reactStore),
      (container) => {
        container.querySelector("button")?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      },
    );
    const compat = await renderCompatDomConformance(
      (api, log) => createElement(api, log, compatStore),
      (container) => {
        container.querySelector("button")?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      },
    );

    expect(compat).toEqual(react);
  });

  test("keeps useTransition and useDeferredValue observable DOM aligned with React", async () => {
    function createElement(api: RuntimeApi, log: string[]) {
      function Search() {
        const [query, setQuery] = api.useState("A");
        const [pending, startTransition] = api.useTransition();
        const deferred = api.useDeferredValue(query);
        log.push(`render:${query}:${deferred}:${pending}`);
        return api.createElement(
          "button",
          {
            onClick: () => {
              startTransition(() => {
                setQuery("B");
              });
            },
          },
          `${deferred}:${pending ? "pending" : "ready"}`,
        );
      }

      return api.createElement(Search, null);
    }

    const react = await renderReactDomConformance(createElement, (container) => {
      container.querySelector("button")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    const compat = await renderCompatDomConformance(createElement, (container) => {
      container.querySelector("button")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(compat.after).toBe(react.after);
  });

  test("keeps useId stable across rerenders like React", async () => {
    function createElement(api: RuntimeApi, log: string[]) {
      function Field() {
        const [count, setCount] = api.useState(0);
        const id = api.useId();
        log.push(id);
        return api.createElement(
          "button",
          { id, onClick: () => { setCount((value) => value + 1); } },
          `${id}:${count}`,
        );
      }

      return api.createElement(Field, null);
    }

    const react = await renderReactDomConformance(createElement, (container) => {
      container.querySelector("button")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    const compat = await renderCompatDomConformance(createElement, (container) => {
      container.querySelector("button")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(compat).toEqual(react);
  });

  test("updates controlled form props like React", async () => {
    function createElement(api: RuntimeApi) {
      return api.createElement(
        "form",
        null,
        api.createElement("input", { value: "Ada", readOnly: true }),
        api.createElement("textarea", { value: "Lovelace", readOnly: true }),
        api.createElement(
          "select",
          { value: "b", onChange: () => undefined },
          api.createElement("option", { value: "a" }, "A"),
          api.createElement("option", { value: "b" }, "B"),
        ),
      );
    }

    const react = await renderReactDomSnapshot(createElement);
    const compat = await renderCompatDomSnapshot(createElement);

    expect(compat).toEqual(react);
  });

  test("bubbles portal events through owner parents like React", async () => {
    const reactPortalContainer = document.createElement("div");
    const compatPortalContainer = document.createElement("div");

    function createElement(api: RuntimeApi, log: string[], portalContainer: Element) {
      return api.createElement(
        "section",
        { onClick: () => { log.push("owner"); } },
        api.createPortal(
          api.createElement("button", { onClick: () => { log.push("portal"); } }, "Portal"),
          portalContainer,
        ),
      );
    }

    const react = await renderReactDomConformance(
      (api, log) => createElement(api, log, reactPortalContainer),
      () => {
        reactPortalContainer.querySelector("button")?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      },
    );
    const compat = await renderCompatDomConformance(
      (api, log) => createElement(api, log, compatPortalContainer),
      () => {
        compatPortalContainer.querySelector("button")?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      },
    );

    expect({
      ...compat,
      portal: compatPortalContainer.innerHTML,
    }).toEqual({
      ...react,
      portal: reactPortalContainer.innerHTML,
    });
  });

  test("skips memoized function component rerenders like React", async () => {
    function createScenario(api: RuntimeApi, log: string[]) {
      const Label = api.memo((props) => {
        log.push(`render:${props.value}`);
        return api.createElement("span", null, props.value);
      });

      return (label: string) => api.createElement(Label, { value: label });
    }

    const react = await renderReactDomUpdateConformance(createScenario);
    const compat = await renderCompatDomUpdateConformance(createScenario);

    expect(compat).toEqual(react);
  });

  test("replays StrictMode layout and passive effects like React", async () => {
    function createElement(api: RuntimeApi, log: string[]) {
      function App() {
        log.push("render");
        api.useInsertionEffect(() => {
          log.push("insertion");
          return () => {
            log.push("insertion-cleanup");
          };
        }, []);
        api.useLayoutEffect(() => {
          log.push("layout");
          return () => {
            log.push("layout-cleanup");
          };
        }, []);
        api.useEffect(() => {
          log.push("effect");
          return () => {
            log.push("effect-cleanup");
          };
        }, []);
        return api.createElement("p", null, "strict");
      }

      return api.createElement(api.StrictMode, null, api.createElement(App, null));
    }

    const react = await renderReactDomConformance(createElement, () => undefined);
    const compat = await renderCompatDomConformance(createElement, () => undefined);

    expect(compat).toEqual(react);
  });

  test("hydrates matching server markup and attaches event handlers like React", async () => {
    function createElement(api: RuntimeApi, log: string[]) {
      return api.createElement(
        "button",
        {
          className: "primary",
          onClick: () => { log.push("click"); },
        },
        "Save",
      );
    }

    const react = await hydrateReactDomConformance(createElement);
    const compat = await hydrateCompatDomConformance(createElement);

    expect(compat).toEqual(react);
  });

  test("recovers hydration text mismatches to the same DOM as React", async () => {
    function createElement(api: RuntimeApi) {
      return api.createElement("p", null, "client");
    }

    const react = await hydrateReactMismatchConformance(
      "<p>server</p>",
      createElement,
    );
    const compat = await hydrateCompatMismatchConformance(
      "<p>server</p>",
      createElement,
    );

    expect(compat.after).toBe(react.after);
    expect(compat.recoverableErrors).toBeGreaterThan(0);
  });

  test("recovers hydration tag mismatches to the same DOM as React", async () => {
    function createElement(api: RuntimeApi) {
      return api.createElement("section", null, api.createElement("h1", null, "client"));
    }

    const react = await hydrateReactMismatchConformance(
      "<div><span>server</span></div>",
      createElement,
    );
    const compat = await hydrateCompatMismatchConformance(
      "<div><span>server</span></div>",
      createElement,
    );

    expect(compat.after).toBe(react.after);
    expect(compat.recoverableErrors).toBeGreaterThan(0);
  });
});

function throws(callback: () => unknown): boolean {
  try {
    callback();
    return false;
  } catch {
    return true;
  }
}

async function renderReactDomSnapshot(
  createElement: (api: RuntimeApi) => unknown,
): Promise<{ html: string; values: Record<string, unknown> }> {
  const container = document.createElement("div");
  const root = createReactRoot(container);

  await act(async () => {
    root.render(createElement(reactApi) as React.ReactNode);
  });

  return { html: container.innerHTML, values: readFormValues(container) };
}

async function renderCompatDomSnapshot(
  createElement: (api: RuntimeApi) => unknown,
): Promise<{ html: string; values: Record<string, unknown> }> {
  const container = document.createElement("div");
  const root = Compat.createRoot(container);

  root.render(createElement(compatApi) as Compat.ReactCompatNode);

  return { html: container.innerHTML, values: readFormValues(container) };
}

function readFormValues(container: Element): Record<string, unknown> {
  const input = container.querySelector("input");
  const textarea = container.querySelector("textarea");
  const select = container.querySelector("select");

  return {
    input: input instanceof HTMLInputElement ? input.value : undefined,
    textarea: textarea instanceof HTMLTextAreaElement ? textarea.value : undefined,
    select: select instanceof HTMLSelectElement ? select.value : undefined,
  };
}

function renderReactElementToString(createElement: ElementFactory): string {
  return renderReactToString(createElement(reactApi) as React.ReactNode);
}

function renderCompatElementToString(createElement: ElementFactory): string {
  return Compat.renderToString(() => createElement(compatApi) as Compat.ReactCompatNode);
}

async function renderReactDomConformance(
  createElement: (api: RuntimeApi, log: string[]) => unknown,
  interact: (container: Element) => void,
): Promise<{ before: string; after: string; log: string[] }> {
  const container = document.createElement("div");
  const log: string[] = [];
  const root = createReactRoot(container);

  await act(async () => {
    root.render(createElement(reactApi, log) as React.ReactNode);
  });
  const before = container.innerHTML;

  await act(async () => {
    interact(container);
  });

  return { before, after: container.innerHTML, log };
}

async function renderCompatDomConformance(
  createElement: (api: RuntimeApi, log: string[]) => unknown,
  interact: (container: Element) => void,
): Promise<{ before: string; after: string; log: string[] }> {
  const container = document.createElement("div");
  const log: string[] = [];
  const root = Compat.createRoot(container);

  root.render(createElement(compatApi, log) as Compat.ReactCompatNode);
  const before = container.innerHTML;
  interact(container);
  await flushCompatAsyncWork();

  return { before, after: container.innerHTML, log };
}

async function renderReactDomUpdateConformance(
  createScenario: (api: RuntimeApi, log: string[]) => (label: string) => unknown,
): Promise<{ first: string; second: string; third: string; log: string[] }> {
  const container = document.createElement("div");
  const log: string[] = [];
  const root = createReactRoot(container);
  const createElement = createScenario(reactApi, log);

  await act(async () => {
    root.render(createElement("A") as React.ReactNode);
  });
  const first = container.innerHTML;
  await act(async () => {
    root.render(createElement("A") as React.ReactNode);
  });
  const second = container.innerHTML;
  await act(async () => {
    root.render(createElement("B") as React.ReactNode);
  });

  return { first, second, third: container.innerHTML, log };
}

async function renderCompatDomUpdateConformance(
  createScenario: (api: RuntimeApi, log: string[]) => (label: string) => unknown,
): Promise<{ first: string; second: string; third: string; log: string[] }> {
  const container = document.createElement("div");
  const log: string[] = [];
  const root = Compat.createRoot(container);
  const createElement = createScenario(compatApi, log);

  root.render(createElement("A") as Compat.ReactCompatNode);
  const first = container.innerHTML;
  root.render(createElement("A") as Compat.ReactCompatNode);
  const second = container.innerHTML;
  root.render(createElement("B") as Compat.ReactCompatNode);
  await flushCompatAsyncWork();

  return { first, second, third: container.innerHTML, log };
}

async function hydrateReactDomConformance(
  createElement: (api: RuntimeApi, log: string[]) => unknown,
): Promise<{ before: string; after: string; log: string[] }> {
  const log: string[] = [];
  const container = document.createElement("div");
  container.innerHTML = renderReactToString(
    createElement(reactApi, []) as React.ReactNode,
  );
  const before = container.innerHTML;

  await act(async () => {
    hydrateReactRoot(container, createElement(reactApi, log) as React.ReactNode);
  });
  container.querySelector("button")?.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true }),
  );

  return { before, after: container.innerHTML, log };
}

async function hydrateCompatDomConformance(
  createElement: (api: RuntimeApi, log: string[]) => unknown,
): Promise<{ before: string; after: string; log: string[] }> {
  const log: string[] = [];
  const container = document.createElement("div");
  container.innerHTML = Compat.renderToString(
    () => createElement(compatApi, []) as Compat.ReactCompatNode,
  );
  const before = container.innerHTML;

  Compat.hydrateRoot(container, createElement(compatApi, log) as Compat.ReactCompatNode);
  container.querySelector("button")?.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true }),
  );

  return { before, after: container.innerHTML, log };
}

async function hydrateReactMismatchConformance(
  html: string,
  createElement: ElementFactory,
): Promise<{ after: string; recoverableErrors: number }> {
  const container = document.createElement("div");
  let recoverableErrors = 0;
  container.innerHTML = html;

  await act(async () => {
    hydrateReactRoot(container, createElement(reactApi) as React.ReactNode, {
      onRecoverableError() {
        recoverableErrors += 1;
      },
    });
  });
  await Promise.resolve();

  return { after: container.innerHTML, recoverableErrors };
}

async function flushCompatAsyncWork(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  await Promise.resolve();
}

async function hydrateCompatMismatchConformance(
  html: string,
  createElement: ElementFactory,
): Promise<{ after: string; recoverableErrors: number }> {
  const container = document.createElement("div");
  let recoverableErrors = 0;
  container.innerHTML = html;

  Compat.hydrateRoot(container, createElement(compatApi) as Compat.ReactCompatNode, {
    onRecoverableError() {
      recoverableErrors += 1;
    },
  });

  return { after: container.innerHTML, recoverableErrors };
}
