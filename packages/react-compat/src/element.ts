export const REACT_COMPAT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
export const ERROR_BOUNDARY_TYPE = Symbol.for("modular.react.error_boundary");
export const FORWARD_REF_TYPE = Symbol.for("react.forward_ref");
export const MEMO_TYPE = Symbol.for("react.memo");
export const LAZY_TYPE = Symbol.for("react.lazy");
export const STRICT_MODE_TYPE = Symbol.for("react.strict_mode");
export const PORTAL_TYPE = Symbol.for("react.portal");
const REACT_COMPAT_PROVIDER_TYPE = Symbol.for("react.context");
export const Fragment = Symbol.for("react.fragment");
export const Suspense = Symbol.for("react.suspense");
export const SuspenseList = Symbol.for("react.suspense_list");
export const Activity = Symbol.for("react.activity");
export const Profiler = Symbol.for("react.profiler");
export const HOST_OWN_PROPS_META = Symbol.for("modular.react.host_own_props_meta");
export const HOST_CHILDREN_ONLY_PROPS_META = Symbol.for(
  "modular.react.host_children_only_props_meta",
);
export const REACTIVE_TEXT_BINDING_META = Symbol.for(
  "modular.react.reactive_text_binding_meta",
);
const hasOwnProperty = Object.prototype.hasOwnProperty;

export interface ReactCompatProviderType {
  $$typeof: symbol;
  context: unknown;
}

export interface ReactCompatContextProviderShorthand {
  Provider: ReactCompatProviderType;
  Consumer: unknown;
}

export type ElementType<P = Record<string, unknown>> =
  | string
  | typeof Fragment
  | typeof Suspense
  | typeof SuspenseList
  | typeof Activity
  | typeof Profiler
  | typeof ERROR_BOUNDARY_TYPE
  | typeof STRICT_MODE_TYPE
  | ReactCompatContextProviderShorthand
  | ReactCompatProviderType
  | ForwardRefType<P>
  | MemoType<P>
  | LazyType<P>
  | ((props: P) => ReactCompatNode | PromiseLike<ReactCompatNode>)
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
  config: (P & ReactReservedProps) | null,
  ...children: ReactCompatNode[]
): ReactCompatElement<P> {
  if (typeof type === "string") {
    const key = config?.key === undefined ? null : String(config.key);
    const ref = config?.ref ?? null;
    const props = copyElementProps(config) as P & { children?: ReactCompatNode };

    if (children.length === 1) {
      props.children = children[0];
    } else if (children.length > 1) {
      props.children = children;
    }

    setHostOwnPropsMeta(props);

    return {
      $$typeof: REACT_COMPAT_ELEMENT_TYPE,
      type,
      key,
      ref,
      props,
    };
  }

  const normalizedType =
    typeof type === "object" && type !== null ? normalizeElementType(type) : type;
  const key = config?.key === undefined ? null : String(config.key);
  const ref = config?.ref ?? null;
  const props = applyDefaultProps(normalizedType, copyElementProps(config)) as P & {
    children?: ReactCompatNode;
  };

  if (children.length === 1) {
    props.children = children[0];
  } else if (children.length > 1) {
    props.children = children;
  }

  if (typeof normalizedType === "string") {
    setHostOwnPropsMeta(props);
  }

  return {
    $$typeof: REACT_COMPAT_ELEMENT_TYPE,
    type: normalizedType as ElementType<P>,
    key,
    ref,
    props: props as P & { children?: ReactCompatNode },
  };
}

