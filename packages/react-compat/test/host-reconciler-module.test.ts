// @vitest-environment happy-dom

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Fragment, createElement } from "../src/index.js";
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

  test("uses indexed runtime instance keys instead of per-prefix map scans", async () => {
    const hostReconcilerSource = await readFile(
      join(process.cwd(), "packages/react-compat/src/host-reconciler.ts"),
      "utf8",
    );
    const reconcilerSource = await readFile(
      join(process.cwd(), "packages/react-compat/src/reconciler.ts"),
      "utf8",
    );

    expect(hostReconcilerSource).not.toContain("Array.from(runtime.instances.keys())");
    expect(reconcilerSource).not.toContain("Array.from(runtime.instances.keys())");
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

  test("marks only changed row-shaped host props", () => {
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    const initial = renderHostFiberRoot(
      root,
      createElement(Fragment, null, [
        createElement("div", { "data-key": 0, key: 0 }, "Row 0"),
        createElement("div", { "data-key": 1, key: 1 }, "Row 1"),
        createElement("div", { "data-key": 2, key: 2 }, "Row 2"),
      ]),
    );

    root.finishedWork = initial;
    commitHostFiberRoot(root, initial);
    root.current = initial;

    const updated = renderHostFiberRoot(
      root,
      createElement(Fragment, null, [
        createElement("div", { "data-key": 0, key: 0 }, "Row 0"),
        createElement(
          "div",
          { className: "selected", "data-key": 1, "data-selected": "true", key: 1 },
          "Row 1",
        ),
        createElement("div", { "data-key": 2, key: 2 }, "Row 2"),
      ]),
    );
    const first = updated.child?.child;
    const second = first?.sibling;
    const third = second?.sibling;

    expect(first?.flags & Update).toBe(0);
    expect(second?.flags & Update).toBe(Update);
    expect(third?.flags & Update).toBe(0);
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

  test("skips host child sync when only host props change", () => {
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

    if (updated.child?.child === undefined) {
      expect.fail("expected nested child fiber");
    }

    updated.child.child.stateNode = undefined;
    commitHostFiberRoot(root, updated);

    expect(container.innerHTML).toBe('<main data-selected="true"><span>Hello</span></main>');
  });

  test("commits only dirty root children when the root child list is unchanged", () => {
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    const initial = renderHostFiberRoot(root, [
      createElement("span", { "data-key": "a", key: "a" }, "A"),
      createElement("span", { "data-key": "b", key: "b" }, "B"),
      createElement("span", { "data-key": "c", key: "c" }, "C"),
    ]);

    root.finishedWork = initial;
    commitHostFiberRoot(root, initial);
    root.current = initial;

    const updated = renderHostFiberRoot(root, [
      createElement("span", { "data-key": "a", key: "a" }, "A"),
      createElement("span", { "data-key": "b", "data-selected": "true", key: "b" }, "B"),
      createElement("span", { "data-key": "c", key: "c" }, "C"),
    ]);

    if (updated.child === undefined || updated.child.sibling?.sibling === undefined) {
      expect.fail("expected three host children");
    }

    updated.child.stateNode = undefined;
    updated.child.sibling.sibling.stateNode = undefined;
    commitHostFiberRoot(root, updated);

    expect(container.innerHTML).toBe(
      '<span data-key="a">A</span><span data-key="b" data-selected="true">B</span><span data-key="c">C</span>',
    );
  });

  test("commits only dirty keyed rows through the production row fast path", () => {
    vi.stubEnv("NODE_ENV", "production");
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    const initial = renderHostFiberRoot(root, [
      createElement("div", { "data-key": 0, key: 0 }, "Row 0"),
      createElement("div", { "data-key": 1, key: 1 }, "Row 1"),
      createElement("div", { "data-key": 2, key: 2 }, "Row 2"),
    ]);

    root.finishedWork = initial;
    commitHostFiberRoot(root, initial);
    root.current = initial;

    const updated = renderHostFiberRoot(root, [
      createElement("div", { "data-key": 0, key: 0 }, "Row 0"),
      createElement(
        "div",
        { className: "selected", "data-key": 1, "data-selected": "true", key: 1 },
        "Row 1",
      ),
      createElement("div", { "data-key": 2, key: 2 }, "Row 2"),
    ]);

    if (updated.child === undefined || updated.child.sibling?.sibling === undefined) {
      expect.fail("expected three row fibers");
    }

    updated.child.stateNode = undefined;
    updated.child.sibling.sibling.stateNode = undefined;
    commitHostFiberRoot(root, updated);

    expect(container.innerHTML).toBe(
      '<div data-key="0">Row 0</div><div data-key="1" class="selected" data-selected="true">Row 1</div><div data-key="2">Row 2</div>',
    );
  });

  test("updates keyed row text without reapplying unchanged row props", () => {
    vi.stubEnv("NODE_ENV", "production");
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    const initial = renderHostFiberRoot(root, [
      createElement("div", { "data-key": 0, key: 0 }, "Row 0"),
      createElement("div", { "data-key": 1, key: 1 }, "Row 1"),
    ]);

    root.finishedWork = initial;
    commitHostFiberRoot(root, initial);
    root.current = initial;

    const updatedRow = container.children[1] as HTMLElement;
    updatedRow.getAttribute = () => {
      throw new Error("row props should not be read for text-only updates");
    };

    const updated = renderHostFiberRoot(root, [
      createElement("div", { "data-key": 0, key: 0 }, "Row 0"),
      createElement("div", { "data-key": 1, key: 1 }, "Row 1 updated"),
    ]);

    commitHostFiberRoot(root, updated);

    expect(container.textContent).toBe("Row 0Row 1 updated");
  });

  test("keeps root child sync for keyed removals", () => {
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    const initial = renderHostFiberRoot(root, [
      createElement("span", { "data-key": "a", key: "a" }, "A"),
      createElement("span", { "data-key": "b", key: "b" }, "B"),
      createElement("span", { "data-key": "c", key: "c" }, "C"),
    ]);

    root.finishedWork = initial;
    commitHostFiberRoot(root, initial);
    root.current = initial;

    const updated = renderHostFiberRoot(root, [
      createElement("span", { "data-key": "a", key: "a" }, "A"),
      createElement("span", { "data-key": "c", key: "c" }, "C"),
    ]);

    commitHostFiberRoot(root, updated);

    expect(container.innerHTML).toBe(
      '<span data-key="a">A</span><span data-key="c">C</span>',
    );
  });

  test("appends keyed fragment children without resyncing unchanged siblings", () => {
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    const initial = renderHostFiberRoot(
      root,
      createElement(Fragment, null, [
        createElement("span", { "data-key": "a", key: "a" }, "A"),
        createElement("span", { "data-key": "b", key: "b" }, "B"),
      ]),
    );

    root.finishedWork = initial;
    commitHostFiberRoot(root, initial);
    root.current = initial;

    const updated = renderHostFiberRoot(
      root,
      createElement(Fragment, null, [
        createElement("span", { "data-key": "a", key: "a" }, "A"),
        createElement("span", { "data-key": "b", key: "b" }, "B"),
        createElement("span", { "data-key": "c", key: "c" }, "C"),
      ]),
    );
    const firstRow = updated.child?.child;

    if (firstRow === undefined) {
      expect.fail("expected fragment child");
    }

    firstRow.stateNode = undefined;
    commitHostFiberRoot(root, updated);

    expect(container.innerHTML).toBe(
      '<span data-key="a">A</span><span data-key="b">B</span><span data-key="c">C</span>',
    );
  });

  test("removes one keyed fragment child without resyncing unchanged siblings", () => {
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    const initial = renderHostFiberRoot(
      root,
      createElement(Fragment, null, [
        createElement("span", { "data-key": "a", key: "a" }, "A"),
        createElement("span", { "data-key": "b", key: "b" }, "B"),
        createElement("span", { "data-key": "c", key: "c" }, "C"),
      ]),
    );

    root.finishedWork = initial;
    commitHostFiberRoot(root, initial);
    root.current = initial;

    const updated = renderHostFiberRoot(
      root,
      createElement(Fragment, null, [
        createElement("span", { "data-key": "a", key: "a" }, "A"),
        createElement("span", { "data-key": "c", key: "c" }, "C"),
      ]),
    );
    const firstRow = updated.child?.child;
    const lastRow = firstRow?.sibling;

    if (firstRow === undefined || lastRow === undefined) {
      expect.fail("expected remaining fragment children");
    }

    firstRow.stateNode = undefined;
    lastRow.stateNode = undefined;
    commitHostFiberRoot(root, updated);

    expect(container.innerHTML).toBe(
      '<span data-key="a">A</span><span data-key="c">C</span>',
    );
  });
});
