import { installCompatRenderValueNormalizer } from "@reckona/mreact-reactive-dom/compat-normalize";

installCompatRenderValueNormalizer();

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
  ForwardRefType,
  LazyType,
  MemoType,
  ReactCompatPortal,
  ReactCompatProviderType,
  ReactCompatContextProviderShorthand,
  ReactCompatElement,
  ReactCompatNode,
  ReactCompatRenderableElement,
  ReactReservedProps,
} from "./element.js";
export type { ComponentConstructor, PureComponentConstructor } from "./class-component.js";
/** DOM and form event types exported by the JSX runtime. */
export type {
  FormEvent,
  FormEventHandler,
  JSXEvent,
  JSXEventHandler,
} from "./jsx-runtime.js";

export {
  createContext,
  renderContextConsumerToString,
  renderContextProviderToString,
  useContext,
} from "./context.js";
export type {
  ReactCompatConsumer,
  ReactCompatContext,
  ReactCompatExternalContext,
  ReactCompatContextLike,
  ReactCompatProvider,
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
  HydrationEventReplayOptions,
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
export { renderChildToString, renderToString } from "./server-render.js";
export type { EffectCallback, RootRuntimeOptions, StartTransition, TransitionScope } from "./hooks.js";
/** Default React-compatible namespace export. */
export { default } from "./react-default.js";
