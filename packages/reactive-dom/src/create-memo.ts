import {
  MEMO_RENDER_VALUE,
  type MemoRenderValue,
  type RenderValue,
} from "./types.js";

/** Creates a memo render value for an owner-scoped dynamic insertion. */
export function createMemo<P>(
  type: unknown,
  props: P,
  render: (props: P) => RenderValue,
  compare: (previous: P, next: P) => boolean = shallowEqualProps,
): MemoRenderValue<P> {
  return {
    [MEMO_RENDER_VALUE]: true,
    type,
    props,
    render,
    compare,
  };
}

export function isMemoRenderValue(value: unknown): value is MemoRenderValue {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { [MEMO_RENDER_VALUE]?: unknown })[MEMO_RENDER_VALUE] === true
  );
}

function shallowEqualProps(previous: unknown, next: unknown): boolean {
  if (Object.is(previous, next)) {
    return true;
  }

  if (!isPlainProps(previous) || !isPlainProps(next)) {
    return false;
  }

  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);

  return (
    previousKeys.length === nextKeys.length &&
    previousKeys.every(
      (key) => Object.hasOwn(next, key) && Object.is(previous[key], next[key]),
    )
  );
}

function isPlainProps(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
