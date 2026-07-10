export const REACT_COMPAT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
export const ERROR_BOUNDARY_TYPE = Symbol.for("modular.react.error_boundary");
export const FORWARD_REF_TYPE = Symbol.for("react.forward_ref");
export const MEMO_TYPE = Symbol.for("react.memo");
export const LAZY_TYPE = Symbol.for("react.lazy");
export const STRICT_MODE_TYPE = Symbol.for("react.strict_mode");
export const PORTAL_TYPE = Symbol.for("react.portal");
export const REACTIVE_DOM_BLOCK_TYPE = Symbol.for("modular.react.reactive_dom_block");
const REACT_COMPAT_PROVIDER_TYPE = Symbol.for("react.context");
/** Symbol used to group JSX children without adding a host element. */
export const Fragment = Symbol.for("react.fragment");
/** Symbol used to suspend rendering while async content resolves. */
export const Suspense = Symbol.for("react.suspense");
/** Symbol used to coordinate multiple suspense boundaries. */
export const SuspenseList = Symbol.for("react.suspense_list");
/** Symbol used to mark activity boundaries in React-compatible trees. */
export const Activity = Symbol.for("react.activity");
/** Symbol used to measure render work with profiler callbacks. */
export const Profiler = Symbol.for("react.profiler");
export const HOST_CHILDREN_ONLY_PROPS_META = Symbol.for(
  "modular.react.host_children_only_props_meta",
);
/** Metadata key that links a state value to a reactive text binding. */
export const REACTIVE_TEXT_BINDING_META = Symbol.for(
  "modular.react.reactive_text_binding_meta",
);
/** Metadata key that links compiler-owned DOM blocks to component state. */
export const REACTIVE_STATE_BINDING_META = Symbol.for(
  "modular.react.reactive_state_binding_meta",
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

/** Element type accepted by createElement, JSX, and renderer entrypoints. */
export type ElementType<P = Record<string, unknown>> =
  | string
  | typeof Fragment
  | typeof Suspense
  | typeof SuspenseList
  | typeof Activity
  | typeof Profiler
  | typeof ERROR_BOUNDARY_TYPE
  | typeof REACTIVE_DOM_BLOCK_TYPE
  | typeof STRICT_MODE_TYPE
  | ReactCompatContextProviderShorthand
  | ReactCompatProviderType
  | ForwardRefType<P>
  | MemoType<P>
  | LazyType<P>
  | ((props: P) => ReactCompatNode | PromiseLike<ReactCompatNode>)
  | (new (props: P) => { render(): ReactCompatNode });

/** Element-shaped renderable value accepted regardless of its original prop shape. */
export interface ReactCompatRenderableElement {
  /** React-compatible element marker. */
  $$typeof: typeof REACT_COMPAT_ELEMENT_TYPE;
  /** Host tag, component, or special element type. */
  type: unknown;
  /** Normalized React key. */
  key: string | null;
  /** Normalized React ref. */
  ref: unknown;
  /** Element props with children widened to the renderable node surface. */
  props: { children?: ReactCompatNode };
}

/** Renderable value accepted by the React-compatible renderer. */
export type ReactCompatNode =
  | ReactCompatRenderableElement
  | ReactCompatPortal
  | string
  | number
  | boolean
  | null
  | undefined
  | ReactCompatNode[];

/** React-compatible element record produced by createElement and JSX transforms. */
export interface ReactCompatElement<P = Record<string, unknown>> {
  $$typeof: typeof REACT_COMPAT_ELEMENT_TYPE;
  type: ElementType<P>;
  key: string | null;
  ref: unknown;
  props: P & { children?: ReactCompatNode };
}

/** Portal record that renders children into an external DOM container. */
export interface ReactCompatPortal {
  $$typeof: typeof PORTAL_TYPE;
  container: Element;
  children: ReactCompatNode;
  key: string | null;
}

export interface ReactiveDomBlockResult {
  node: ChildNode;
  afterCommit?: (() => void) | undefined;
  dispose?: (() => void) | undefined;
}

// The render receives a stable reactive props proxy when the block is created
// with props (createReactiveDomBlock(render, props)); state-only blocks ignore
// the argument.
export type ReactiveDomBlockRender<P = unknown> = (props: P) => ReactiveDomBlockResult;

export interface ReactiveDomBlockProps {
  render: ReactiveDomBlockRender;
  // Present when the block bridges its component's props into the reactive
  // runtime; carries the latest props on every re-render so the reconciler can
  // push them into the block's prop cell.
  blockProps?: Record<string, unknown> | undefined;
}

/** Creates a React-compatible element from a type, config object, and children. */
export function createElement<P extends object>(
  type: ElementType<P>,
  config: (P & ReactReservedProps) | null,
  ...children: ReactCompatNode[]
): ReactCompatElement<P>;
export function createElement<P extends object>(
  type: ElementType<P>,
  config: (P & ReactReservedProps) | null,
): ReactCompatElement<P> {
  const childCount = arguments.length - 2;

  if (typeof type === "string") {
    const key = config?.key === undefined ? null : String(config.key);
    const ref = config?.ref ?? null;
    const props = copyHostCreateElementProps(config) as P & {
      children?: ReactCompatNode;
    };

    assignCreateElementChildren(props, childCount, arguments);

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
  const props = applyDefaultProps(
    normalizedType,
    copyCreateElementProps(config),
  ) as P & {
    children?: ReactCompatNode;
  };

  assignCreateElementChildren(props, childCount, arguments);

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

function assignCreateElementChildren(
  props: { children?: ReactCompatNode },
  childCount: number,
  args: IArguments,
): void {
  if (childCount === 1) {
    props.children = args[2] as ReactCompatNode;
    return;
  }

  if (childCount <= 1) {
    return;
  }

  const children: ReactCompatNode[] = [];
  children.length = childCount;

  for (let index = 0; index < childCount; index += 1) {
    children[index] = args[index + 2] as ReactCompatNode;
  }

  props.children = children;
}

/** Creates a React-compatible element from JSX runtime arguments. */
export function createElementFromJsxConfig<P extends object>(
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
  if (canReuseJsxConfigAsComponentProps(normalizedType, config)) {
    return {
      $$typeof: REACT_COMPAT_ELEMENT_TYPE,
      type: normalizedType as ElementType<P>,
      key,
      ref,
      props: config as P & { children?: ReactCompatNode },
    };
  }

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

function canReuseJsxConfigAsComponentProps(
  type: unknown,
  config: object | null | undefined,
): boolean {
  if (
    config === null ||
    config === undefined ||
    typeof type === "string" ||
    hasDefaultProps(type)
  ) {
    return false;
  }

  for (const name in config) {
    if (
      hasOwnProperty.call(config, name) &&
      (name === "key" ||
        name === "ref" ||
        name === "__self" ||
        name === "__source")
    ) {
      return false;
    }
  }

  return true;
}

/** Returns true when a value is a React-compatible element record. */
export function isReactCompatElement(
  value: unknown,
): value is ReactCompatElement {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === REACT_COMPAT_ELEMENT_TYPE
  );
}

/** Creates a portal that renders children into a DOM container outside the parent tree. */
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

/** Returns true when a value is a React-compatible portal record. */
export function isReactCompatPortal(value: unknown): value is ReactCompatPortal {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === PORTAL_TYPE
  );
}

/** Creates a mutable ref object with a null initial current value. */
export function createRef<T>(): { current: T | null } {
  return { current: null };
}

/** Element type record produced by forwardRef. */
export interface ForwardRefType<P = Record<string, unknown>> {
  $$typeof: typeof FORWARD_REF_TYPE;
  render: (props: P, ref: unknown) => ReactCompatNode;
}

/** Element type record produced by memo. */
export interface MemoType<P = Record<string, unknown>> {
  $$typeof: typeof MEMO_TYPE;
  type: ElementType<P>;
  compare?: (previous: P, next: P) => boolean;
  __mreactMemoCompareProps?: readonly string[];
}

/** Element type record produced by lazy. */
export interface LazyType<P = Record<string, unknown>> {
  $$typeof: typeof LAZY_TYPE;
  load: () => Promise<{ default: ElementType<P> }>;
  status: "uninitialized" | "pending" | "resolved" | "rejected";
  promise?: Promise<void>;
  resolved?: ElementType<P>;
  error?: unknown;
}

/** Wraps a component so it can receive a ref as the second render argument. */
export function forwardRef<P, T>(
  render: (props: P, ref: { current: T | null } | ((value: T | null) => void) | null) => ReactCompatNode,
): ForwardRefType<P & { ref?: unknown }> {
  return { $$typeof: FORWARD_REF_TYPE, render: render as ForwardRefType<P>["render"] };
}

/** Wraps an element type with optional prop comparison for memoized renders. */
export function memo<P>(
  type: ElementType<P>,
  compare?: (previous: P, next: P) => boolean,
): MemoType<P> {
  return compare === undefined
    ? { $$typeof: MEMO_TYPE, type }
    : { $$typeof: MEMO_TYPE, type, compare };
}

/** Creates a lazy element type that resolves its implementation on demand. */
export function lazy<P>(
  load: () => Promise<{ default: ElementType<P> }>,
): LazyType<P> {
  return {
    $$typeof: LAZY_TYPE,
    load,
    status: "uninitialized",
  };
}

/** Symbol used to mark a subtree for strict-mode development checks. */
export const StrictMode = STRICT_MODE_TYPE;

/** Clones an existing element with merged props and optional replacement children. */
export function cloneElement<P extends object>(
  element: ReactCompatElement<P>,
  props: (Partial<P> & ReactReservedProps) | null,
  ...children: ReactCompatNode[]
): ReactCompatElement<P> {
  const key = props === null || props.key === undefined ? element.key : String(props.key);
  const ref = props === null || props.ref === undefined ? element.ref : props.ref;
  const nextProps = copyElementProps(props, element.props) as P & {
    children?: ReactCompatNode;
  };

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
  source: object | null | undefined,
  base?: object,
  omitChildren = false,
  copySymbols: boolean | "internal" = true,
): Record<string, unknown> {
  const props: Record<PropertyKey, unknown> = {};

  if (base !== undefined) {
    copyOwnStringElementProps(base, props, omitChildren);
  }

  if (source === null || source === undefined) {
    return props as Record<string, unknown>;
  }

  copyOwnStringElementProps(source, props, omitChildren);
  if (copySymbols === "internal") {
    copyInternalElementSymbolProps(source, props);
  } else if (copySymbols) {
    copyOwnSymbolElementProps(source, props);
  }
  return props as Record<string, unknown>;
}

function copyCreateElementProps(
  source: object | null | undefined,
): Record<string, unknown> {
  const props: Record<PropertyKey, unknown> = {};

  if (source === null || source === undefined) {
    return props as Record<string, unknown>;
  }

  const stringSource = source as Record<string, unknown>;
  for (const name in source) {
    if (!hasOwnProperty.call(source, name)) {
      continue;
    }

    if (
      name !== "key" &&
      name !== "ref" &&
      name !== "__self" &&
      name !== "__source"
    ) {
      props[name] = stringSource[name];
    }
  }

  copyInternalElementSymbolProps(source, props);
  return props as Record<string, unknown>;
}

function copyHostCreateElementProps(
  source: object | null | undefined,
): Record<string, unknown> {
  const props: Record<PropertyKey, unknown> = {};

  if (source === null || source === undefined) {
    props[HOST_CHILDREN_ONLY_PROPS_META] = true;
    return props as Record<string, unknown>;
  }

  let hasNonChildrenProp = false;
  const stringSource = source as Record<string, unknown>;
  for (const name in source) {
    if (!hasOwnProperty.call(source, name)) {
      continue;
    }

    if (
      name !== "key" &&
      name !== "ref" &&
      name !== "__self" &&
      name !== "__source"
    ) {
      props[name] = stringSource[name];
      hasNonChildrenProp ||= name !== "children";
    }
  }

  copyInternalElementSymbolProps(source, props);
  if (!hasNonChildrenProp) {
    props[HOST_CHILDREN_ONLY_PROPS_META] = true;
  }
  return props as Record<string, unknown>;
}

function copyOwnStringElementProps(
  source: object,
  target: Record<string, unknown>,
  omitChildren: boolean,
): void {
  const stringSource = source as Record<string, unknown>;
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
      target[name] = stringSource[name];
    }
  }
}

