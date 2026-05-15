import { createElement, Fragment } from "./element.js";
import type { ElementType } from "./element.js";
import type { DecodeFlightOptions } from "./flight-decoder.js";
import type {
  FlightClientReference,
  FlightElementModel,
  FlightModel,
  FlightResponse,
  FlightServerReference,
  FlightServerReferenceModel,
} from "./flight-types.js";

export type FlightModelDecoder = (model: FlightModel, depth?: number) => unknown;

export function decodeFlightElementModel(
  model: FlightElementModel,
  response: FlightResponse,
  options: DecodeFlightOptions,
  decodeModel: FlightModelDecoder,
  depth = 0,
  assertDepth?: (depth: number) => void,
): unknown {
  const type = decodeElementType(model.type, response, options);
  const propsDepth = depth + 1;
  assertDepth?.(propsDepth);
  const props = decodeProps(model.props, response, options, decodeModel, propsDepth);

  return createElement(type, { ...props, key: model.key });
}

export function createFlightServerReferenceStub(
  id: number,
  response: FlightResponse,
  options: DecodeFlightOptions,
  decodeModel: FlightModelDecoder,
): (...args: unknown[]) => unknown {
  const reference = getServerReference(id, response);

  return (...args: unknown[]) => {
    if (options.callServerReference === undefined) {
      throw new Error(`No server reference caller configured for ${reference.moduleId}.`);
    }

    const boundArgs = reference.bound?.map((value) => decodeModel(value)) ?? [];

    return options.callServerReference(reference, [...boundArgs, ...args]);
  };
}

function decodeElementType(
  type: FlightElementModel["type"],
  response: FlightResponse,
  options: DecodeFlightOptions,
): ElementType<Record<string, unknown>> {
  if (typeof type === "string") {
    return type;
  }

  if (type.kind === "fragment") {
    return Fragment as ElementType<Record<string, unknown>>;
  }

  return options.loadClientReference(getClientReference(type.id, response));
}

function decodeProps(
  props: Record<string, FlightModel>,
  response: FlightResponse,
  options: DecodeFlightOptions,
  decodeModel: FlightModelDecoder,
  depth: number,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(props).map(([key, value]) => [
      key,
      valueIsServerReference(value)
        ? createFlightServerReferenceStub(value.id, response, options, decodeModel)
        : decodeModel(value, depth + 1),
    ]),
  );
}

function getClientReference(id: number, response: FlightResponse): FlightClientReference {
  const reference = response.clientReferences.find((entry) => entry.id === id);

  if (reference === undefined) {
    throw new Error(`Unknown Flight client reference: ${id}`);
  }

  return reference;
}

function getServerReference(id: number, response: FlightResponse): FlightServerReference {
  const reference = response.serverReferences.find((entry) => entry.id === id);

  if (reference === undefined) {
    throw new Error(`Unknown Flight server reference: ${id}`);
  }

  return reference;
}

function valueIsServerReference(value: FlightModel): value is FlightServerReferenceModel {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    value.kind === "server-reference"
  );
}
