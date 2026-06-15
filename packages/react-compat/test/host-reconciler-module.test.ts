// @vitest-environment happy-dom

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Fragment, createElement, memo } from "../src/index.js";
import { createRoot, flushSync } from "../src/root.js";
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
    expect(hostReconcilerSource).not.toContain("for (const [key, instance] of runtime.instances)");
    expect(hostReconcilerSource).toContain("runtime.instanceKeysByPrefix.get(prefix)");
    expect(reconcilerSource).not.toContain("Array.from(runtime.instances.keys())");
  });

  test("does not scan runtime instances for hookless memo subtrees", async () => {
    const hostReconcilerSource = await readFile(
      join(process.cwd(), "packages/react-compat/src/host-reconciler.ts"),
      "utf8",
    );

    expect(hostReconcilerSource).toContain("if (keys.length === 0) {");
    expect(hostReconcilerSource).toContain("return false;");
  });

  test("uses a boolean committed host node probe for skipped children", async () => {
    const hostReconcilerSource = await readFile(
      join(process.cwd(), "packages/react-compat/src/host-reconciler.ts"),
      "utf8",
    );

    expect(hostReconcilerSource).toContain("function hasCommittedHostNode(");
    expect(hostReconcilerSource).toContain("!hasCommittedHostNode(child)");
    expect(hostReconcilerSource).toContain("hasCommittedHostNode(alternateChild)");
    expect(hostReconcilerSource).not.toContain("collectCommittedHostNodes(child).length");
    expect(hostReconcilerSource).not.toContain("collectCommittedHostNodes(alternateChild).length");
  });

  test("skips dirty instance scans for hookless memo subtrees", async () => {
    const hostReconcilerSource = await readFile(
      join(process.cwd(), "packages/react-compat/src/host-reconciler.ts"),
      "utf8",
    );

    expect(hostReconcilerSource).toContain("hasDirtyInstanceDependencies:");
    expect(hostReconcilerSource).toContain("hasUnflushedEffectDependencies:");
    expect(hostReconcilerSource).toContain("memoStateNeedsDirtyInstanceCheck(previousMemoState)");
    expect(hostReconcilerSource).toContain("memoStateNeedsEffectCheck(previousMemoState)");
    expect(hostReconcilerSource).toContain("function hasDirtyInstanceDependencies(");
  });

  test("skips active instance marks for dependency-free memo subtrees", async () => {
    const hostReconcilerSource = await readFile(
      join(process.cwd(), "packages/react-compat/src/host-reconciler.ts"),
      "utf8",
    );

    expect(hostReconcilerSource).toContain("hasRetainedInstanceDependencies:");
    expect(hostReconcilerSource).toContain("memoStateNeedsActiveInstanceMark(state)");
    expect(hostReconcilerSource).toContain("function hasRetainedInstanceDependencies(");
  });

  test("reuses dependency-free memo bailout fibers without creating work in progress", async () => {
    const hostReconcilerSource = await readFile(
      join(process.cwd(), "packages/react-compat/src/host-reconciler.ts"),
      "utf8",
    );

    expect(hostReconcilerSource).toContain("function getMemoBailoutFiber(");
    expect(hostReconcilerSource).toContain("canReuseMemoBailoutFiber(current, state)");
  });

  test("builds runtime instance key prefixes without repeated slice joins", async () => {
    const hooksSource = await readFile(
      join(process.cwd(), "packages/react-compat/src/hooks.ts"),
      "utf8",
    );

    expect(hooksSource).toContain("function forEachInstanceKeyPrefix(");
    expect(hooksSource).not.toContain("parts.slice(0, index).join");
  });

  test("indexes runtime instance key prefixes without allocating prefix arrays", async () => {
    const hooksSource = await readFile(
      join(process.cwd(), "packages/react-compat/src/hooks.ts"),
      "utf8",
    );

    expect(hooksSource).toContain("function forEachInstanceKeyPrefix(");
    expect(hooksSource).not.toContain("for (const prefix of instanceKeyPrefixes(key))");
  });

  test("checks same-type memo bailout before generic element reconciliation", async () => {
    const hostReconcilerSource = await readFile(
      join(process.cwd(), "packages/react-compat/src/host-reconciler.ts"),
      "utf8",
    );

    expect(hostReconcilerSource).toContain("function tryReuseMemoBailout(");
    expect(hostReconcilerSource).toContain("const memoBailout = tryReuseMemoBailout(");
    expect(hostReconcilerSource).toContain("if (memoBailout !== undefined) {");
  });

  test("checks dependency-free memo bailout before child path generation", async () => {
    const hostReconcilerSource = await readFile(
      join(process.cwd(), "packages/react-compat/src/host-reconciler.ts"),
      "utf8",
    );
    const bailoutIndex = hostReconcilerSource.indexOf(
      "const memoBailout = tryReuseDependencyFreeMemoBailout(",
    );
    const pathIndex = hostReconcilerSource.indexOf(
      "getReconcileChildPath(path, child, index, options)",
    );

    expect(bailoutIndex).toBeGreaterThanOrEqual(0);
    expect(pathIndex).toBeGreaterThanOrEqual(0);
    expect(bailoutIndex).toBeLessThan(pathIndex);
  });

  test("skips child commit path segment allocation when commit paths are disabled", async () => {
    const hostReconcilerSource = await readFile(
      join(process.cwd(), "packages/react-compat/src/host-reconciler.ts"),
      "utf8",
    );

    expect(hostReconcilerSource).toContain("function childCommitPath(");
    expect(hostReconcilerSource).toContain(
      'return path === SKIP_COMMIT_PATH || path === "" ? "" : joinPath(path, segment);',
    );
    expect(hostReconcilerSource).toContain('childCommitPath(path, "memo")');
    expect(hostReconcilerSource).toContain('childCommitPath(path, "c")');
  });

  test("reconciles matching keyed host child order without used-child set bookkeeping", () => {
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    const initial = renderHostFiberRoot(root, [
      createElement("div", { key: "a" }),
      createElement("div", { key: "b" }),
      createElement("div", { key: "c" }),
    ]);

    root.finishedWork = initial;
    commitHostFiberRoot(root, initial);
    root.current = initial;

    const OriginalSet = globalThis.Set;
    let setConstructions = 0;

    try {
      globalThis.Set = class CountingSet<T> extends OriginalSet<T> {
        constructor(values?: Iterable<T> | null) {
          setConstructions += 1;
          super(values ?? undefined);
        }
      } as SetConstructor;

      renderHostFiberRoot(root, [
        createElement("div", { key: "a" }),
        createElement("div", { key: "b" }),
        createElement("div", { key: "c" }),
      ]);
    } finally {
      globalThis.Set = OriginalSet;
    }

    expect(setConstructions).toBe(0);
  });

  test("rejects non-host keyed row fast path before walking key order", async () => {
    const hostReconcilerSource = await readFile(
      join(process.cwd(), "packages/react-compat/src/host-reconciler.ts"),
      "utf8",
    );

    expect(hostReconcilerSource).toContain("!isKeyedRowHostElementCandidate(children[0])");
    expect(hostReconcilerSource).toContain("function isKeyedRowHostElementCandidate(");
  });

  test("uses production host fast paths when no process global exists", async () => {
    // Browsers without bundler define rewriting have no process global at all.
    // The fast-path gate must treat that as production instead of silently
    // disabling every host fast path in deployed browser bundles.
    const globalWithProcess = globalThis as { process?: NodeJS.Process };
    const originalProcess = globalWithProcess.process;
    vi.resetModules();

    try {
      delete globalWithProcess.process;
      const [hostReconciler, fiber, compat] = await Promise.all([
        import("../src/host-reconciler.js"),
        import("../src/fiber.js"),
        import("../src/index.js"),
      ]);
      const container = document.createElement("div");
      const root = fiber.createFiberRoot(container);
      const work = hostReconciler.renderHostFiberRoot(
        root,
        compat.createElement("main", { id: "app" }, "Hello"),
      );

      expect(work.child?.tag).toBe("host-component");
      expect(work.child?.child).toBeUndefined();
    } finally {
      globalWithProcess.process = originalProcess;
      vi.resetModules();
    }
  });

  test("does not eagerly compute hydration component names without hydration options", async () => {
    const hostReconcilerSource = await readFile(
      join(process.cwd(), "packages/react-compat/src/host-reconciler.ts"),
      "utf8",
    );

    expect(hostReconcilerSource).not.toContain(
      "withHydrationComponentStack(\n      options,\n      getComponentName(",
    );
    expect(hostReconcilerSource).toContain("getHydrationChildOptions(");
  });

  test("keeps vi.stubEnv control over host fast paths in node test environments", () => {
    vi.stubEnv("NODE_ENV", "development");
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    const work = renderHostFiberRoot(root, createElement("main", null, "Hello"));

    // Development keeps the canonical fiber shape with a child text fiber.
    expect(work.child?.tag).toBe("host-component");
    expect(work.child?.child).toBeDefined();
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

  test("updates direct host text without enumerating unchanged host props during commit", () => {
    vi.stubEnv("NODE_ENV", "production");
    const container = document.createElement("div");
    const root = createFiberRoot(container);
    const initial = renderHostFiberRoot(root, createElement("span", null, "0"));

    root.finishedWork = initial;
    commitHostFiberRoot(root, initial);
    root.current = initial;

    const updated = renderHostFiberRoot(root, createElement("span", null, "1"));
    let propEnumerations = 0;
    const originalProps = updated.child?.pendingProps;

    if (typeof originalProps !== "object" || originalProps === null) {
      expect.fail("expected host props");
    }

    updated.child!.pendingProps = new Proxy(originalProps as Record<string, unknown>, {
      ownKeys(target) {
        propEnumerations += 1;
        return Reflect.ownKeys(target);
      },
    });

    commitHostFiberRoot(root, updated);

    expect(container.textContent).toBe("1");
    expect(propEnumerations).toBe(0);
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

  test("commits keyed swaps for dependency-free memo rows", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const Row = memo(
      function Row(props: { readonly id: number }) {
        return createElement("span", { "data-key": props.id, key: props.id }, props.id);
      },
      (previous, next) => previous.id === next.id,
    );
    const renderRows = (ids: readonly number[]) => {
      flushSync(() => {
        root.render(ids.map((id) => createElement(Row, { id, key: id })));
      });
    };

    renderRows([1, 2, 3]);
    const first = container.children[0];
    const second = container.children[1];
    const third = container.children[2];

    renderRows([1, 3, 2]);

    expect(container.innerHTML).toBe(
      '<span data-key="1">1</span><span data-key="3">3</span><span data-key="2">2</span>',
    );
    expect(container.children[0]).toBe(first);
    expect(container.children[1]).toBe(third);
    expect(container.children[2]).toBe(second);
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

  test("reconciles append-only keyed rows without pre-counting unchanged siblings", () => {
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

    const first = root.current.child;
    const second = first?.sibling;
    const third = second?.sibling;

    if (first === undefined || second === undefined || third === undefined) {
      expect.fail("expected three row fibers");
    }

    let siblingReads = 0;

    const countSiblingReads = (fiber: typeof first, sibling: typeof first | undefined) => {
      Object.defineProperty(fiber, "sibling", {
        configurable: true,
        get() {
          siblingReads += 1;
          return sibling;
        },
        set(next) {
          sibling = next;
        },
      });
    };

    countSiblingReads(first, second);
    countSiblingReads(second, third);
    countSiblingReads(third, undefined);

    renderHostFiberRoot(root, [
      createElement("div", { "data-key": 0, key: 0 }, "Row 0"),
      createElement("div", { "data-key": 1, key: 1 }, "Row 1"),
      createElement("div", { "data-key": 2, key: 2 }, "Row 2"),
      createElement("div", { "data-key": 3, key: 3 }, "Row 3"),
    ]);

    expect(siblingReads).toBe(6);
  });

  test("commits append-only keyed rows without rescanning unchanged siblings", () => {
    vi.stubEnv("NODE_ENV", "production");
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
        createElement("span", { "data-key": "b", key: "b" }, "B"),
        createElement("span", { "data-key": "c", key: "c" }, "C"),
        createElement("span", { "data-key": "d", key: "d" }, "D"),
        createElement("span", { "data-key": "e", key: "e" }, "E"),
      ]),
    );
    const currentFirst = root.current.child?.child;
    const updatedFirst = updated.child?.child;

    if (currentFirst === undefined || updatedFirst === undefined) {
      expect.fail("expected keyed row children");
    }

    Object.defineProperty(currentFirst, "sibling", {
      configurable: true,
      get() {
        throw new Error("commit should not rescan the unchanged current prefix");
      },
    });
    Object.defineProperty(updatedFirst, "sibling", {
      configurable: true,
      get() {
        throw new Error("commit should not rescan the unchanged next prefix");
      },
    });

    commitHostFiberRoot(root, updated);

    expect(container.innerHTML).toBe(
      '<span data-key="a">A</span><span data-key="b">B</span><span data-key="c">C</span><span data-key="d">D</span><span data-key="e">E</span>',
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

  test("removes SVG grandchildren when a component child collapses to null", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    function ShapeLayer(props: { readonly visible: boolean }) {
      return props.visible
        ? [
            createElement("path", { className: "recharts-radar-polygon", key: "radar" }),
            createElement("path", { className: "recharts-line-curve", key: "line" }),
          ]
        : null;
    }

    flushSync(() => {
      root.render(
        createElement(
          "svg",
          null,
          createElement("g", { className: "recharts-layer" }, createElement(ShapeLayer, { visible: true })),
        ),
      );
    });
    expect(container.querySelectorAll("path")).toHaveLength(2);

    flushSync(() => {
      root.render(
        createElement(
          "svg",
          null,
          createElement("g", { className: "recharts-layer" }, createElement(ShapeLayer, { visible: false })),
        ),
      );
    });

    expect(container.querySelectorAll("path")).toHaveLength(0);
    expect(container.innerHTML).toBe('<svg><g class="recharts-layer"></g></svg>');
    root.unmount();
  });

  test("removes stale keyed SVG grandchildren when a component child shifts its range", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    function Trapezoids(props: { readonly ids: readonly number[] }) {
      return props.ids.map((id) =>
        createElement("path", {
          className: `trapezoid-${id}`,
          d: `M${id} ${id}`,
          key: id,
        }),
      );
    }

    flushSync(() => {
      root.render(
        createElement(
          "svg",
          null,
          createElement("g", { className: "recharts-funnel" }, createElement(Trapezoids, { ids: [1, 2, 3] })),
        ),
      );
    });

    flushSync(() => {
      root.render(
        createElement(
          "svg",
          null,
          createElement("g", { className: "recharts-funnel" }, createElement(Trapezoids, { ids: [2, 3, 4] })),
        ),
      );
    });

    expect(Array.from(container.querySelectorAll("path"), (path) => path.getAttribute("class"))).toEqual([
      "trapezoid-2",
      "trapezoid-3",
      "trapezoid-4",
    ]);
    root.unmount();
  });

  test("preserves unmanaged SVG children during descendant prop updates", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    function ManagedPath(props: { readonly selected: boolean }) {
      return createElement("path", {
        className: props.selected ? "managed selected" : "managed",
        d: "M0 0",
      });
    }

    flushSync(() => {
      root.render(
        createElement(
          "svg",
          null,
          createElement("g", { className: "recharts-layer" }, createElement(ManagedPath, { selected: false })),
        ),
      );
    });

    const unmanaged = document.createElementNS("http://www.w3.org/2000/svg", "path");
    unmanaged.setAttribute("class", "unmanaged");
    container.querySelector("svg")?.appendChild(unmanaged);

    flushSync(() => {
      root.render(
        createElement(
          "svg",
          null,
          createElement("g", { className: "recharts-layer" }, createElement(ManagedPath, { selected: true })),
        ),
      );
    });

    expect(Array.from(container.querySelectorAll("path"), (path) => path.getAttribute("class"))).toEqual([
      "managed selected",
      "unmanaged",
    ]);
    root.unmount();
  });
});
