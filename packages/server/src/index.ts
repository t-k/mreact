import {
  Suspense as ReactCompatSuspense,
  createElement,
  type ReactCompatNode,
} from "@reckona/mreact-compat";

/** Fragment marker used to group children without emitting an extra element. */
export { Fragment } from "@reckona/mreact-compat";
/** Any value accepted by the React-compatible renderer. */
export type { ReactCompatNode } from "@reckona/mreact-compat";
/** Receives HTML chunks and deferred work while server rendering. */
export type { HtmlSink } from "@reckona/mreact-shared/compiler-contract";

export {
  CLIENT_REFERENCE_TYPE,
  SERVER_REFERENCE_TYPE,
  createClientReference,
  createFlightClientManifest,
  createServerReference,
  createServerActionHandler,
  ensureServerActionReplayStoreContract,
  fromReactFlightRows,
  getReactFlightProtocolCoverage,
  isClientReference,
  isServerReference,
  mergeReactFlightRows,
  renderFlightPreloadLinks,
  renderFlightResponseScript,
  renderToFlightResponse,
  stringifyFlightResponse,
  toReactFlightPayload,
  toReactFlightRows,
} from "./flight.js";
export type {
  ClientReference,
  FlightClientManifestEntry,
  FlightClientReference,
  FlightClientReferenceInput,
  FlightClientReferenceModel,
  FlightDataViewModel,
  FlightElementModel,
  FlightFormDataModel,
  FlightIterableModel,
  FlightModel,
  FlightObjectModel,
  FlightObjectReferenceModel,
  FlightDateModel,
  FlightBigIntModel,
  FlightNumberModel,
  FlightSymbolModel,
  FlightMapModel,
  FlightSetModel,
  FlightErrorModel,
  FlightPromiseModel,
  FlightRegExpModel,
  FlightResponse,
  FlightScriptOptions,
  FlightServerReference,
  FlightServerReferenceModel,
  FlightArrayBufferModel,
  FlightTypedArrayModel,
  FlightTypedArrayName,
  FlightUrlModel,
  ReactFlightProtocolCoverage,
  ServerAction,
  ServerActionDescriptor,
  ServerActionHandlerOptions,
  ServerActionRegistry,
  ServerActionReplayStore,
  ServerActionReplayClaim,
  ServerActionRequestReference,
  ServerActionValidationResult,
  ServerReference,
} from "./flight.js";

export { createStringSink } from "./sink.js";
export type {
  StreamRender,
  StringHtmlSink,
  StringSinkBufferStrategy,
  StringSinkOptions,
} from "./sink.js";

export { renderToReadableStream } from "./stream.js";
export type { RenderToReadableStreamOptions, RenderToReadableStreamQueueState } from "./stream.js";

export {
  reactSuspenseRevealExternalScript,
  renderAsyncBoundary,
  renderHydrationBoundary,
  renderOutOfOrderBoundary,
  renderOutOfOrderReorderScript,
  renderReactSuspenseBoundary,
  renderReactSuspenseClientRenderBoundary,
  renderReactSuspenseOutOfOrderBoundary,
} from "./boundary.js";
export type {
  AsyncBoundaryOptions,
  AsyncBoundaryRender,
  HydrationScriptOptions,
  OutOfOrderBoundaryOptions,
  OutOfOrderReorderScriptOptions,
  ReactSuspenseBoundaryOptions,
  ReactSuspenseClientRenderOptions,
  ReactSuspenseScriptOptions,
} from "./boundary.js";

export {
  createEventHydrationManifest,
  html,
  renderEventHydrationManifest,
  renderReactNodeToString,
  renderScriptAsset,
  renderSsrState,
  renderToString,
  serializeSsrState,
} from "./html-helpers.js";
export type {
  EventHydrationEntry,
  EventHydrationManifest,
  HtmlResponseOptions,
  ScriptAssetOptions,
} from "./html-helpers.js";

/** Props accepted by the server Suspense compatibility component. */
export interface SuspenseProps extends Record<string, unknown> {
  fallback?: unknown;
  children?: unknown;
}

/** Creates a React-compatible Suspense boundary for server rendering. */
export function Suspense(props: SuspenseProps): never {
  const config: SuspenseProps = {};

  if (props.fallback !== undefined) {
    config.fallback = props.fallback as ReactCompatNode;
  }

  return createElement<SuspenseProps>(
    ReactCompatSuspense,
    config,
    props.children as ReactCompatNode,
  ) as never;
}
