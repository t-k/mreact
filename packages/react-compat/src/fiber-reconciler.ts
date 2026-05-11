import {
  FORWARD_REF_TYPE,
  Fragment,
  MEMO_TYPE,
  createElement,
  isReactCompatElement,
  type MemoType,
  type ReactCompatNode,
} from "./element.js";
import {
  isReactCompatConsumer,
  isReactCompatProvider,
  popContextProvider,
  pushContextProvider,
  useContext,
  type ReactCompatProvider,
} from "./context.js";
import { reconcileChildFibers } from "./fiber-child.js";
import { type Fiber, type FiberRoot } from "./fiber.js";

interface ContextProviderFiberState {
  provider: ReactCompatProvider<unknown>;
  pushed: boolean;
}

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

  if (unit.tag === "forward-ref" && isForwardRefType(unit.type)) {
    const props = unit.pendingProps as Record<string, unknown>;
    const children = unit.type.render(props, props.ref ?? null);
    return reconcileChildFibers(unit, unit.alternate?.child, children);
  }

  if (unit.tag === "memo" && isMemoType(unit.type)) {
    const previousProps = unit.alternate?.memoizedProps as
      | Record<string, unknown>
      | undefined;
    const nextProps = unit.pendingProps as Record<string, unknown>;

    if (
      unit.alternate !== undefined &&
      previousProps !== undefined &&
      areMemoPropsEqual(unit.type, previousProps, nextProps)
    ) {
      unit.child = unit.alternate.child;
      return undefined;
    }

    return reconcileChildFibers(
      unit,
      unit.alternate?.child,
      createElement(unit.type.type, nextProps),
    );
  }

  if (unit.tag === "context-provider" && isReactCompatProvider(unit.type)) {
    const props = unit.pendingProps as {
      value: unknown;
      children?: ReactCompatNode;
    };
    pushContextProvider(unit.type, props.value);
    unit.memoizedState = {
      provider: unit.type,
      pushed: true,
    } satisfies ContextProviderFiberState;
    return reconcileChildFibers(unit, unit.alternate?.child, props.children);
  }

  if (unit.tag === "context-consumer" && isReactCompatConsumer(unit.type)) {
    const props = unit.pendingProps as {
      children?: unknown;
    };
    const render =
      typeof props.children === "function"
        ? (props.children as (value: unknown) => ReactCompatNode)
        : () => null;
    return reconcileChildFibers(
      unit,
      unit.alternate?.child,
      render(useContext(unit.type.context)),
    );
  }

  return undefined;
}

export function completeWork(unit: Fiber): void {
  if (unit.tag === "context-provider") {
    popPushedContextProvider(unit);
  }

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

export function cleanupUnfinishedWork(unit: Fiber | undefined): void {
  if (unit === undefined) {
    return;
  }

  let cursor: Fiber | undefined = unit;

  while (cursor !== undefined) {
    cleanupUnfinishedWork(cursor.child);
    popPushedContextProvider(cursor);
    cursor = cursor.sibling;
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
      unit.memoizedProps = unit.pendingProps;
      root.finishedWork = unit;
      return undefined;
    }

    unit.memoizedProps = unit.pendingProps;
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

  if (isReactCompatProvider(node.type)) {
    return canReconcileConcurrently(node.props.children as ReactCompatNode);
  }

  if (isReactCompatConsumer(node.type)) {
    return typeof node.props.children === "function";
  }

  if (isMemoType(node.type)) {
    return canReconcileElementTypeConcurrently(node.type.type);
  }

  return isFunctionComponentType(node.type) || isForwardRefType(node.type);
}

function popPushedContextProvider(unit: Fiber): void {
  const state = unit.memoizedState as ContextProviderFiberState | undefined;

  if (state?.pushed === true) {
    popContextProvider(state.provider);
    state.pushed = false;
  }
}

function isFunctionComponentType(
  type: unknown,
): type is (props: Record<string, unknown>) => ReactCompatNode {
  return typeof type === "function";
}

function isForwardRefType(
  type: unknown,
): type is {
  $$typeof: typeof FORWARD_REF_TYPE;
  render: (props: Record<string, unknown>, ref: unknown) => ReactCompatNode;
} {
  return (
    typeof type === "object" &&
    type !== null &&
    (type as { $$typeof?: unknown }).$$typeof === FORWARD_REF_TYPE
  );
}

function isMemoType(
  type: unknown,
): type is MemoType<Record<string, unknown>> {
  return (
    typeof type === "object" &&
    type !== null &&
    (type as { $$typeof?: unknown }).$$typeof === MEMO_TYPE
  );
}

function canReconcileElementTypeConcurrently(type: unknown): boolean {
  return (
    typeof type === "string" ||
    type === Fragment ||
    isFunctionComponentType(type) ||
    isForwardRefType(type) ||
    (isMemoType(type) && canReconcileElementTypeConcurrently(type.type))
  );
}

function areMemoPropsEqual(
  memoType: MemoType<Record<string, unknown>>,
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): boolean {
  if (memoType.compare !== undefined) {
    return memoType.compare(previous, next);
  }

  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);

  if (previousKeys.length !== nextKeys.length) {
    return false;
  }

  return previousKeys.every((key) => Object.is(previous[key], next[key]));
}
