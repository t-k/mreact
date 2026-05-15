import type { ReactCompatNode } from "./element.js";
import { hydrateRoot, type HydrateRootOptions } from "./render.js";
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

export interface FetchServerReferenceCallerOptions {
  fetch?: typeof fetch;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  csrfHeaderName?: string;
  csrfToken?: string | (() => string);
  nonceHeaderName?: string;
  nonce?: string | (() => string);
}

export interface HydrateFlightOptions extends DecodeFlightOptions {
  hydrate?: HydrateRootOptions;
}

export function parseFlightResponse(payload: string | ArrayBuffer | Uint8Array): FlightResponse {
  return parseReactFlightPayload(payload);
}

export function decodeFlightResponse(
  response: FlightResponse,
  options: DecodeFlightOptions,
): ReactCompatNode {
  return decodeFlightModel(response.root, response, options) as ReactCompatNode;
}

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

export function hydrateFlightResponse(
  container: Element,
  response: FlightResponse,
  options: HydrateFlightOptions,
): ReturnType<typeof import("./render.js").hydrateRoot> {
  return hydrateRoot(container, decodeFlightResponse(response, options), options.hydrate);
}

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
