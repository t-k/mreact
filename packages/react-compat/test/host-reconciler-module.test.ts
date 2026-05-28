// @vitest-environment happy-dom

import { afterEach, describe, expect, test, vi } from "vitest";
import { createElement } from "../src/index.js";
import {
  canRenderHostFiber,
  commitHostFiberRoot,
  renderHostFiberRoot,
} from "../src/host-reconciler.js";
import { createFiberRoot } from "../src/fiber.js";

describe("host reconciler module", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("exposes host renderability checks independently of the fiber-host compatibility entry", () => {
    expect(canRenderHostFiber(createElement("section", null, "ok"))).toBe(true);
    expect(canRenderHostFiber(Symbol("unsupported"))).toBe(false);
  });

  test("stores single primitive host text without a child text fiber in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    const work = renderHostFiberRoot(
      root,
      createElement("main", { id: "app" }, "Hello"),
    );

    expect(work.child?.tag).toBe("host-component");
    expect(work.child?.type).toBe("main");
    expect(work.child?.child).toBeUndefined();
  });

  test("updates single primitive host text without replacing the host element in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    const initial = renderHostFiberRoot(root, createElement("main", null, "Hello"));

    root.finishedWork = initial;
    commitHostFiberRoot(root, initial);
    root.current = initial;
    const main = container.querySelector("main");

    const updated = renderHostFiberRoot(root, createElement("main", null, "Updated"));

    root.finishedWork = updated;
    commitHostFiberRoot(root, updated);

    expect(container.querySelector("main")).toBe(main);
    expect(container.innerHTML).toBe("<main>Updated</main>");
    expect(updated.child?.child).toBeUndefined();
  });

  test("reuses unchanged host child fibers when only host attributes change", () => {
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    const child = createElement("span", null, "Hello");
    const initial = renderHostFiberRoot(
      root,
      createElement("main", { "data-selected": "false" }, child),
    );

    root.finishedWork = initial;
    commitHostFiberRoot(root, initial);
    root.current = initial;

    const updated = renderHostFiberRoot(
      root,
      createElement("main", { "data-selected": "true" }, child),
    );

    expect(updated.child?.child).toBe(initial.child?.child);
  });
});
