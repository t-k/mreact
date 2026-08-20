import { REACT_COMPAT_CONSUMER_TYPE, REACT_COMPAT_PROVIDER_TYPE } from "@reckona/mreact-shared";

export interface ReactCompatContext<T> {
  defaultValue: T;
  values: T[];
  Provider: ReactCompatProvider<T>;
  Consumer: ReactCompatConsumer<T>;
  displayName: string | undefined;
}

export interface ReactCompatExternalContext<T> {
  $$typeof: typeof REACT_COMPAT_PROVIDER_TYPE;
  _currentValue?: T;
  _currentValue2?: T;
  _defaultValue?: T;
  Provider?: unknown;
  Consumer?: unknown;
  displayName?: string | undefined;
}

export type ReactCompatContextLike<T> = ReactCompatContext<T> | ReactCompatExternalContext<T>;

export interface ReactCompatProvider<T> {
  $$typeof: typeof REACT_COMPAT_PROVIDER_TYPE;
  context: ReactCompatContextLike<T>;
  displayName: string | undefined;
}

export interface ReactCompatConsumer<T> {
  $$typeof: typeof REACT_COMPAT_CONSUMER_TYPE;
  context: ReactCompatContextLike<T>;
  _context?: ReactCompatContextLike<T>;
  displayName: string | undefined;
}

type ContextReadObserver = (context: ReactCompatContextLike<unknown>, value: unknown) => void;
interface ContextReadObserverState {
  current: ContextReadObserver | undefined;
}

/** Stores context provider values for one concurrent Fiber root. */
export interface ContextEnvironment {
  values: WeakMap<object, unknown[]>;
}

interface ContextEnvironmentState {
  current: ContextEnvironment | undefined;
}

const externalContextValues = new WeakMap<object, unknown[]>();

const CONTEXT_READ_OBSERVER_STATE_KEY = Symbol.for("modular.react.context_read_observer_state");
const contextReadObserverState = ((
  globalThis as typeof globalThis & Record<symbol, ContextReadObserverState | undefined>
)[CONTEXT_READ_OBSERVER_STATE_KEY] ??= {
  current: undefined,
});
const CONTEXT_ENVIRONMENT_STATE_KEY = Symbol.for("modular.react.context_environment_state");
const contextEnvironmentState = ((
  globalThis as typeof globalThis & Record<symbol, ContextEnvironmentState | undefined>
)[CONTEXT_ENVIRONMENT_STATE_KEY] ??= {
  current: undefined,
});

/** Creates isolated provider storage for one concurrent Fiber root. */
export function createContextEnvironment(): ContextEnvironment {
  return { values: new WeakMap<object, unknown[]>() };
}

/** Runs synchronous Fiber work against an isolated context environment. */
export function withContextEnvironment<T>(environment: ContextEnvironment, render: () => T): T {
  const previousEnvironment = contextEnvironmentState.current;
  contextEnvironmentState.current = environment;

  try {
    return render();
  } finally {
    contextEnvironmentState.current = previousEnvironment;
  }
}

/** Creates a context object with Provider and Consumer entries. */
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
      context.Provider.displayName = value === undefined ? undefined : `${value}.Provider`;
      context.Consumer.displayName = value === undefined ? undefined : `${value}.Consumer`;
    },
  });
}

/** Reads the current value for a React-compatible context. */
export function useContext<T>(context: ReactCompatContextLike<T>): T {
  const value = readContextValue(context);
  contextReadObserverState.current?.(context as ReactCompatContextLike<unknown>, value);
  return value;
}

export function readContextValue<T>(context: ReactCompatContextLike<T>): T {
  const environmentValues = contextEnvironmentState.current?.values.get(context);
  if (environmentValues !== undefined && environmentValues.length > 0) {
    return environmentValues[environmentValues.length - 1] as T;
  }

  if (contextEnvironmentState.current !== undefined) {
    return defaultContextValue(context);
  }

  if (isInternalContextRecord(context)) {
    if (context.values.length === 0) {
      return context.defaultValue;
    }

    return context.values[context.values.length - 1] as T;
  }

  const externalValues = externalContextValues.get(context);
  if (externalValues !== undefined && externalValues.length > 0) {
    return externalValues[externalValues.length - 1] as T;
  }

  if (Object.hasOwn(context, "_currentValue")) {
    return context._currentValue as T;
  }

  if (Object.hasOwn(context, "_currentValue2")) {
    return context._currentValue2 as T;
  }

  return context._defaultValue as T;
}

export function withContextReadObserver<T>(observer: ContextReadObserver, render: () => T): T {
  const previousObserver = contextReadObserverState.current;
  contextReadObserverState.current = observer;

  try {
    return render();
  } finally {
    contextReadObserverState.current = previousObserver;
  }
}

export function isReactCompatProvider(value: unknown): value is ReactCompatProvider<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === REACT_COMPAT_PROVIDER_TYPE
  );
}

export function isReactCompatContext(value: unknown): value is ReactCompatContext<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "Provider" in value &&
    "Consumer" in value &&
    isReactCompatProvider((value as { Provider?: unknown }).Provider) &&
    isReactCompatConsumer((value as { Consumer?: unknown }).Consumer)
  );
}

export function isReactCompatConsumer(value: unknown): value is ReactCompatConsumer<unknown> {
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

export function pushContextProvider<T>(provider: ReactCompatProvider<T>, value: T): void {
  const context = providerContext(provider);
  const environment = contextEnvironmentState.current;

  if (environment !== undefined) {
    const values = environment.values.get(context) ?? [];
    values.push(value);
    environment.values.set(context, values);
    return;
  }

  if (isInternalContextRecord(context)) {
    context.values.push(value);
    return;
  }

  const values = externalContextValues.get(context) ?? [];
  values.push(value);
  externalContextValues.set(context, values);
}

export function popContextProvider<T>(provider: ReactCompatProvider<T>): void {
  const context = providerContext(provider);
  const environment = contextEnvironmentState.current;

  if (environment !== undefined) {
    environment.values.get(context)?.pop();
    return;
  }

  if (isInternalContextRecord(context)) {
    context.values.pop();
    return;
  }

  externalContextValues.get(context)?.pop();
}

/** Renders a string while a provider value is active. */
export function renderContextProviderToString<T>(
  provider: ReactCompatProvider<T>,
  value: T,
  render: () => string,
): string {
  return renderWithContextProvider(provider, value, render);
}

/** Renders a string with the current value from a context consumer. */
export function renderContextConsumerToString<T>(
  consumer: ReactCompatConsumer<T>,
  render: (value: T) => string,
): string {
  return render(useContext(consumerContext(consumer)));
}

export function providerContext<T>(provider: ReactCompatProvider<T>): ReactCompatContextLike<T> {
  return provider.context ?? (provider as unknown as ReactCompatExternalContext<T>);
}

export function consumerContext<T>(consumer: ReactCompatConsumer<T>): ReactCompatContextLike<T> {
  return (
    consumer.context ?? consumer._context ?? (consumer as unknown as ReactCompatExternalContext<T>)
  );
}

function isInternalContextRecord<T>(
  context: ReactCompatContextLike<T>,
): context is ReactCompatContext<T> {
  return "values" in context && Array.isArray(context.values);
}

function defaultContextValue<T>(context: ReactCompatContextLike<T>): T {
  if (isInternalContextRecord(context)) {
    return context.defaultValue;
  }

  if (Object.hasOwn(context, "_currentValue")) {
    return context._currentValue as T;
  }

  if (Object.hasOwn(context, "_currentValue2")) {
    return context._currentValue2 as T;
  }

  return context._defaultValue as T;
}
