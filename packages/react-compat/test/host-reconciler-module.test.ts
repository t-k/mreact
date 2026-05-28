// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { createElement } from "../src/index.js";
import {
  canRenderHostFiber,
  commitHostFiberRoot,
  renderHostFiberRoot,
} from "../src/host-reconciler.js";
import { createFiberRoot } from "../src/fiber.js";

describe("host reconciler module", () => {
  test("exposes host renderability checks independently of the fiber-host compatibility entry", () => {
    expect(canRenderHostFiber(createElement("section", null, "ok"))).toBe(true);
    expect(canRenderHostFiber(Symbol("unsupported"))).toBe(false);
  });

  test("builds host child fibers from the dedicated reconciler module", () => {
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    const work = renderHostFiberRoot(
      root,
      createElement("main", { id: "app" }, "Hello"),
    );

    expect(work.child?.tag).toBe("host-component");
    expect(work.child?.type).toBe("main");
    expect(work.child?.child?.tag).toBe("host-text");
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
