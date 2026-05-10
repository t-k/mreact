export const REACT_COMPAT_ELEMENT_TYPE = Symbol.for("modular.react.element");
export const Fragment = Symbol.for("modular.react.fragment");

export interface ReactCompatProviderType {
  $$typeof: symbol;
  context: unknown;
}

export type ElementType<P = Record<string, unknown>> =
  | string
  | typeof Fragment
  | ReactCompatProviderType
  | ((props: P) => ReactCompatNode);

export type ReactCompatNode =
  | ReactCompatElement
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
