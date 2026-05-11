export const REACT_COMPAT_ELEMENT_TYPE = Symbol.for("modular.react.element");
export const ERROR_BOUNDARY_TYPE = Symbol.for("modular.react.error_boundary");
export const FORWARD_REF_TYPE = Symbol.for("modular.react.forward_ref");
export const MEMO_TYPE = Symbol.for("modular.react.memo");
export const LAZY_TYPE = Symbol.for("modular.react.lazy");
export const STRICT_MODE_TYPE = Symbol.for("modular.react.strict_mode");
export const PORTAL_TYPE = Symbol.for("modular.react.portal");
export const Fragment = Symbol.for("modular.react.fragment");
export const Suspense = Symbol.for("modular.react.suspense");
export const SuspenseList = Symbol.for("modular.react.suspense_list");

export interface ReactCompatProviderType {
  $$typeof: symbol;
  context: unknown;
}

export type ElementType<P = Record<string, unknown>> =
  | string
  | typeof Fragment
  | typeof Suspense
  | typeof SuspenseList
  | typeof ERROR_BOUNDARY_TYPE
  | typeof STRICT_MODE_TYPE
  | ReactCompatProviderType
  | ForwardRefType<P>
  | MemoType<P>
  | LazyType<P>
  | ((props: P) => ReactCompatNode)
  | (new (props: P) => { render(): ReactCompatNode });

export type ReactCompatNode =
  | ReactCompatElement
  | ReactCompatPortal
  | string
  | number
  | boolean
  | null
  | undefined
  | ReactCompatNode[];

export interface ReactCompatElement<P = Record<string, unknown>> {
  $$typeof: typeof REACT_COMPAT_ELEMENT_TYPE;
  type: ElementType<P>;
  key: string | null;
  ref: unknown;
  props: P & { children?: ReactCompatNode };
}

export interface ReactCompatPortal {
  $$typeof: typeof PORTAL_TYPE;
  container: Element;
  children: ReactCompatNode;
  key: string | null;
}

export function createElement<P extends Record<string, unknown>>(
  type: ElementType<P>,
  config: (P & { key?: unknown; ref?: unknown }) | null,
  ...children: ReactCompatNode[]
): ReactCompatElement<P> {
  const props = { ...config } as P & {
    children?: ReactCompatNode;
    key?: unknown;
    ref?: unknown;
  };
  const key = props.key === undefined ? null : String(props.key);
  const ref = props.ref ?? null;

  delete props.key;
  delete props.ref;

  if (children.length === 1) {
    props.children = children[0];
  } else if (children.length > 1) {
    props.children = children;
  }

  return {
    $$typeof: REACT_COMPAT_ELEMENT_TYPE,
    type,
    key,
    ref,
    props: props as P & { children?: ReactCompatNode },
  };
}

export function isReactCompatElement(
  value: unknown,
): value is ReactCompatElement {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === REACT_COMPAT_ELEMENT_TYPE
  );
}

export function createPortal(
  children: ReactCompatNode,
  container: Element,
  key?: unknown,
): ReactCompatPortal {
  return {
    $$typeof: PORTAL_TYPE,
    container,
    children,
    key: key === undefined ? null : String(key),
  };
}

export function isReactCompatPortal(value: unknown): value is ReactCompatPortal {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === PORTAL_TYPE
  );
}

export function createRef<T>(): { current: T | null } {
  return { current: null };
}

export interface ForwardRefType<P = Record<string, unknown>> {
  $$typeof: typeof FORWARD_REF_TYPE;
  render: (props: P, ref: unknown) => ReactCompatNode;
}

export interface MemoType<P = Record<string, unknown>> {
  $$typeof: typeof MEMO_TYPE;
  type: ElementType<P>;
  compare?: (previous: P, next: P) => boolean;
}

export interface LazyType<P = Record<string, unknown>> {
  $$typeof: typeof LAZY_TYPE;
  load: () => Promise<{ default: ElementType<P> }>;
  status: "uninitialized" | "pending" | "resolved" | "rejected";
  promise?: Promise<void>;
  resolved?: ElementType<P>;
  error?: unknown;
}

