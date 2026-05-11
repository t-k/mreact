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

export type ServerActionValidationResult = boolean | string;

export interface ServerActionDescriptor {
  action: ServerAction;
  validateArgs?: (args: unknown[]) => ServerActionValidationResult;
}

export type ServerActionRegistry = Record<string, ServerAction | ServerActionDescriptor>;

export interface ServerActionReplayStore {
  has(value: string): boolean;
  add(value: string): void;
}

export interface ServerActionRequestReference {
  moduleId: string;
  exportName: string;
}

export interface ServerActionHandlerOptions {
  allowedOrigins?: readonly string[];
  authorize?: (
    request: Request,
    reference: ServerActionRequestReference,
    args: unknown[],
  ) => ServerActionValidationResult | Promise<ServerActionValidationResult>;
  csrf?:
    | boolean
    | {
        cookieName?: string;
        headerName?: string;
      };
  replayProtection?: {
    headerName?: string;
    seen: ServerActionReplayStore;
  };
}

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

export function createServerActionHandler(
  actions: ServerActionRegistry,
  options: ServerActionHandlerOptions = {},
) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
    }

    const originResponse = validateRequestOrigin(request, options.allowedOrigins);

    if (originResponse !== undefined) {
      return originResponse;
    }

    const csrfResponse = validateCsrfToken(request, options.csrf);

    if (csrfResponse !== undefined) {
      return csrfResponse;
    }

    const replayResponse = validateServerActionNonce(request, options.replayProtection);

    if (replayResponse !== undefined) {
      return replayResponse;
    }

    const payload = await readServerActionPayload(request);

    if (payload instanceof Response) {
      return payload;
    }

    if (typeof payload.moduleId !== "string" || typeof payload.exportName !== "string") {
      return jsonResponse({ ok: false, error: "Invalid server action reference." }, 400);
    }

    const actionEntry = actions[serverActionKey(payload.moduleId, payload.exportName)];

    if (actionEntry === undefined) {
      return jsonResponse({ ok: false, error: "Unknown server action." }, 404);
    }

    const action = getServerAction(actionEntry);
    const validateArgs = getServerActionArgsValidator(actionEntry);
    const args = Array.isArray(payload.args) ? payload.args : [];
    const validationResult = validateArgs?.(args);

    if (validationResult !== undefined && validationResult !== true) {
      return jsonResponse(
        {
          ok: false,
          error:
            typeof validationResult === "string"
              ? validationResult
              : "Invalid server action arguments.",
        },
        400,
      );
    }

    const authorizationResult = await options.authorize?.(
      request,
      {
        moduleId: payload.moduleId,
        exportName: payload.exportName,
      },
      args,
    );

    if (authorizationResult !== undefined && authorizationResult !== true) {
      return jsonResponse(
        {
          ok: false,
          error:
            typeof authorizationResult === "string"
              ? authorizationResult
              : "Server action not authorized.",
        },
        403,
      );
    }

    try {
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
  const rows: string[] = [];
  const clientWireIds = new Map<number, number>();
  const serverWireIds = new Map<number, number>();
  let nextWireId = 1;

  for (const reference of response.clientReferences) {
    const wireId = nextWireId;
    nextWireId += 1;
    clientWireIds.set(reference.id, wireId);
    rows.push(
      `${formatReactFlightId(wireId)}:I${JSON.stringify([
        reference.moduleId,
        reference.chunks ?? [],
        reference.exportName,
      ])}`,
    );
  }

  for (const reference of response.serverReferences) {
    const wireId = nextWireId;
    nextWireId += 1;
    serverWireIds.set(reference.id, wireId);
    rows.push(
      `${formatReactFlightId(wireId)}:F${JSON.stringify({
        id: serverActionKey(reference.moduleId, reference.exportName),
        bound: null,
        name: reference.exportName,
      })}`,
    );
  }

  rows.push(`0:${JSON.stringify(encodeReactFlightModel(response.root, clientWireIds, serverWireIds))}`);
  return rows.join("\n");
}

