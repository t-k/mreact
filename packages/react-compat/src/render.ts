export {
  createRoot,
  createStreamingHydrationRoot,
  flushSync,
  hydrateRoot,
  render,
  unmountComponentAtNode,
} from "./root.js";
export type {
  HydrateRootOptions,
  Root,
  RootOptions,
  SelectiveHydrationBoundary,
  SelectiveHydrationOptions,
  StreamingHydrationRoot,
  StreamingHydrationRootOptions,
} from "./root.js";
export { applyStreamingHydrationFragments } from "./hydration.js";
export {
  enableEventHydrationManifestReplay,
  enableHydrationEventReplay,
  queueHydrationEvent,
  readEventHydrationManifest,
} from "./event-replay.js";
export type {
  EventHydrationManifest,
  EventHydrationManifestEntry,
} from "./event-replay.js";
export type { HydrationRecoverableErrorInfo } from "./hydration.js";
