import {
  isReactCompatElement,
  type MemoType,
  type ReactCompatElement,
  type ReactCompatNode,
} from "./element.js";

export function getPendingProps(node: ReactCompatNode): unknown {
  if (!isReactCompatElement(node)) {
    return node;
  }

  return node.ref === null ? node.props : { ...node.props, ref: node.ref };
}

export function areMemoPropsEqual(
  memoType: Pick<MemoType<Record<string, unknown>>, "compare">,
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): boolean {
  return memoType.compare === undefined
    ? shallowEqual(previous, next)
    : memoType.compare(previous, next);
}

export function shallowEqual(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): boolean {
  if (Object.is(previous, next)) {
    return true;
  }

  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);

  if (previousKeys.length !== nextKeys.length) {
    return false;
  }

  return previousKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(next, key) &&
      Object.is(previous[key], next[key]),
  );
}

export function getElementPendingProps(element: ReactCompatElement): unknown {
  return getPendingProps(element);
}
