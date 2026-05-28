// @vitest-environment happy-dom

import { afterEach, describe, expect, test, vi } from "vitest";
import { createElement } from "../src/index.js";
import {
  canRenderHostFiber,
  commitHostFiberRoot,
  renderHostFiberRoot,
} from "../src/host-reconciler.js";
import { createFiberRoot } from "../src/fiber.js";
import { NoFlags, Update } from "../src/fiber-flags.js";

describe("host reconciler module", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

  test("marks only changed host props and bubbles host subtree flags", () => {
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    const initial = renderHostFiberRoot(
      root,
      createElement("main", null, [
        createElement("span", { "data-selected": "false", key: "a" }, "A"),
        createElement("span", { "data-selected": "false", key: "b" }, "B"),
      ]),
    );

    root.finishedWork = initial;
    commitHostFiberRoot(root, initial);
    root.current = initial;

    const updated = renderHostFiberRoot(
      root,
      createElement("main", null, [
        createElement("span", { "data-selected": "false", key: "a" }, "A"),
        createElement("span", { "data-selected": "true", key: "b" }, "B"),
      ]),
    );

    const first = updated.child?.child;
    const second = first?.sibling;

    expect(first?.flags & Update).toBe(0);
    expect(second?.flags & Update).toBe(Update);
    expect(updated.subtreeFlags & Update).toBe(Update);
  });

  test("bails out unchanged host subtrees during commit", () => {
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
    const unchangedChild = updated.child?.child;

    expect(unchangedChild?.flags).toBe(NoFlags);
    expect(unchangedChild?.subtreeFlags).toBe(NoFlags);

    if (unchangedChild?.child === undefined) {
      expect.fail("expected nested text fiber");
    }

    unchangedChild.child.pendingProps = "Broken";
    commitHostFiberRoot(root, updated);

    expect(container.innerHTML).toBe('<main data-selected="true"><span>Hello</span></main>');
  });
});