export function fromReactFlightRows(rows: string): FlightResponse {
  const lines = rows.split(/\r?\n/).filter(Boolean);
  const metadataLine = lines.find((line) => line.startsWith("M0:"));
  const rootLine = lines.find((line) => line.startsWith("J0:"));

  if (metadataLine !== undefined && rootLine !== undefined) {
    const metadata = JSON.parse(metadataLine.slice(3)) as Omit<FlightResponse, "root">;

    return {
      version: metadata.version,
      clientReferences: metadata.clientReferences,
      serverReferences: metadata.serverReferences,
      root: JSON.parse(rootLine.slice(3)) as FlightModel,
    };
  }

  const clientReferences: FlightClientReference[] = [];
  const serverReferences: FlightServerReference[] = [];
  let root: FlightModel | undefined;

  for (const line of lines) {
    const row = parseReactFlightRow(line);

    if (row.tag === "I") {
      clientReferences.push(parseReactFlightClientReference(row.id, row.payload));
      continue;
    }

    if (row.tag === "F") {
      serverReferences.push(parseReactFlightServerReference(row.id, row.payload));
      continue;
    }

    if (row.tag === undefined && row.id === 0) {
      root = decodeReactFlightModel(JSON.parse(row.payload));
    }
  }

  if (root === undefined) {
    throw new Error("Invalid React Flight rows.");
  }

  return {
    version: 1,
    root,
    clientReferences,
    serverReferences,
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

function encodeReactFlightModel(
  model: FlightModel,
  clientWireIds: ReadonlyMap<number, number>,
  serverWireIds: ReadonlyMap<number, number>,
): unknown {
  if (
    model === null ||
    typeof model === "number" ||
    typeof model === "boolean"
  ) {
    return model;
  }

  if (typeof model === "string") {
    return model.startsWith("$") ? `$${model}` : model;
  }

  if (Array.isArray(model)) {
    return model.map((item) => encodeReactFlightModel(item, clientWireIds, serverWireIds));
  }

  if (model.kind === "undefined") {
    return "$undefined";
  }

  if (model.kind === "server-reference") {
    return `$F${serverWireIds.get(model.id) ?? model.id}`;
  }

  if (model.kind === "client-reference") {
    return `$L${clientWireIds.get(model.id) ?? model.id}`;
  }

  if (model.kind === "element") {
    return [
      "$",
      encodeReactFlightElementType(model.type, clientWireIds),
      model.key,
      encodeReactFlightProps(model.props, clientWireIds, serverWireIds),
    ];
  }

  return encodeReactFlightProps(model, clientWireIds, serverWireIds);
}

function encodeReactFlightElementType(
  type: FlightElementModel["type"],
  clientWireIds: ReadonlyMap<number, number>,
): string {
  if (typeof type === "string") {
    return type;
  }

  if (type.kind === "fragment") {
    return "$Sreact.fragment";
  }

  return `$L${clientWireIds.get(type.id) ?? type.id}`;
}

function encodeReactFlightProps(
  props: Record<string, FlightModel | undefined>,
  clientWireIds: ReadonlyMap<number, number>,
  serverWireIds: ReadonlyMap<number, number>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(props)
      .filter((entry): entry is [string, FlightModel] => entry[1] !== undefined)
      .map(([key, value]) => [
        key,
        encodeReactFlightModel(value, clientWireIds, serverWireIds),
      ]),
  );
}

interface ReactFlightRow {
  id: number;
  tag?: string;
  payload: string;
}

function parseReactFlightRow(line: string): ReactFlightRow {
  const separator = line.indexOf(":");

  if (separator <= 0) {
    throw new Error("Invalid React Flight row.");
  }

  const id = parseReactFlightId(line.slice(0, separator));
  const body = line.slice(separator + 1);
  const first = body[0];
  const hasTag = first !== undefined && /^[A-Z]$/.test(first);

  return {
    id,
    ...(hasTag ? { tag: first } : {}),
    payload: hasTag ? body.slice(1) : body,
  };
}

function parseReactFlightClientReference(id: number, payload: string): FlightClientReference {
  const value = JSON.parse(payload) as unknown;

  if (Array.isArray(value)) {
    return {
      id,
      moduleId: String(value[0]),
      chunks: Array.isArray(value[1]) ? value[1].map(String) : [],
      exportName: String(value[2] ?? "default"),
    };
  }

  const object = valueIsObject(value) ? value : {};

  return {
    id,
    moduleId: String(object.id ?? object.moduleId ?? ""),
    chunks: Array.isArray(object.chunks) ? object.chunks.map(String) : [],
    exportName: String(object.name ?? object.exportName ?? "default"),
  };
}

function parseReactFlightServerReference(id: number, payload: string): FlightServerReference {
  const value = JSON.parse(payload) as unknown;
  const object = valueIsObject(value) ? value : {};
  const actionId = String(object.id ?? "");
  const separator = actionId.lastIndexOf("#");

  return {
    id,
    moduleId: separator < 0 ? actionId : actionId.slice(0, separator),
    exportName:
      typeof object.name === "string"
        ? object.name
        : separator < 0
          ? "default"
          : actionId.slice(separator + 1),
  };
}

function decodeReactFlightModel(value: unknown): FlightModel {
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return decodeReactFlightString(value);
  }

  if (Array.isArray(value)) {
    if (value[0] === "$") {
      return {
        kind: "element",
        type: decodeReactFlightElementType(value[1]),
        key: typeof value[2] === "string" ? value[2] : null,
        props: decodeReactFlightProps(valueIsObject(value[3]) ? value[3] : {}),
      };
    }

    return value.map(decodeReactFlightModel);
  }

  if (valueIsObject(value)) {
    return decodeReactFlightProps(value);
  }

  return { kind: "undefined" };
}

