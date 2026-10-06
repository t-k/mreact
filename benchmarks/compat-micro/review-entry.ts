import { createElement, createRoot } from "../../packages/react-compat/src/index.js";
import { reconcileChildFibers } from "../../packages/react-compat/src/fiber-child.js";
import { createFiber, createFiberRoot, type Fiber } from "../../packages/react-compat/src/fiber.js";
import { commitFiberRoot } from "../../packages/react-compat/src/fiber-commit.js";
import { renderHostFiberRoot } from "../../packages/react-compat/src/fiber-host.js";

function oldChildren(count: number): Fiber[] {
  const children = Array.from({ length: count }, (_, id) => {
    const fiber = createFiber("host-component", undefined, String(id));
    fiber.type = "li";
    return fiber;
  });
  for (let id = 1; id < count; id += 1) children[id - 1]!.sibling = children[id];
  return children;
}

function rows(count: number, refMode: string, removed = -1, offset = 0) {
  return createElement("ul", null, Array.from({ length: count }, (_, id) => {
    if (id === removed) return null;
    const ref = refMode === "all" || (refMode === "sparse" && id % 100 === 0) ? refs[id] : undefined;
    return createElement("li", { key: String(id + offset), ref }, String(id + offset));
  }));
}

let refCalls = 0;
let refs: ((node: unknown) => void)[] = [];
let prepared: { root: ReturnType<typeof createFiberRoot>; container: Element; count: number; refMode: string } | undefined;

function reconcile(count: number, mode: string) {
  const current = oldChildren(count);
  const parent = createFiber("host-component");
  const next = mode === "delete" ? [] : Array.from({ length: count }, (_, id) => id === count / 2 && mode === "single" ? null : createElement(mode === "replace" ? "section" : "li", { key: String(id) }));
  const start = performance.now();
  reconcileChildFibers(parent, current[0], next);
  const ms = performance.now() - start;
  const expected = mode === "single" ? 1 : count;
  if (parent.deletions?.length !== expected) throw new Error(`Expected ${expected} deletions, got ${parent.deletions?.length}`);
  return { total: ms };
}

function host(count: number, refMode: string) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createFiberRoot(container);
  refs = Array.from({ length: count }, () => (node: unknown) => { if (node === null) refCalls += 1; });
  root.finishedWork = renderHostFiberRoot(root, rows(count, refMode));
  commitFiberRoot(root);
  refCalls = 0;
  const next = rows(count, refMode, count / 2);
  const start = performance.now();
  root.finishedWork = renderHostFiberRoot(root, next);
  const rendered = performance.now();
  commitFiberRoot(root);
  const committed = performance.now();
  if (container.querySelectorAll("li").length !== count - 1) throw new Error("Host deletion did not remove one row");
  if (refCalls !== (refMode === "none" ? 0 : 1)) throw new Error(`Unexpected ref detaches: ${refCalls}`);
  container.remove();
  refs = [];
  return { render: rendered - start, commit: committed - rendered, total: committed - start };
}

function full(count: number, mode: string) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  if (mode !== "create") root.render(rows(count, "none"));
  const next = mode === "delete" ? null : rows(count, "none", -1, mode === "replace" ? count : 0);
  const start = performance.now();
  root.render(next);
  const ms = performance.now() - start;
  if (container.querySelectorAll("li").length !== (mode === "delete" ? 0 : count)) throw new Error("Full render output changed");
  root.unmount();
  container.remove();
  return { total: ms };
}

function prepareHost(count: number, refMode: string) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createFiberRoot(container);
  refs = Array.from({ length: count }, () => (node: unknown) => { if (node === null) refCalls += 1; });
  root.finishedWork = renderHostFiberRoot(root, rows(count, refMode));
  commitFiberRoot(root);
  refCalls = 0;
  root.finishedWork = renderHostFiberRoot(root, rows(count, refMode, count / 2));
  prepared = { root, container, count, refMode };
}

function commitPrepared() {
  if (prepared === undefined) throw new Error("Prepare a host commit first");
  commitFiberRoot(prepared.root);
}

function cleanupPrepared() {
  if (prepared === undefined) throw new Error("Prepare a host commit first");
  if (prepared.container.querySelectorAll("li").length !== prepared.count - 1) throw new Error("Profiled commit output changed");
  if (refCalls !== (prepared.refMode === "none" ? 0 : 1)) throw new Error("Profiled ref cleanup changed");
  prepared.container.remove();
  prepared = undefined;
  refs = [];
}

(globalThis as unknown as { __review: unknown }).__review = { reconcile, host, full, prepareHost, commitPrepared, cleanupPrepared };
