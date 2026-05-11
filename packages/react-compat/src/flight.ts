import { createElement, Fragment } from "./element.js";
import type { ElementType, ReactCompatNode } from "./element.js";

export interface FlightClientReference {
  id: number;
  moduleId: string;
  exportName: string;
  chunks?: string[];
}

export interface FlightServerReference {
  id: number;
  moduleId: string;
  exportName: string;
}

export interface FlightResponse {
  version: 1;
  root: FlightModel;
  clientReferences: FlightClientReference[];
  serverReferences: FlightServerReference[];
}

export type FlightModel =
  | null
  | string
  | number
  | boolean
  | FlightModel[]
  | FlightObjectModel
  | FlightElementModel
  | FlightClientReferenceModel
  | FlightServerReferenceModel
  | { kind: "undefined" };

export interface FlightObjectModel {
  kind?: never;
  [key: string]: FlightModel | undefined;
}

export interface FlightElementModel {
  kind: "element";
  type: string | FlightClientReferenceModel | { kind: "fragment" };
  key: string | null;
  props: Record<string, FlightModel>;
}

export interface FlightClientReferenceModel {
  kind: "client-reference";
  id: number;
}

export interface FlightServerReferenceModel {
  kind: "server-reference";
  id: number;
}

export interface DecodeFlightOptions {
  loadClientReference(reference: FlightClientReference): ElementType<Record<string, unknown>>;
  callServerReference?(
    reference: FlightServerReference,
    args: unknown[],
  ): unknown | Promise<unknown>;
}

export function parseFlightResponse(payload: string): FlightResponse {
  return JSON.parse(payload) as FlightResponse;
}

export function decodeFlightResponse(
  response: FlightResponse,
  options: DecodeFlightOptions,
): ReactCompatNode {
  return decodeModel(response.root, response, options);
}

function decodeModel(
  model: FlightModel,
  response: FlightResponse,
  options: DecodeFlightOptions,
): ReactCompatNode {
  if (
    model === null ||
    typeof model === "string" ||
    typeof model === "number" ||
    typeof model === "boolean"
  ) {
    return model;
  }

  if (Array.isArray(model)) {
    return model.map((item) => decodeModel(item, response, options));
  }

  if (model.kind === "undefined") {
    return undefined;
  }

  if (model.kind === "element") {
    const type = decodeElementType(model.type, response, options);
    const props = decodeProps(model.props, response, options);

    return createElement(type, { ...props, key: model.key });
  }

  if (model.kind === "server-reference") {
    return createServerReferenceStub(model.id, response, options) as unknown as ReactCompatNode;
  }

  throw new Error(`Unexpected Flight model kind: ${model.kind}`);
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
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(props).map(([key, value]) => [
      key,
      valueIsServerReference(value)
        ? createServerReferenceStub(value.id, response, options)
        : decodeModel(value, response, options),
    ]),
  );
}

function createServerReferenceStub(
  id: number,
  response: FlightResponse,
  options: DecodeFlightOptions,
): (...args: unknown[]) => unknown {
  const reference = getServerReference(id, response);

  return (...args: unknown[]) => {
    if (options.callServerReference === undefined) {
      throw new Error(`No server reference caller configured for ${reference.moduleId}.`);
    }

    return options.callServerReference(reference, args);
  };
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
