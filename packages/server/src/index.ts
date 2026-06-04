import {
  Suspense as ReactCompatSuspense,
  createElement,
  type ReactCompatNode,
} from "@reckona/mreact-compat";

export { Fragment } from "@reckona/mreact-compat";
export type { ReactCompatNode } from "@reckona/mreact-compat";
export type { HtmlSink } from "@reckona/mreact-shared/compiler-contract";

export {
  CLIENT_REFERENCE_TYPE,
  SERVER_REFERENCE_TYPE,
  createClientReference,
  createFlightClientManifest,
  createServerReference,
  createServerActionHandler,
  fromReactFlightRows,
  getReactFlightProtocolCoverage,
  isClientReference,
  isServerReference,
  mergeReactFlightRows,
  renderFlightPreloadLinks,
  renderFlightResponseScript,
  renderToFlightResponse,
  stringifyFlightResponse,
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
  FlightResponse,
  FlightScriptOptions,
  FlightServerReference,
  FlightServerReferenceModel,
  FlightArrayBufferModel,
  FlightTypedArrayModel,
  FlightTypedArrayName,
  ServerAction,
  ServerActionDescriptor,
  ServerActionHandlerOptions,
  ServerActionRegistry,
  ServerActionReplayStore,
  ServerActionRequestReference,
  ServerActionValidationResult,
  ServerReference,
} from "./flight.js";

export {
  createStringSink,
} from "./sink.js";
export type {
  StreamRender,
  StringHtmlSink,
  StringSinkBufferStrategy,
  StringSinkOptions,
} from "./sink.js";

export {
  renderToReadableStream,
} from "./stream.js";
export type {
  RenderToReadableStreamOptions,
} from "./stream.js";

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

export interface SuspenseProps extends Record<string, unknown> {
  fallback?: unknown;
  children?: unknown;
}

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
