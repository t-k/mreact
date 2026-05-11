export const CLIENT_REFERENCE_TYPE = Symbol.for("modular.react.client_reference");
export const SERVER_REFERENCE_TYPE = Symbol.for("modular.react.server_reference");

const REACT_COMPAT_ELEMENT_TYPE = Symbol.for("modular.react.element");
const REACT_COMPAT_FRAGMENT_TYPE = Symbol.for("modular.react.fragment");

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

export interface ClientReference {
  $$typeof: typeof CLIENT_REFERENCE_TYPE;
  moduleId: string;
  exportName: string;
  chunks?: string[];
}

export interface ServerReference {
  $$typeof: typeof SERVER_REFERENCE_TYPE;
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

interface ReactCompatElementLike {
  $$typeof: symbol;
  type: unknown;
  key: string | null;
  props: Record<string, unknown>;
}

interface FlightSerializationState {
  clientReferences: FlightClientReference[];
  clientReferenceIndexes: Map<string, number>;
  serverReferences: FlightServerReference[];
  serverReferenceIndexes: Map<string, number>;
}

export function createClientReference(
  moduleId: string,
  exportName = "default",
  chunks?: string[],
): ClientReference {
  return {
    $$typeof: CLIENT_REFERENCE_TYPE,
    moduleId,
    exportName,
    ...(chunks === undefined ? {} : { chunks }),
  };
}

export function createServerReference(
  moduleId: string,
  exportName = "default",
): ServerReference {
  return {
    $$typeof: SERVER_REFERENCE_TYPE,
    moduleId,
    exportName,
  };
}

export function isClientReference(value: unknown): value is ClientReference {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === CLIENT_REFERENCE_TYPE
  );
}

export function isServerReference(value: unknown): value is ServerReference {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === SERVER_REFERENCE_TYPE
  );
}

export async function renderToFlightResponse<P extends Record<string, unknown>>(
  renderable: ((props: P) => unknown) | unknown,
  props = {} as P,
): Promise<FlightResponse> {
  const state: FlightSerializationState = {
    clientReferences: [],
    clientReferenceIndexes: new Map(),
    serverReferences: [],
    serverReferenceIndexes: new Map(),
  };
  const rootValue =
    typeof renderable === "function"
      ? await (renderable as (props: P) => unknown)(props)
      : renderable;

  return {
    version: 1,
    root: await serializeFlightValue(rootValue, state),
    clientReferences: state.clientReferences,
    serverReferences: state.serverReferences,
  };
}

export function stringifyFlightResponse(response: FlightResponse): string {
  return JSON.stringify(response);
}

async function serializeFlightValue(
  value: unknown,
  state: FlightSerializationState,
): Promise<FlightModel> {
  const awaited = await value;

  if (awaited === null) {
    return null;
  }

  if (awaited === undefined) {
    return { kind: "undefined" };
  }

  if (
    typeof awaited === "string" ||
    typeof awaited === "number" ||
    typeof awaited === "boolean"
  ) {
    return awaited;
  }

  if (Array.isArray(awaited)) {
    return await Promise.all(awaited.map((item) => serializeFlightValue(item, state)));
  }

  if (isServerReference(awaited)) {
    return {
      kind: "server-reference",
      id: getServerReferenceId(awaited, state),
    };
  }

  if (isReactCompatElement(awaited)) {
    return await serializeElement(awaited, state);
  }

  if (typeof awaited === "object") {
    return await serializeObject(awaited as Record<string, unknown>, state);
  }

  throw new TypeError(`Unsupported Flight value: ${typeof awaited}`);
}

async function serializeElement(
  element: ReactCompatElementLike,
  state: FlightSerializationState,
): Promise<FlightElementModel | FlightModel> {
  if (typeof element.type === "function") {
    return await serializeFlightValue(element.type(element.props), state);
  }

  if (isClientReference(element.type)) {
    return {
      kind: "element",
      type: {
        kind: "client-reference",
        id: getClientReferenceId(element.type, state),
      },
      key: element.key,
      props: await serializeProps(element.props, state),
    };
  }

  if (typeof element.type === "string") {
    return {
      kind: "element",
      type: element.type,
      key: element.key,
      props: await serializeProps(element.props, state),
    };
  }

  if (element.type === REACT_COMPAT_FRAGMENT_TYPE) {
    return {
      kind: "element",
      type: { kind: "fragment" },
      key: element.key,
      props: await serializeProps(element.props, state),
    };
  }

  throw new TypeError("Unsupported Flight element type.");
}

async function serializeProps(
  props: Record<string, unknown>,
  state: FlightSerializationState,
): Promise<Record<string, FlightModel>> {
  const entries = await Promise.all(
    Object.entries(props).map(async ([key, value]) => [
      key,
      await serializeFlightValue(value, state),
    ] as const),
  );

  return Object.fromEntries(entries);
}

async function serializeObject(
  object: Record<string, unknown>,
  state: FlightSerializationState,
): Promise<FlightObjectModel> {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(object).map(async ([key, value]) => [
        key,
        await serializeFlightValue(value, state),
      ] as const),
    ),
  ) as FlightObjectModel;
}

function getClientReferenceId(
  reference: ClientReference,
  state: FlightSerializationState,
): number {
  const key = `${reference.moduleId}:${reference.exportName}`;
  const existing = state.clientReferenceIndexes.get(key);

  if (existing !== undefined) {
    return existing;
  }

  const id = state.clientReferences.length;
  state.clientReferences.push({
    id,
    moduleId: reference.moduleId,
    exportName: reference.exportName,
    ...(reference.chunks === undefined ? {} : { chunks: reference.chunks }),
  });
  state.clientReferenceIndexes.set(key, id);
  return id;
}

function getServerReferenceId(
  reference: ServerReference,
  state: FlightSerializationState,
): number {
  const key = `${reference.moduleId}:${reference.exportName}`;
  const existing = state.serverReferenceIndexes.get(key);

  if (existing !== undefined) {
    return existing;
  }

  const id = state.serverReferences.length;
  state.serverReferences.push({
    id,
    moduleId: reference.moduleId,
    exportName: reference.exportName,
  });
  state.serverReferenceIndexes.set(key, id);
  return id;
}

function isReactCompatElement(value: unknown): value is ReactCompatElementLike {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === REACT_COMPAT_ELEMENT_TYPE
  );
}
