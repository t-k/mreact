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

type ContextReadObserver = (context: ReactCompatContext<unknown>, value: unknown) => void;
let currentContextReadObserver: ContextReadObserver | undefined;

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
  const value = readContextValue(context);
  currentContextReadObserver?.(context as ReactCompatContext<unknown>, value);
  return value;
}

export function readContextValue<T>(context: ReactCompatContext<T>): T {
  return context.values.at(-1) ?? context.defaultValue;
}

export function withContextReadObserver<T>(
  observer: ContextReadObserver,
  render: () => T,
): T {
  const previousObserver = currentContextReadObserver;
  currentContextReadObserver = observer;

  try {
    return render();
  } finally {
    currentContextReadObserver = previousObserver;
  }
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

export function isReactCompatContext(
  value: unknown,
): value is ReactCompatContext<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "Provider" in value &&
    "Consumer" in value &&
    isReactCompatProvider((value as { Provider?: unknown }).Provider) &&
    isReactCompatConsumer((value as { Consumer?: unknown }).Consumer)
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
  pushContextProvider(provider, value);

  try {
    return render();
  } finally {
    popContextProvider(provider);
  }
}

export function pushContextProvider<T>(
  provider: ReactCompatProvider<T>,
  value: T,
): void {
  provider.context.values.push(value);
}

export function popContextProvider<T>(provider: ReactCompatProvider<T>): void {
  provider.context.values.pop();
}

export function renderContextProviderToString<T>(
  provider: ReactCompatProvider<T>,
  value: T,
  render: () => string,
): string {
  return renderWithContextProvider(provider, value, render);
}

export function renderContextConsumerToString<T>(
  consumer: ReactCompatConsumer<T>,
  render: (value: T) => string,
): string {
  return render(useContext(consumer.context));
}
