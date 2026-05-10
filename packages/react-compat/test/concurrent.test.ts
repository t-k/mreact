// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import {
  createElement,
  createErrorBoundary,
  createRoot,
  hydrateRoot,
  startTransition,
  Suspense,
  SuspenseList,
  useDeferredValue,
  useState,
  useTransition,
} from "../src/index.js";

describe("react-compat concurrent subset", () => {
  test("Suspense renders fallback for thrown promises and retries after resolve", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let ready = false;
    let resolvePromise: () => void = () => {};
    const promise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    function AsyncChild() {
      if (!ready) {
        throw promise;
      }

      return createElement("span", null, "ready");
    }

    root.render(
      createElement(
        Suspense,
        { fallback: createElement("em", null, "loading") },
        createElement(AsyncChild, null),
      ),
    );

    expect(container.innerHTML).toBe("<em>loading</em>");

    ready = true;
    resolvePromise();
    await promise;
    await Promise.resolve();

    expect(container.innerHTML).toBe("<span>ready</span>");
  });

  test("startTransition schedules work asynchronously", async () => {
    const calls: string[] = [];

    startTransition(() => {
      calls.push("transition");
    });

    expect(calls).toEqual([]);
    await Promise.resolve();
    expect(calls).toEqual(["transition"]);
  });

  test("useTransition exposes pending state while scheduled work is pending", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let trigger: () => void = () => {};

    function App() {
      const [value, setValue] = useState("idle");
      const [pending, start] = useTransition();
      trigger = () => {
        start(() => {
          setValue("done");
        });
      };

      return createElement(
        "p",
        null,
        `${pending ? "pending" : "settled"}:${value}`,
      );
    }

    root.render(createElement(App, null));
    expect(container.innerHTML).toBe("<p>settled:idle</p>");

    trigger();
    expect(container.innerHTML).toBe("<p>pending:idle</p>");

    await Promise.resolve();
    expect(container.innerHTML).toBe("<p>pending:idle</p>");

    await Promise.resolve();
    expect(container.innerHTML).toBe("<p>settled:done</p>");
  });

  test("useDeferredValue keeps the previous value until the transition lane commits", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let setValue: (value: string) => void = () => {};

    function App() {
      const [value, updateValue] = useState("A");
      const deferred = useDeferredValue(value);
      setValue = updateValue;

      return createElement("p", null, `${value}:${deferred}`);
    }

    root.render(createElement(App, null));
    expect(container.innerHTML).toBe("<p>A:A</p>");

    setValue("B");
    expect(container.innerHTML).toBe("<p>B:A</p>");

    await Promise.resolve();
    expect(container.innerHTML).toBe("<p>B:A</p>");

    await Promise.resolve();
    expect(container.innerHTML).toBe("<p>B:B</p>");
  });

  test("transition state updates commit on the transition lane after scope execution", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let transitionToSlow: () => void = () => {};

    function App() {
      const [value, setValue] = useState("idle");
      transitionToSlow = () => {
        startTransition(() => {
          setValue("slow");
        });
      };

      return createElement("p", null, value);
    }

    root.render(createElement(App, null));
    transitionToSlow();
    expect(container.innerHTML).toBe("<p>idle</p>");

    await Promise.resolve();
    expect(container.innerHTML).toBe("<p>idle</p>");

    await Promise.resolve();
    expect(container.innerHTML).toBe("<p>slow</p>");
  });

  test("hydrateRoot reuses existing Suspense fallback while promise is pending", () => {
    const container = document.createElement("div");
    container.innerHTML = "<em>loading</em>";
    const fallback = container.firstChild;
    const pending = new Promise<void>(() => {});

    function AsyncChild() {
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

    expect(container.firstChild).toBe(fallback);
    expect(container.innerHTML).toBe("<em>loading</em>");
  });

  test("SuspenseList revealOrder forwards stops after the first pending boundary", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const pending = new Promise<void>(() => {});

    function Pending() {
      throw pending;
    }

    root.render(
      createElement(
        SuspenseList,
        { revealOrder: "forwards" },
        [
          createElement(
            Suspense,
            { fallback: createElement("em", null, "loading") },
            createElement(Pending, null),
          ),
          createElement(Suspense, { fallback: null }, createElement("strong", null, "later")),
        ],
      ),
    );

    expect(container.innerHTML).toBe("<em>loading</em>");
  });

  test("SuspenseList revealOrder backwards stops at the last pending boundary", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const pending = new Promise<void>(() => {});

    function Pending() {
      throw pending;
    }

    root.render(
      createElement(
        SuspenseList,
        { revealOrder: "backwards" },
        [
          createElement(Suspense, { fallback: null }, createElement("strong", null, "first")),
          createElement(
            Suspense,
            { fallback: createElement("em", null, "loading") },
            createElement(Pending, null),
          ),
        ],
      ),
    );

    expect(container.innerHTML).toBe("<em>loading</em>");
  });

  test("SuspenseList revealOrder together keeps later ready children visible", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const pending = new Promise<void>(() => {});

    function Pending() {
      throw pending;
    }

    root.render(
      createElement(
        SuspenseList,
        { revealOrder: "together" },
        [
          createElement(
            Suspense,
            { fallback: createElement("em", null, "loading") },
            createElement(Pending, null),
          ),
          createElement(Suspense, { fallback: null }, createElement("strong", null, "later")),
        ],
      ),
    );

    expect(container.innerHTML).toBe("<em>loading</em><strong>later</strong>");
  });

  test("createErrorBoundary catches thrown errors without catching promises", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const errors: string[] = [];

    function Broken() {
      throw new Error("boom");
    }

    root.render(
      createErrorBoundary(
        {
          fallback: (error) => createElement("strong", null, error.message),
          onError: (error) => {
            errors.push(error.message);
          },
        },
        createElement(Broken, null),
      ),
    );

    expect(container.innerHTML).toBe("<strong>boom</strong>");
    expect(errors).toEqual(["boom"]);
  });

  test("class ErrorBoundary catches descendant errors and renders derived state", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const errors: string[] = [];

    function Broken() {
      throw new Error("boom");
    }

    class Boundary {
      props: { children: unknown };
      state = { message: "" };

      constructor(props: { children: unknown }) {
        this.props = props;
      }

      static getDerivedStateFromError(error: Error) {
        return { message: error.message };
      }

      componentDidCatch(error: Error) {
        errors.push(error.message);
      }

      render() {
        if (this.state.message !== "") {
          return createElement("strong", null, this.state.message);
        }

        return this.props.children;
      }
    }

    root.render(createElement(Boundary, null, createElement(Broken, null)));

    expect(container.innerHTML).toBe("<strong>boom</strong>");
    expect(errors).toEqual(["boom"]);
  });

  test("sync updates abort stale transition commits", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let transitionToSlow: () => void = () => {};
    let syncToFast: () => void = () => {};

    function App() {
      const [value, setValue] = useState("idle");
      const [, start] = useTransition();
      transitionToSlow = () => {
        start(() => {
          setValue("slow");
        });
      };
      syncToFast = () => {
        setValue("fast");
      };

      return createElement("p", null, value);
    }

    root.render(createElement(App, null));
    transitionToSlow();
    syncToFast();
    await Promise.resolve();
    await Promise.resolve();

    expect(container.innerHTML).toBe("<p>fast</p>");
  });

  test("newer transitions supersede earlier pending transition scopes", async () => {
    const calls: string[] = [];

    startTransition(() => {
      calls.push("first");
    });
    startTransition(() => {
      calls.push("second");
    });

    await Promise.resolve();

    expect(calls).toEqual(["second"]);
  });
});
