// @vitest-environment happy-dom

import { afterEach, describe, expect, test, vi } from "vitest";
import { createElement, createRoot, render } from "../src/index.js";

interface TestDevToolsHook {
  inject: ReturnType<typeof vi.fn>;
  onCommitFiberRoot: ReturnType<typeof vi.fn>;
  onCommitFiberUnmount: ReturnType<typeof vi.fn>;
}

declare global {
  // eslint-disable-next-line no-var
  var __REACT_DEVTOOLS_GLOBAL_HOOK__: TestDevToolsHook | undefined;
}

describe("react-compat devtools hook", () => {
  afterEach(() => {
    delete globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  });

  test("injects a renderer and reports root commits", () => {
    const hook: TestDevToolsHook = {
      inject: vi.fn(() => 7),
      onCommitFiberRoot: vi.fn(),
      onCommitFiberUnmount: vi.fn(),
    };
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
    const container = document.createElement("div");

    render(createElement("p", null, "Hello"), container);

    expect(hook.inject).toHaveBeenCalledTimes(1);
    expect(hook.inject.mock.calls[0]?.[0]).toMatchObject({
      rendererPackageName: "@modular-react/react-compat",
      version: "0.0.0",
    });
    expect(hook.onCommitFiberRoot).toHaveBeenCalledTimes(1);
    expect(hook.onCommitFiberRoot.mock.calls[0]?.[0]).toBe(7);
    expect(hook.onCommitFiberRoot.mock.calls[0]?.[1]).toMatchObject({
      containerInfo: container,
      current: {
        elementType: "p",
      },
    });
  });

  test("reports root unmounts", () => {
    const hook: TestDevToolsHook = {
      inject: vi.fn(() => 8),
      onCommitFiberRoot: vi.fn(),
      onCommitFiberUnmount: vi.fn(),
    };
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
    const container = document.createElement("div");
    const root = createRoot(container);

    root.render(createElement("span", null, "Mounted"));
    root.unmount();

    expect(hook.onCommitFiberUnmount).toHaveBeenCalledTimes(1);
    expect(hook.onCommitFiberUnmount.mock.calls[0]?.[0]).toBe(8);
    expect(hook.onCommitFiberUnmount.mock.calls[0]?.[1]).toMatchObject({
      containerInfo: container,
    });
  });
});
