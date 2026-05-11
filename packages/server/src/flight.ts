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

export interface FlightClientReferenceInput {
  name: string;
  moduleId: string;
  exportName: string;
}

export interface FlightClientManifestEntry extends FlightClientReferenceInput {
  chunks: string[];
}

export type ServerAction = (...args: unknown[]) => unknown | Promise<unknown>;
export type ServerActionRegistry = Record<string, ServerAction>;

export interface FlightScriptOptions {
  id?: string;
  nonce?: string;
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

export function renderFlightResponseScript(
  response: FlightResponse,
  options: FlightScriptOptions = {},
): string {
  const idAttribute = options.id === undefined ? "" : ` id="${escapeAttribute(options.id)}"`;
  const nonceAttribute =
    options.nonce === undefined ? "" : ` nonce="${escapeAttribute(options.nonce)}"`;

  return `<script type="application/json" data-mreact-flight${idAttribute}${nonceAttribute}>${serializeJsonForHtml(response)}</script>`;
}

export function createServerActionHandler(actions: ServerActionRegistry) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
    }

    const payload = (await request.json()) as {
      moduleId?: unknown;
      exportName?: unknown;
      args?: unknown;
    };

    if (typeof payload.moduleId !== "string" || typeof payload.exportName !== "string") {
      return jsonResponse({ ok: false, error: "Invalid server action reference." }, 400);
    }

    const action = actions[serverActionKey(payload.moduleId, payload.exportName)];

    if (action === undefined) {
      return jsonResponse({ ok: false, error: "Unknown server action." }, 404);
    }

    try {
      const args = Array.isArray(payload.args) ? payload.args : [];
      return jsonResponse({ ok: true, value: await action(...args) }, 200);
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  };
}

export function toReactFlightRows(response: FlightResponse): string {
  const metadata = {
    version: response.version,
    clientReferences: response.clientReferences,
    serverReferences: response.serverReferences,
  };

  return [`M0:${JSON.stringify(metadata)}`, `J0:${JSON.stringify(response.root)}`].join("\n");
}

export function fromReactFlightRows(rows: string): FlightResponse {
  const lines = rows.split(/\r?\n/).filter(Boolean);
  const metadataLine = lines.find((line) => line.startsWith("M0:"));
  const rootLine = lines.find((line) => line.startsWith("J0:"));

  if (metadataLine === undefined || rootLine === undefined) {
    throw new Error("Invalid React Flight rows.");
  }

  const metadata = JSON.parse(metadataLine.slice(3)) as Omit<FlightResponse, "root">;

  return {
    version: metadata.version,
    clientReferences: metadata.clientReferences,
    serverReferences: metadata.serverReferences,
    root: JSON.parse(rootLine.slice(3)) as FlightModel,
  };
}

export function createFlightClientManifest(
  references: readonly FlightClientReferenceInput[],
  resolveChunks: (reference: FlightClientReferenceInput) => string[],
): FlightClientManifestEntry[] {
  return references.map((reference) => ({
    ...reference,
    chunks: resolveChunks(reference),
  }));
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

function serverActionKey(moduleId: string, exportName: string): string {
  return `${moduleId}#${exportName}`;
}

function jsonResponse(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function serializeJsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
