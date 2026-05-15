import type { JsxNodeIr, ModuleIr } from "./ir.js";

export function assignOxcAwaitIds(ir: ModuleIr): void {
  let counter = 0;

  for (const component of ir.components) {
    counter = walkForAwaitIds(component.root, counter);
  }
}

function walkForAwaitIds(node: JsxNodeIr, counter: number): number {
  let next = counter;

  if (node.kind === "async-boundary") {
    node.awaitId = `await${next.toString(36)}`;
    next += 1;

    for (const child of node.children) {
      next = walkForAwaitIds(child, next);
    }

    if (node.placeholderChildren !== undefined) {
      for (const child of node.placeholderChildren) {
        next = walkForAwaitIds(child, next);
      }
    }

    if (node.catchChildren !== undefined) {
      for (const child of node.catchChildren) {
        next = walkForAwaitIds(child, next);
      }
    }

    return next;
  }

  if (node.kind === "element" || node.kind === "fragment" || node.kind === "component") {
    for (const child of node.children) {
      next = walkForAwaitIds(child, next);
    }
    return next;
  }

  if (node.kind === "conditional") {
    for (const child of node.whenTrue) {
      next = walkForAwaitIds(child, next);
    }
    for (const child of node.whenFalse) {
      next = walkForAwaitIds(child, next);
    }
    return next;
  }

  if (node.kind === "list") {
    for (const child of node.children) {
      next = walkForAwaitIds(child, next);
    }
    return next;
  }

  return next;
}
