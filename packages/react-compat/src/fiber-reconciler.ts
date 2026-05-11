import {
  ERROR_BOUNDARY_TYPE,
  FORWARD_REF_TYPE,
  Fragment,
  LAZY_TYPE,
  MEMO_TYPE,
  Suspense,
  SuspenseList,
  createElement,
  isReactCompatElement,
  type LazyType,
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
import { DidCapture } from "./fiber-flags.js";
import { isThenable } from "./thenable.js";

interface ContextProviderFiberState {
  provider: ReactCompatProvider<unknown>;
  pushed: boolean;
}

interface SuspenseFiberState {
  didSuspend: boolean;
}

export function performUnitOfWork(
  root: FiberRoot,
  unit: Fiber,
): Fiber | undefined {
  let next: Fiber | undefined;

  try {
    next = beginWork(unit);
  } catch (error) {
    return captureThrownValue(root, unit, error);
  }

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

  if (unit.tag === "lazy" && isLazyType(unit.type)) {
    const lazyType = unit.type;

    if (lazyType.status === "resolved" && lazyType.resolved !== undefined) {
      return reconcileChildFibers(
        unit,
        unit.alternate?.child,
        createElement(lazyType.resolved, unit.pendingProps as Record<string, unknown>),
      );
    }

    if (lazyType.status === "rejected") {
      throw lazyType.error;
    }

    if (lazyType.status === "uninitialized") {
      lazyType.status = "pending";
      lazyType.promise = lazyType
        .load()
        .then((module) => {
          lazyType.status = "resolved";
          lazyType.resolved = module.default;
        })
        .catch((error: unknown) => {
          lazyType.status = "rejected";
          lazyType.error = error;
        });
    }

    throw lazyType.promise;
  }

  if (unit.tag === "suspense" && unit.type === Suspense) {
    unit.memoizedState = { didSuspend: false } satisfies SuspenseFiberState;
    return reconcileChildFibers(
      unit,
      unit.alternate?.child,
      (unit.pendingProps as { children?: ReactCompatNode }).children,
    );
  }

  if (unit.tag === "suspense-list" && unit.type === SuspenseList) {
    return reconcileChildFibers(
      unit,
      unit.alternate?.child,
      (unit.pendingProps as { children?: ReactCompatNode }).children,
    );
  }

  if (unit.tag === "error-boundary" && unit.type === ERROR_BOUNDARY_TYPE) {
    return reconcileChildFibers(
      unit,
      unit.alternate?.child,
      (unit.pendingProps as { children?: ReactCompatNode }).children,
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

  if (node.type === Suspense || node.type === SuspenseList) {
    return true;
  }

  if (node.type === ERROR_BOUNDARY_TYPE) {
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

  return (
    isFunctionComponentType(node.type) ||
    isForwardRefType(node.type) ||
    isLazyType(node.type)
  );
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

function isLazyType(
  type: unknown,
): type is LazyType<Record<string, unknown>> {
  return (
    typeof type === "object" &&
    type !== null &&
    (type as { $$typeof?: unknown }).$$typeof === LAZY_TYPE
  );
}

function canReconcileElementTypeConcurrently(type: unknown): boolean {
  return (
    typeof type === "string" ||
    type === Fragment ||
    isFunctionComponentType(type) ||
    isForwardRefType(type) ||
    isLazyType(type) ||
    (isMemoType(type) && canReconcileElementTypeConcurrently(type.type))
  );
}

function captureThrownValue(
  root: FiberRoot,
  source: Fiber,
  thrownValue: unknown,
): Fiber | undefined {
  let boundary = source.return;

  while (boundary !== undefined) {
    if (isThenable(thrownValue) && boundary.tag === "suspense") {
      return captureSuspenseBoundary(root, boundary);
    }

    if (!isThenable(thrownValue) && boundary.tag === "error-boundary") {
      return captureErrorBoundary(root, boundary, thrownValue);
    }

    boundary = boundary.return;
  }

  throw thrownValue;
}

function captureSuspenseBoundary(
  root: FiberRoot,
  boundary: Fiber,
): Fiber | undefined {
  cleanupUnfinishedWork(boundary.child);
  boundary.flags |= DidCapture;
  boundary.memoizedState = { didSuspend: true } satisfies SuspenseFiberState;
  boundary.child = reconcileChildFibers(
    boundary,
    boundary.alternate?.child,
    (boundary.pendingProps as { fallback?: ReactCompatNode }).fallback,
  );
  applySuspenseListRevealOrder(boundary);
  return boundary.child ?? completeUnitOfWork(root, boundary);
}

function captureErrorBoundary(
  root: FiberRoot,
  boundary: Fiber,
  thrownValue: unknown,
): Fiber | undefined {
  cleanupUnfinishedWork(boundary.child);
  boundary.flags |= DidCapture;
  const error = thrownValue instanceof Error ? thrownValue : new Error(String(thrownValue));
  const props = boundary.pendingProps as {
    fallback?: unknown;
    onError?: unknown;
  };

  if (typeof props.onError === "function") {
    (props.onError as (error: Error) => void)(error);
  }

  const fallback =
    typeof props.fallback === "function"
      ? (props.fallback as (error: Error) => ReactCompatNode)(error)
      : null;
  boundary.child = reconcileChildFibers(boundary, boundary.alternate?.child, fallback);
  return boundary.child ?? completeUnitOfWork(root, boundary);
}

function applySuspenseListRevealOrder(boundary: Fiber): void {
  const parent = boundary.return;

  if (parent?.tag !== "suspense-list") {
    return;
  }

  const revealOrder = (parent.pendingProps as { revealOrder?: unknown }).revealOrder;

  if (revealOrder === "forwards") {
    boundary.sibling = undefined;
  } else if (revealOrder === "backwards") {
    parent.child = boundary;
  }
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
