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
    await Promise.resolve();
    expect(container.innerHTML).toBe("<p>settled:done</p>");
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
});