function decodeReactFlightString(value: string): FlightModel {
  if (value === "$undefined") {
    return { kind: "undefined" };
  }

  if (value.startsWith("$$")) {
    return value.slice(1);
  }

  if (/^\$F[0-9a-f]+$/i.test(value)) {
    return {
      kind: "server-reference",
      id: parseReactFlightId(value.slice(2)),
    };
  }

  if (/^\$L[0-9a-f]+$/i.test(value)) {
    return {
      kind: "client-reference",
      id: parseReactFlightId(value.slice(2)),
    };
  }

  return value;
}

function decodeReactFlightElementType(value: unknown): FlightElementModel["type"] {
  if (value === "$Sreact.fragment") {
    return { kind: "fragment" };
  }

  if (typeof value === "string" && /^\$L[0-9a-f]+$/i.test(value)) {
    return {
      kind: "client-reference",
      id: parseReactFlightId(value.slice(2)),
    };
  }

  return typeof value === "string" ? value : String(value);
}

function decodeReactFlightProps(value: Record<string, unknown>): Record<string, FlightModel> {
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, decodeReactFlightModel(child)]),
  );
}

function valueIsObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatReactFlightId(id: number): string {
  return id.toString(16);
}

function parseReactFlightId(value: string): number {
  return Number.parseInt(value, 16);
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

async function readServerActionPayload(request: Request): Promise<
  | {
      moduleId?: unknown;
      exportName?: unknown;
      args?: unknown;
    }
  | Response
> {
  try {
    return (await request.json()) as {
      moduleId?: unknown;
      exportName?: unknown;
      args?: unknown;
    };
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON payload." }, 400);
  }
}

function getServerAction(entry: ServerAction | ServerActionDescriptor): ServerAction {
  return typeof entry === "function" ? entry : entry.action;
}

function getServerActionArgsValidator(
  entry: ServerAction | ServerActionDescriptor,
): ServerActionDescriptor["validateArgs"] {
  return typeof entry === "function" ? undefined : entry.validateArgs;
}

function validateRequestOrigin(
  request: Request,
  allowedOrigins: readonly string[] | undefined,
): Response | undefined {
  if (allowedOrigins === undefined || allowedOrigins.length === 0) {
    return undefined;
  }

  const origin = request.headers.get("origin");

  return origin !== null && allowedOrigins.includes(origin)
    ? undefined
    : jsonResponse({ ok: false, error: "Origin not allowed." }, 403);
}

function validateCsrfToken(
  request: Request,
  csrf: ServerActionHandlerOptions["csrf"],
): Response | undefined {
  if (csrf !== true && typeof csrf !== "object") {
    return undefined;
  }

  const headerName =
    typeof csrf === "object" && csrf.headerName !== undefined
      ? csrf.headerName
      : "x-mreact-csrf";
  const cookieName =
    typeof csrf === "object" && csrf.cookieName !== undefined ? csrf.cookieName : "mreact.csrf";
  const headerToken = request.headers.get(headerName);
  const cookieToken = readCookie(request.headers.get("cookie"), cookieName);

  return headerToken !== null && cookieToken !== undefined && headerToken === cookieToken
    ? undefined
    : jsonResponse({ ok: false, error: "Invalid CSRF token." }, 403);
}

function validateServerActionNonce(
  request: Request,
  replayProtection: ServerActionHandlerOptions["replayProtection"],
): Response | undefined {
  if (replayProtection === undefined) {
    return undefined;
  }

  const headerName = replayProtection.headerName ?? "x-mreact-action-nonce";
  const nonce = request.headers.get(headerName);

  if (nonce === null || nonce.length === 0) {
    return jsonResponse({ ok: false, error: "Missing server action nonce." }, 400);
  }

  if (replayProtection.seen.has(nonce)) {
    return jsonResponse({ ok: false, error: "Server action nonce was already used." }, 409);
  }

  replayProtection.seen.add(nonce);
  return undefined;
}

function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (cookieHeader === null) {
    return undefined;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");

    if (rawKey === name) {
      return decodeURIComponent(rawValue.join("="));
    }
  }

  return undefined;
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
