import type {
  FormEvent as JSXRuntimeFormEvent,
  FormEventHandler as JSXRuntimeFormEventHandler,
  JSXEvent as JSXRuntimeEvent,
  JSXEventHandler as JSXRuntimeEventHandler,
} from "./jsx-runtime.js";

export {
  Component,
  PureComponent,
} from "./class-component.js";
export {
  Fragment,
  Activity,
  Profiler,
  Suspense,
  SuspenseList,
  StrictMode,
  Children,
  cloneElement,
  createElement,
  createErrorBoundary,
  createPortal,
  createRef,
  forwardRef,
  isValidElement,
  lazy,
  memo,
} from "./element.js";
/** Element and node types exported by the React-compatible root entrypoint. */
export type {
  ErrorBoundaryOptions,
  ElementType,
  ReactCompatElement,
  ReactCompatNode,
} from "./element.js";

/** DOM event type with a narrowed currentTarget. */
export type JSXEvent<
  TCurrentTarget extends EventTarget,
  TEvent extends Event = Event,
> = JSXRuntimeEvent<TCurrentTarget, TEvent>;
/** Event handler type used by JSX DOM attributes. */
export type JSXEventHandler<
  TCurrentTarget extends EventTarget,
  TEvent extends Event = Event,
> = JSXRuntimeEventHandler<TCurrentTarget, TEvent>;
/** Submit event type used by form-related JSX attributes. */
export type FormEvent<TCurrentTarget extends EventTarget = Element> =
  JSXRuntimeFormEvent<TCurrentTarget>;
/** Submit event handler type used by form-related JSX attributes. */
export type FormEventHandler<TCurrentTarget extends EventTarget = Element> =
  JSXRuntimeFormEventHandler<TCurrentTarget>;

export {
  createContext,
  renderContextConsumerToString,
  renderContextProviderToString,
  useContext,
} from "./context.js";
export {
  applyStreamingHydrationFragments,
  createRoot,
  createStreamingHydrationRoot,
  enableEventHydrationManifestReplay,
  enableHydrationEventReplay,
  flushSync,
  hydrateRoot,
  queueHydrationEvent,
  readEventHydrationManifest,
  render,
  unmountComponentAtNode,
} from "./render.js";
export type {
  EventHydrationManifest,
  EventHydrationManifestEntry,
  HydrateRootOptions,
  HydrationRecoverableErrorInfo,
  Root,
  RootOptions,
  SelectiveHydrationBoundary,
  SelectiveHydrationOptions,
  StreamingHydrationRoot,
  StreamingHydrationRootOptions,
} from "./render.js";
export {
  useCallback,
  useDebugValue,
  useDeferredValue,
  useEffectEvent,
  useEffect,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  use,
  useActionState,
  act,
  cache,
  cacheSignal,
  captureOwnerStack,
  startTransition,
  unstable_useCacheRefresh,
  useTransition,
  version,
} from "./hooks.js";
export { renderToString } from "./server-render.js";
export type { StartTransition, TransitionScope } from "./hooks.js";
/** Default React-compatible namespace export. */
export { default } from "./react-default.js";
