const REACT_COMPAT_PROVIDER_TYPE = Symbol.for("modular.react.provider");
const REACT_COMPAT_CONSUMER_TYPE = Symbol.for("modular.react.consumer");

export interface ReactCompatContext<T> {
  defaultValue: T;
  values: T[];
  Provider: ReactCompatProvider<T>;
  Consumer: ReactCompatConsumer<T>;
  displayName: string | undefined;
}

export interface ReactCompatProvider<T> {
  $$typeof: typeof REACT_COMPAT_PROVIDER_TYPE;
  context: ReactCompatContext<T>;
  displayName: string | undefined;
}

export interface ReactCompatConsumer<T> {
  $$typeof: typeof REACT_COMPAT_CONSUMER_TYPE;
  context: ReactCompatContext<T>;
  displayName: string | undefined;
}

export function createContext<T>(defaultValue: T): ReactCompatContext<T> {
  const context: ReactCompatContext<T> = {
    defaultValue,
    values: [],
    Provider: undefined as unknown as ReactCompatProvider<T>,
    Consumer: undefined as unknown as ReactCompatConsumer<T>,
    displayName: undefined,
  };
  context.Provider = {
    $$typeof: REACT_COMPAT_PROVIDER_TYPE,
    context,
    displayName: undefined,
  };
  context.Consumer = {
    $$typeof: REACT_COMPAT_CONSUMER_TYPE,
    context,
    displayName: undefined,
  };
  installContextDisplayName(context);
  return context;
}

function installContextDisplayName<T>(context: ReactCompatContext<T>): void {
  let displayName: string | undefined;

  Object.defineProperty(context, "displayName", {
    configurable: true,
    enumerable: true,
    get() {
      return displayName;
    },
    set(value: string | undefined) {
      displayName = value;
      context.Provider.displayName =
        value === undefined ? undefined : `${value}.Provider`;
      context.Consumer.displayName =
        value === undefined ? undefined : `${value}.Consumer`;
    },
  });
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

export function renderContextProviderToString<T>(
  provider: ReactCompatProvider<T>,
  value: T,
  render: () => string,
): string {
  return renderWithContextProvider(provider, value, render);
}