function copyOwnSymbolElementProps(
  source: object,
  target: Record<PropertyKey, unknown>,
): void {
  const symbolSource = source as Record<PropertyKey, unknown>;
  for (const symbol of Object.getOwnPropertySymbols(source)) {
    target[symbol] = symbolSource[symbol];
  }
}

function copyInternalElementSymbolProps(
  source: object,
  target: Record<PropertyKey, unknown>,
): void {
  const symbolSource = source as Record<PropertyKey, unknown>;
  if (hasOwnProperty.call(source, REACTIVE_TEXT_BINDING_META)) {
    target[REACTIVE_TEXT_BINDING_META] = symbolSource[REACTIVE_TEXT_BINDING_META];
  }
}

function normalizeElementType<P>(type: ElementType<P>): ElementType<P> {
  return isReactCompatContextProviderShorthand(type) ? (type.Provider as ElementType<P>) : type;
}

function applyDefaultProps(
  type: unknown,
  props: Record<string, unknown>,
): Record<string, unknown> {
  if (!canHaveDefaultProps(type)) {
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

function hasDefaultProps(type: unknown): boolean {
  return canHaveDefaultProps(type) &&
    (type as { defaultProps?: Record<string, unknown> }).defaultProps !== undefined;
}

function canHaveDefaultProps(type: unknown): boolean {
  return typeof type === "function" || (typeof type === "object" && type !== null);
}

/** Reserved element configuration fields consumed outside component props. */
export interface ReactReservedProps {
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
  if (hostPropsAreChildrenOnly(props)) {
    (props as { [HOST_CHILDREN_ONLY_PROPS_META]?: true })[
      HOST_CHILDREN_ONLY_PROPS_META
    ] = true;
  }
}

function hostPropsAreChildrenOnly(props: Record<string, unknown>): boolean {
  for (const name in props) {
    if (hasOwnProperty.call(props, name) && name !== "children") {
      return false;
    }
  }

  return true;
}

/** Alias for checking whether a value is a React-compatible element. */
export const isValidElement = isReactCompatElement;

/** Helpers for iterating, counting, flattening, and validating children. */
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

/** Options used to render and observe a React-compatible error boundary. */
export interface ErrorBoundaryOptions {
  fallback: (error: Error) => ReactCompatNode;
  onError?: (error: Error) => void;
}

/** Creates an error boundary element with a fallback renderer. */
export function createErrorBoundary(
  options: ErrorBoundaryOptions,
  children: ReactCompatNode,
): ReactCompatElement<ErrorBoundaryOptions & { children: ReactCompatNode }> {
  return createElement(ERROR_BOUNDARY_TYPE, {
    ...options,
    children,
  });
}
