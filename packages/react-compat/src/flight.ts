import type { ElementType, ReactCompatNode } from "./element.js";
import { hydrateRoot, type HydrateRootOptions, type Root } from "./render.js";
import {
  getReactFlightProtocolCoverage,
  type ReactFlightProtocolCoverage,
} from "./flight-protocol.js";
import { decodeFlightModel, type DecodeFlightOptions } from "./flight-decoder.js";
import { parseReactFlightPayload } from "./flight-parser.js";
import type {
  FlightArrayBufferModel,
  FlightBigIntModel,
  FlightClientReference,
  FlightClientReferenceModel,
  FlightDataViewModel,
  FlightDateModel,
  FlightElementModel,
  FlightErrorModel,
  FlightFormDataModel,
  FlightIterableModel,
  FlightMapModel,
  FlightModel,
  FlightNumberModel,
  FlightObjectModel,
  FlightPromiseModel,
  FlightResponse,
  FlightServerReference,
  FlightServerReferenceModel,
  FlightSetModel,
  FlightSymbolModel,
  FlightTypedArrayModel,
  FlightTypedArrayName,
} from "./flight-types.js";

export { getReactFlightProtocolCoverage };
export type {
  DecodeFlightOptions,
  FlightArrayBufferModel,
  FlightBigIntModel,
  FlightClientReference,
  FlightClientReferenceModel,
  FlightDataViewModel,
  FlightDateModel,
  FlightElementModel,
  FlightErrorModel,
  FlightFormDataModel,
  FlightIterableModel,
  FlightMapModel,
  FlightModel,
  FlightNumberModel,
  FlightObjectModel,
  FlightPromiseModel,
  FlightResponse,
  FlightServerReference,
  FlightServerReferenceModel,
  FlightSetModel,
  FlightSymbolModel,
  FlightTypedArrayModel,
  FlightTypedArrayName,
};
export type { ReactFlightProtocolCoverage };
export type {
  ElementType,
  ForwardRefType,
  LazyType,
  MemoType,
  ReactCompatContextProviderShorthand,
  ReactCompatNode,
  ReactCompatPortal,
  ReactCompatProviderType,
  ReactCompatRenderableElement,
} from "./element.js";
export type { HydrateRootOptions, HydrationRecoverableErrorInfo, Root } from "./render.js";

/** Options for creating a fetch-based server reference caller. */
export interface FetchServerReferenceCallerOptions {
  fetch?: typeof fetch;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  csrfHeaderName?: string;
  csrfToken?: string | (() => string);
  nonceHeaderName?: string;
  nonce?: string | (() => string);
}

/** Options for decoding a Flight response and hydrating it into a DOM container. */
export interface HydrateFlightOptions extends DecodeFlightOptions {
  hydrate?: HydrateRootOptions;
}

/** Parses a serialized Flight payload into a Flight response object. */
export function parseFlightResponse(payload: string | ArrayBuffer | Uint8Array): FlightResponse {
  return parseReactFlightPayload(payload);
}

/** Decodes the root model from a parsed Flight response. */
export function decodeFlightResponse(
  response: FlightResponse,
  options: DecodeFlightOptions,
): ReactCompatNode {
  return decodeFlightModel(response.root, response, options) as ReactCompatNode;
}

/** Reads and parses a Flight response script from a document or parent node. */
export function readFlightResponse(
  root: Document | ParentNode,
  id?: string,
): FlightResponse {
  const selector =
    id === undefined
      ? "script[data-mreact-flight]"
      : `script[data-mreact-flight]#${cssEscape(id)}`;
  const script = root.querySelector(selector);

  if (script === null || script.textContent === null) {
    throw new Error("Flight response script was not found.");
  }

  return parseFlightResponse(script.textContent);
}

/** Decodes a Flight response and hydrates the resulting tree into a container. */
export function hydrateFlightResponse(
  container: Element,
  response: FlightResponse,
  options: HydrateFlightOptions,
): Root {
  return hydrateRoot(container, decodeFlightResponse(response, options), options.hydrate);
}

/** Creates a server reference caller that POSTs encoded action invocations to an endpoint. */
export function createFetchServerReferenceCaller(
  endpoint: string,
  options: FetchServerReferenceCallerOptions = {},
): NonNullable<DecodeFlightOptions["callServerReference"]> {
  const fetchImpl = options.fetch ?? fetch;

  return async (reference, args) => {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      credentials: options.credentials ?? "same-origin",
      headers: createServerReferenceHeaders(options),
      body: JSON.stringify({
        moduleId: reference.moduleId,
        exportName: reference.exportName,
        ...(reference.bound === undefined ? {} : { bound: reference.bound }),
        args,
      }),
    });
    const payload = (await response.json()) as { ok?: boolean; value?: unknown; error?: string };

    if (!response.ok || payload.ok !== true) {
      throw new Error(payload.error ?? "Server action failed.");
    }

    return payload.value;
  };
}

function createServerReferenceHeaders(
  options: FetchServerReferenceCallerOptions,
): Record<string, string> {
  const csrfToken = readOptionalToken(options.csrfToken);
  const nonce = readOptionalToken(options.nonce);

  return {
    "content-type": "application/json",
    ...options.headers,
    ...(csrfToken === undefined
      ? {}
      : { [options.csrfHeaderName ?? "x-mreact-csrf"]: csrfToken }),
    ...(nonce === undefined
      ? {}
      : { [options.nonceHeaderName ?? "x-mreact-action-nonce"]: nonce }),
  };
}

function readOptionalToken(token: string | (() => string) | undefined): string | undefined {
  return typeof token === "function" ? token() : token;
}

function cssEscape(value: string): string {
  return globalThis.CSS?.escape?.(value) ?? value.replaceAll('"', '\\"');
}