export function createElementFromJsxConfig<P extends Record<string, unknown>>(
  type: ElementType<P>,
  config: (P & ReactReservedProps & { children?: ReactCompatNode }) | null,
  keyArgument?: unknown,
): ReactCompatElement<P> {
  const normalizedType =
    typeof type === "object" && type !== null ? normalizeElementType(type) : type;
  const key = keyArgument !== undefined
    ? String(keyArgument)
    : config?.key === undefined ? null : String(config.key);
  const ref = config?.ref ?? null;
  const hasChildren = config !== null && config !== undefined && hasOwnProperty.call(config, "children");
  const children = config?.children;
  const copiedProps = copyElementProps(config, undefined, true);
  const props = (typeof normalizedType === "string"
    ? copiedProps
    : applyDefaultProps(normalizedType, copiedProps)) as P & {
      children?: ReactCompatNode;
    };

  if (hasChildren) {
    props.children = children;
  }

  if (typeof normalizedType === "string") {
    setHostOwnPropsMeta(props);
  }

  return {
    $$typeof: REACT_COMPAT_ELEMENT_TYPE,
    type: normalizedType as ElementType<P>,
    key,
    ref,
    props,
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
  const key = props === null || props.key === undefined ? element.key : String(props.key);
  const ref = props === null || props.ref === undefined ? element.ref : props.ref;
  const nextProps = applyDefaultProps(
    element.type,
    copyElementProps(props, element.props),
  ) as P & { children?: ReactCompatNode };

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

function copyElementProps(
  source: Record<string, unknown> | null | undefined,
  base?: Record<string, unknown>,
  omitChildren = false,
): Record<string, unknown> {
  const props: Record<PropertyKey, unknown> = {};

  if (base !== undefined) {
    copyOwnStringElementProps(base, props, omitChildren);
  }

  if (source === null || source === undefined) {
    return props as Record<string, unknown>;
  }

  copyOwnStringElementProps(source, props, omitChildren);
  copyOwnSymbolElementProps(source, props);
  return props as Record<string, unknown>;
}

function copyOwnStringElementProps(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  omitChildren: boolean,
): void {
  for (const name in source) {
    if (!hasOwnProperty.call(source, name)) {
      continue;
    }

    if (
      name !== "key" &&
      name !== "ref" &&
      name !== "__self" &&
      name !== "__source" &&
      (!omitChildren || name !== "children")
    ) {
      target[name] = source[name];
    }
  }
}

function copyOwnSymbolElementProps(
  source: Record<string, unknown>,
  target: Record<PropertyKey, unknown>,
): void {
  const symbolSource = source as Record<PropertyKey, unknown>;
  for (const symbol of Object.getOwnPropertySymbols(source)) {
    target[symbol] = symbolSource[symbol];
  }
}

function normalizeElementType<P>(type: ElementType<P>): ElementType<P> {
  return isReactCompatContextProviderShorthand(type) ? (type.Provider as ElementType<P>) : type;
}

function applyDefaultProps(
  type: unknown,
  props: Record<string, unknown>,
): Record<string, unknown> {
  if (typeof type !== "function" && (typeof type !== "object" || type === null)) {
    return props;
  }

  const defaultProps = (type as { defaultProps?: Record<string, unknown> } | undefined)
    ?.defaultProps;

  if (defaultProps === undefined) {
    return props;
  }

  for (const [name, value] of Object.entries(defaultProps)) {
    if (props[name] === undefined) {
      props[name] = value;
    }
  }

  return props;
}

interface ReactReservedProps {
  key?: unknown;
  ref?: unknown;
  __self?: unknown;
  __source?: unknown;
}

function isReactCompatContextProviderShorthand(
  value: unknown,
): value is ReactCompatContextProviderShorthand {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const provider = (value as { Provider?: unknown }).Provider;

  return (
    typeof provider === "object" &&
    provider !== null &&
    (provider as { $$typeof?: unknown }).$$typeof === REACT_COMPAT_PROVIDER_TYPE
  );
}

function setHostOwnPropsMeta(props: Record<string, unknown>): void {
  const dataKey = props["data-key"];

  if (typeof dataKey !== "number" || !Number.isSafeInteger(dataKey) || dataKey < 0) {
    if (hostPropsAreChildrenOnly(props)) {
      (props as { [HOST_CHILDREN_ONLY_PROPS_META]?: true })[
        HOST_CHILDREN_ONLY_PROPS_META
      ] = true;
    }
    return;
  }

  let selectedState = 0;

  for (const name in props) {
    if (!hasOwnProperty.call(props, name) || name === "children") {
      continue;
    }

    if (name === "data-key") {
      continue;
    }

    if (name === "className") {
      const value = props[name];

      if (value === undefined) {
        continue;
      }

      if (value !== "selected") {
        return;
      }

      selectedState |= 1;
      continue;
    }

    if (name === "data-selected") {
      const value = props[name];

      if (value === undefined) {
        continue;
      }

      if (value !== "true") {
        return;
      }

      selectedState |= 2;
      continue;
    }

    return;
  }

  (props as { [HOST_OWN_PROPS_META]?: number })[HOST_OWN_PROPS_META] =
    dataKey * 4 + selectedState;
}

function hostPropsAreChildrenOnly(props: Record<string, unknown>): boolean {
  for (const name in props) {
    if (hasOwnProperty.call(props, name) && name !== "children") {
      return false;
    }
  }

  return true;
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
  forEach(
    children: ReactCompatNode,
    fn: (child: Exclude<ReactCompatNode, null | undefined | boolean>, index: number) => void,
  ): void {
    toChildArray(children).forEach((child, index) => {
      fn(child, index);
    });
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
