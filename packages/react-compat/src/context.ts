const REACT_COMPAT_PROVIDER_TYPE = Symbol.for("modular.react.provider");
const REACT_COMPAT_CONSUMER_TYPE = Symbol.for("modular.react.consumer");

export interface ReactCompatContext<T> {
  defaultValue: T;
  values: T[];
  Provider: ReactCompatProvider<T>;
  Consumer: ReactCompatConsumer<T>;
}

export interface ReactCompatProvider<T> {
  $$typeof: typeof REACT_COMPAT_PROVIDER_TYPE;
  context: ReactCompatContext<T>;
}

export interface ReactCompatConsumer<T> {
  $$typeof: typeof REACT_COMPAT_CONSUMER_TYPE;
  context: ReactCompatContext<T>;
}

export function createContext<T>(defaultValue: T): ReactCompatContext<T> {
  const context: ReactCompatContext<T> = {
    defaultValue,
    values: [],
    Provider: undefined as unknown as ReactCompatProvider<T>,
    Consumer: undefined as unknown as ReactCompatConsumer<T>,
  };
  context.Provider = { $$typeof: REACT_COMPAT_PROVIDER_TYPE, context };
  context.Consumer = { $$typeof: REACT_COMPAT_CONSUMER_TYPE, context };
  return context;
}

export function useContext<T>(context: ReactCompatContext<T>): T {
  return context.values.at(-1) ?? context.defaultValue;
}

export function isReactCompatProvider(
  value: unknown,
): value is ReactCompatProvider<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === REACT_COMPAT_PROVIDER_TYPE
  );
}

export function isReactCompatConsumer(
  value: unknown,
): value is ReactCompatConsumer<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === REACT_COMPAT_CONSUMER_TYPE
  );
}

export function renderWithContextProvider<T, R>(
  provider: ReactCompatProvider<T>,
  value: T,
  render: () => R,
): R {
  provider.context.values.push(value);

  try {
    return render();
  } finally {
    provider.context.values.pop();
  }
}