export function forwardRef<P, T>(
  render: (props: P, ref: { current: T | null } | ((value: T | null) => void) | null) => ReactCompatNode,
): ForwardRefType<P & { ref?: unknown }> {
  return { $$typeof: FORWARD_REF_TYPE, render: render as ForwardRefType<P>["render"] };
}

export function memo<P>(
  type: ElementType<P>,
  compare?: (previous: P, next: P) => boolean,
): MemoType<P> {
  return compare === undefined
    ? { $$typeof: MEMO_TYPE, type }
    : { $$typeof: MEMO_TYPE, type, compare };
}

export function lazy<P>(
  load: () => Promise<{ default: ElementType<P> }>,
): LazyType<P> {
  return {
    $$typeof: LAZY_TYPE,
    load,
    status: "uninitialized",
  };
}

export const StrictMode = STRICT_MODE_TYPE;

export function cloneElement<P extends Record<string, unknown>>(
  element: ReactCompatElement<P>,
  props: Partial<P> | null,
  ...children: ReactCompatNode[]
): ReactCompatElement<P> {
  const nextProps = {
    ...element.props,
    ...props,
  } as P & { key?: unknown; ref?: unknown };
  const key = nextProps.key === undefined ? element.key : String(nextProps.key);
  const ref = nextProps.ref === undefined ? element.ref : nextProps.ref;

  delete nextProps.key;
  delete nextProps.ref;

  if (children.length === 1) {
    (nextProps as P & { children?: ReactCompatNode }).children = children[0];
  } else if (children.length > 1) {
    (nextProps as P & { children?: ReactCompatNode }).children = children;
  }

  return {
    $$typeof: REACT_COMPAT_ELEMENT_TYPE,
    type: element.type,
    key,
    ref,
    props: nextProps as P & { children?: ReactCompatNode },
  };
}

export const isValidElement = isReactCompatElement;

export const Children = {
  map<T>(
    children: ReactCompatNode,
    fn: (child: Exclude<ReactCompatNode, null | undefined | boolean>, index: number) => T,
  ): T[] | null {
    if (children === null || children === undefined) {
      return null;
    }

    return flattenChildren(children).map((child, index) =>
      fn(child as Exclude<ReactCompatNode, null | undefined | boolean>, index),
    );
  },
  count(children: ReactCompatNode): number {
    if (children === null || children === undefined) {
      return 0;
    }

    return flattenChildren(children).length;
  },
  toArray(children: ReactCompatNode): Exclude<ReactCompatNode, null | undefined | boolean>[] {
    return toChildArray(children);
  },
  only(children: ReactCompatNode): Exclude<ReactCompatNode, null | undefined | boolean> {
    const array = toChildArray(children);

    if (array.length !== 1) {
      throw new Error("Expected exactly one child.");
    }

    return array[0] as Exclude<ReactCompatNode, null | undefined | boolean>;
  },
};

function toChildArray(
  children: ReactCompatNode,
): Exclude<ReactCompatNode, null | undefined | boolean>[] {
  return flattenChildren(children).filter(
    (child): child is Exclude<ReactCompatNode, null | undefined | boolean> =>
      child !== null && child !== undefined && typeof child !== "boolean",
  );
}

function flattenChildren(children: ReactCompatNode): ReactCompatNode[] {
  if (Array.isArray(children)) {
    return children.flatMap((child) => flattenChildren(child));
  }

  return [children];
}

export interface ErrorBoundaryOptions {
  fallback: (error: Error) => ReactCompatNode;
  onError?: (error: Error) => void;
}

export function createErrorBoundary(
  options: ErrorBoundaryOptions,
  children: ReactCompatNode,
): ReactCompatElement<ErrorBoundaryOptions & { children: ReactCompatNode }> {
  return createElement(ERROR_BOUNDARY_TYPE, {
    ...options,
    children,
  });
}
