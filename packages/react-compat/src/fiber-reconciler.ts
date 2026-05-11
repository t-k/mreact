import {
  Fragment,
  isReactCompatElement,
  type ReactCompatNode,
} from "./element.js";
import { reconcileChildFibers } from "./fiber-child.js";
import { type Fiber, type FiberRoot } from "./fiber.js";

export function performUnitOfWork(
  root: FiberRoot,
  unit: Fiber,
): Fiber | undefined {
  const next = beginWork(unit);

  if (next !== undefined) {
    return next;
  }

  return completeUnitOfWork(root, unit);
}

export function beginWork(unit: Fiber): Fiber | undefined {
  if (unit.tag === "host-root") {
    const children = (unit.pendingProps as { children?: ReactCompatNode })
      .children;
    return reconcileChildFibers(
      unit,
      unit.alternate?.child,
      children as ReactCompatNode,
    );
  }

  if (unit.tag === "host-component") {
    const children = (unit.pendingProps as { children?: ReactCompatNode })
      .children;
    return reconcileChildFibers(
      unit,
      unit.alternate?.child,
      children as ReactCompatNode,
    );
  }

  if (unit.tag === "fragment") {
    return reconcileChildFibers(
      unit,
      unit.alternate?.child,
      unit.pendingProps as ReactCompatNode,
    );
  }

  if (unit.tag === "function-component" && isFunctionComponentType(unit.type)) {
    const children = unit.type(unit.pendingProps as Record<string, unknown>);
    return reconcileChildFibers(unit, unit.alternate?.child, children);
  }

  return undefined;
}

export function completeWork(unit: Fiber): void {
  if (unit.tag === "host-component") {
    const current = unit.alternate;

    unit.stateNode =
      current?.tag === "host-component" &&
      current.type === unit.type &&
      current.stateNode instanceof HTMLElement
        ? current.stateNode
        : document.createElement(String(unit.type));
    return;
  }

  if (unit.tag === "host-text") {
    const current = unit.alternate;

    unit.stateNode =
      current?.tag === "host-text" && current.stateNode instanceof Text
        ? current.stateNode
        : document.createTextNode("");
  }
}

function completeUnitOfWork(
  root: FiberRoot,
  completedWork: Fiber,
): Fiber | undefined {
  let unit: Fiber | undefined = completedWork;

  while (unit !== undefined) {
    completeWork(unit);

    if (unit.sibling !== undefined) {
      return unit.sibling;
    }

    if (unit.return === undefined) {
      root.finishedWork = unit;
      return undefined;
    }

    unit = unit.return;
  }

  return undefined;
}

export function canReconcileConcurrently(node: ReactCompatNode): boolean {
  if (
    node === null ||
    node === undefined ||
    typeof node === "boolean" ||
    typeof node === "string" ||
    typeof node === "number"
  ) {
    return true;
  }

  if (Array.isArray(node)) {
    return node.every(canReconcileConcurrently);
  }

  if (!isReactCompatElement(node)) {
    return false;
  }

  if (typeof node.type === "string" || node.type === Fragment) {
    return canReconcileConcurrently(node.props.children as ReactCompatNode);
  }

  return isFunctionComponentType(node.type);
}

function isFunctionComponentType(
  type: unknown,
): type is (props: Record<string, unknown>) => ReactCompatNode {
  return typeof type === "function";
}
