// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import {
  createElement,
  createRoot,
  startTransition,
  Suspense,
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
});
