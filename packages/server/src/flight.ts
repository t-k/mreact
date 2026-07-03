import { createCacheScope, runWithCacheScope } from "@reckona/mreact-compat/internal";
import { getNativeFlight } from "./native-flight.js";

/** Symbol tag used to identify client references in serialized Flight values. */
export const CLIENT_REFERENCE_TYPE = Symbol.for("modular.react.client_reference");
/** Symbol tag used to identify server references in serialized Flight values. */
export const SERVER_REFERENCE_TYPE = Symbol.for("modular.react.server_reference");

const REACT_COMPAT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
const REACT_COMPAT_FRAGMENT_TYPE = Symbol.for("react.fragment");

/** Registered client reference included in a Flight response. */
export interface FlightClientReference {
  id: number;
  moduleId: string;
  exportName: string;
  chunks?: string[];
}

/** Input used to register a client reference before assigning a Flight id. */
export interface FlightClientReferenceInput {
  name: string;
  moduleId: string;
  exportName: string;
}

/** Client manifest entry with resolved module chunks. */
export interface FlightClientManifestEntry extends FlightClientReferenceInput {
  chunks: string[];
}

/** Function that can be invoked through a server action request. */
export type ServerAction = (...args: unknown[]) => unknown | Promise<unknown>;

/** Validation result returned by server action guards. */
export type ServerActionValidationResult = boolean | string;

/** Server action entry with optional argument validation. */
export interface ServerActionDescriptor {
  action: ServerAction;
  validateArgs?: (args: unknown[]) => ServerActionValidationResult;
}

/** Registry mapping server action keys to handlers. */
export type ServerActionRegistry = Record<string, ServerAction | ServerActionDescriptor>;

/** Store used to reject replayed server action nonces. */
export interface ServerActionReplayStore {
  has(value: string): boolean;
  add(value: string): void;
}

/** Module export reference requested by a server action request. */
export interface ServerActionRequestReference {
  moduleId: string;
  exportName: string;
}

/** Security and validation options for createServerActionHandler. */
export interface ServerActionHandlerOptions {
  // Issue 076: secure defaults. When undefined, the handler enforces the
  // same-origin policy by comparing `Origin` to the request URL. Pass an
  // explicit array to extend the trust set, or `"any"` to disable the
  // check entirely (documented opt-out).
  allowedOrigins?: readonly string[] | "any";
  authorize?: (
    request: Request,
    reference: ServerActionRequestReference,
    args: unknown[],
  ) => ServerActionValidationResult | Promise<ServerActionValidationResult>;
  allowedActions?: readonly ServerActionRequestReference[];
  // Issue 076: CSRF is enabled by default. Pass `false` to disable
  // (documented opt-out for embedders that have their own scheme).
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
  // Issue 076: bound by default so a hostile client cannot drive RSS via
  // an unbounded request body. The default is 1 MiB; pass a larger value
  // to allow bigger payloads.
  maxBodyBytes?: number;
}

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const MAX_SERVER_ACTION_ARGUMENT_DEPTH = 64;
const MAX_SERVER_ACTION_ARGUMENT_ARRAY_LENGTH = 2_000;
const MAX_SERVER_ACTION_ARGUMENT_OBJECT_KEYS = 200;
const SERVER_ACTION_FORBIDDEN_JSON_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Options for embedding a serialized Flight response in a script tag. */
export interface FlightScriptOptions {
  id?: string;
  nonce?: string;
}

/** Registered server reference included in a Flight response. */
export interface FlightServerReference {
  id: number;
  moduleId: string;
  exportName: string;
  bound?: FlightModel[];
}

/** Runtime marker object representing a client module export. */
export interface ClientReference {
  $$typeof: typeof CLIENT_REFERENCE_TYPE;
  moduleId: string;
  exportName: string;
  chunks?: string[];
}

/** Runtime marker object representing a server module export. */
export interface ServerReference {
  $$typeof: typeof SERVER_REFERENCE_TYPE;
  moduleId: string;
  exportName: string;
  bound?: unknown[];
}

/** Serializable Flight payload with root model and module references. */
export interface FlightResponse {
  version: 1;
  root: FlightModel;
  clientReferences: FlightClientReference[];
  serverReferences: FlightServerReference[];
}

/** Recursive value model supported by the mreact Flight serializer. */
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
  | FlightDateModel
  | FlightBigIntModel
  | FlightNumberModel
  | FlightSymbolModel
  | FlightMapModel
  | FlightSetModel
  | FlightFormDataModel
  | FlightIterableModel
  | FlightErrorModel
  | FlightPromiseModel
  | FlightArrayBufferModel
  | FlightTypedArrayModel
  | FlightDataViewModel
  | { kind: "undefined" };

/** Plain object shape inside a Flight model. */
export interface FlightObjectModel {
  kind?: never;
  [key: string]: FlightModel | undefined;
}

/** Serialized React-compatible element inside a Flight model. */
export interface FlightElementModel {
  kind: "element";
  type: string | FlightClientReferenceModel | { kind: "fragment" };
  key: string | null;
  props: Record<string, FlightModel>;
}

/** Reference to a client module export inside a Flight model. */
export interface FlightClientReferenceModel {
  kind: "client-reference";
  id: number;
}

/** Reference to a server module export inside a Flight model. */
export interface FlightServerReferenceModel {
  kind: "server-reference";
  id: number;
}

/** Serialized Date value inside a Flight model. */
export interface FlightDateModel {
  kind: "date";
  value: string;
}

/** Serialized bigint value inside a Flight model. */
export interface FlightBigIntModel {
  kind: "bigint";
  value: string;
}

/** Serialized non-finite or negative-zero number inside a Flight model. */
export interface FlightNumberModel {
  kind: "number";
  value: "Infinity" | "-Infinity" | "NaN" | "-0";
}

/** Serialized global symbol reference inside a Flight model. */
export interface FlightSymbolModel {
  kind: "symbol";
  name: string;
}

/** Serialized Map value inside a Flight model. */
export interface FlightMapModel {
  kind: "map";
  entries: [FlightModel, FlightModel][];
}

/** Serialized Set value inside a Flight model. */
export interface FlightSetModel {
  kind: "set";
  values: FlightModel[];
}

/** Serialized FormData value inside a Flight model. */
export interface FlightFormDataModel {
  kind: "form-data";
  entries: [string, FlightModel][];
}

/** Serialized iterable value inside a Flight model. */
export interface FlightIterableModel {
  kind: "iterable";
  values: FlightModel[];
}

/** Serialized Error value inside a Flight model. */
export interface FlightErrorModel {
  kind: "error";
  name: string;
  message: string;
  digest?: string;
}

/** Reference to an outlined promise chunk inside a Flight model. */
export interface FlightPromiseModel {
  kind: "promise";
  id: number;
}

/** Serialized ArrayBuffer value inside a Flight model. */
export interface FlightArrayBufferModel {
  kind: "array-buffer";
  bytes: number[];
}

/** Serialized typed array value inside a Flight model. */
export interface FlightTypedArrayModel {
  kind: "typed-array";
  arrayType: FlightTypedArrayName;
  bytes: number[];
}

/** Serialized DataView value inside a Flight model. */
export interface FlightDataViewModel {
  kind: "data-view";
  bytes: number[];
}

/** Typed array constructor names supported by the Flight serializer. */
export type FlightTypedArrayName =
  | "Int8Array"
  | "Uint8Array"
  | "Uint8ClampedArray"
  | "Int16Array"
  | "Uint16Array"
  | "Int32Array"
  | "Uint32Array"
  | "Float32Array"
  | "Float64Array"
  | "BigInt64Array"
  | "BigUint64Array";

const reactFlightBinaryRowTags = [
  "A",
  "O",
  "o",
  "U",
  "S",
  "s",
  "L",
  "l",
  "G",
  "g",
  "M",
  "m",
  "V",
] as const;
const reactFlightRowTags = [
  "C",
  "D",
  "E",
  "F",
  "H",
  "I",
  "J",
  "N",
  "P",
  "R",
  "T",
  "W",
  "X",
  "x",
  "r",
] as const;
const reactFlightModelTokens = [
  "$",
  "$$",
  "$@",
  "$D",
  "$E",
  "$F",
  "$I",
  "$K",
  "$L",
  "$N",
  "$Q",
  "$S",
  "$W",
  "$Y",
  "$Z",
  "$i",
  "$n",
  "$u",
  "$undefined",
] as const;

/** Lists the React Flight row tags and model tokens covered by the serializer. */
export interface ReactFlightProtocolCoverage {
  binaryRowTags: string[];
  modelTokens: string[];
  rowTags: string[];
}

/** Returns the React Flight protocol tags and tokens supported by this package. */
export function getReactFlightProtocolCoverage(): ReactFlightProtocolCoverage {
  return {
    binaryRowTags: [...reactFlightBinaryRowTags],
    modelTokens: [...reactFlightModelTokens],
    rowTags: [...reactFlightRowTags],
  };
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

/** Creates a runtime client reference marker for a module export. */
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

/** Creates a runtime server reference marker for a module export. */
export function createServerReference(
  moduleId: string,
  exportName = "default",
  bound?: unknown[],
): ServerReference {
  return {
    $$typeof: SERVER_REFERENCE_TYPE,
    moduleId,
    exportName,
    ...(bound === undefined ? {} : { bound }),
  };
}

/** Returns true when a value is a runtime client reference marker. */
export function isClientReference(value: unknown): value is ClientReference {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === CLIENT_REFERENCE_TYPE
  );
}

/** Returns true when a value is a runtime server reference marker. */
export function isServerReference(value: unknown): value is ServerReference {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === SERVER_REFERENCE_TYPE
  );
}

/** Serializes a renderable value into a structured Flight response. */
export async function renderToFlightResponse<P extends Record<string, unknown>>(
  renderable: ((props: P) => unknown) | unknown,
  props = {} as P,
): Promise<FlightResponse> {
  return runWithFlightCacheScope(async () => {
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
      root: await serializeFlightValue(rootValue, state, 0),
      clientReferences: state.clientReferences,
      serverReferences: state.serverReferences,
    };
  });
}

/** Serializes a Flight response to JSON text. */
export function stringifyFlightResponse(response: FlightResponse): string {
  return JSON.stringify(response);
}

/** Renders a Flight response as an HTML script tag. */
export function renderFlightResponseScript(
  response: FlightResponse,
  options: FlightScriptOptions = {},
): string {
  const idAttribute = options.id === undefined ? "" : ` id="${escapeAttribute(options.id)}"`;
  const nonceAttribute =
    options.nonce === undefined ? "" : ` nonce="${escapeAttribute(options.nonce)}"`;

  return `<script type="application/json" data-mreact-flight${idAttribute}${nonceAttribute}>${serializeJsonForHtml(response)}</script>`;
}

/** Creates a request handler that validates and invokes registered server actions. */
export function createServerActionHandler(
  actions: ServerActionRegistry,
  options: ServerActionHandlerOptions = {},
) {
  const allowedActionKeys = options.allowedActions?.map((reference) =>
    serverActionKey(reference.moduleId, reference.exportName),
  );
  const allowedActionSet = allowedActionKeys === undefined ? undefined : new Set(allowedActionKeys);

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

    // Issue 076: mark the nonce as used only after the action runs.
    // The validator now just reads + checks; the commit happens in a
    // try/finally below.
    const nonceCheck = validateServerActionNonce(request, options.replayProtection);

    if (nonceCheck.response !== undefined) {
      return nonceCheck.response;
    }

    const payload = await readServerActionPayload(
      request,
      options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
    );

    if (payload instanceof Response) {
      return payload;
    }

    if (typeof payload.moduleId !== "string" || typeof payload.exportName !== "string") {
      return jsonResponse({ ok: false, error: "Invalid server action reference." }, 400);
    }

    const reference = {
      moduleId: payload.moduleId,
      exportName: payload.exportName,
    };

    if (!isAllowedServerAction(reference, allowedActionSet)) {
      return jsonResponse({ ok: false, error: "Unknown server action." }, 404);
    }

    const actionEntry = actions[serverActionKey(payload.moduleId, payload.exportName)];

    if (actionEntry === undefined) {
      return jsonResponse({ ok: false, error: "Unknown server action." }, 404);
    }

    const action = getServerAction(actionEntry);
    const validateArgs = getServerActionArgsValidator(actionEntry);
    const boundArgs = Array.isArray(payload.bound) ? payload.bound : [];
    const extraArgs = Array.isArray(payload.args) ? payload.args : [];
    const argsStructure = validateServerActionJsonArgumentStructure(boundArgs, extraArgs);

    if (!argsStructure.valid) {
      return jsonResponse(
        {
          ok: false,
          error: "Invalid server action argument structure.",
        },
        400,
      );
    }

    const args = [...boundArgs, ...extraArgs];
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

    const authorizationResult = await options.authorize?.(request, reference, args);

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
      const value = await action(...args);
      // Only commit the nonce on a successful run -- a flaky network
      // retry can otherwise lose the request permanently (Issue 076).
      if (nonceCheck.commit) nonceCheck.commit();
      return jsonResponse({ ok: true, value }, 200);
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

/** Encodes a structured Flight response into React Flight row text. */
export function toReactFlightRows(response: FlightResponse): string {
  // Issue 081 note: a native encoder exists in
  // `packages/router-native/src/flight.rs::encode_flight_response`
  // but is intentionally *not* wired here. Microbenchmarking on
  // 2026-05-13 showed the JS-stringify -> napi -> Rust-parse ->
  // Rust-stringify round-trip dominates and produces a 7-9x
  // regression vs. the pure JS path. Re-wiring it requires
  // accepting a `napi::JsObject` directly to avoid the double JSON
  // pass; tracked as a follow-up.
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

  const state: ReactFlightEncodingState = {
    clientWireIds,
    serverWireIds,
    outlineRows: rows,
    nextWireId,
  };

  for (const reference of response.serverReferences) {
    const wireId = state.nextWireId;
    state.nextWireId += 1;
    serverWireIds.set(reference.id, wireId);
    rows.push(
      `${formatReactFlightId(wireId)}:F${JSON.stringify({
        id: serverActionKey(reference.moduleId, reference.exportName),
        bound:
          reference.bound === undefined
            ? null
            : reference.bound.map((value) => encodeReactFlightModel(value, state)),
        name: reference.exportName,
      })}`,
    );
  }

  if (isFlightErrorModel(response.root)) {
    rows.push(`0:E${JSON.stringify(encodeReactFlightError(response.root))}`);
  } else {
    rows.push(`0:${JSON.stringify(encodeReactFlightModel(response.root, state))}`);
  }
  return rows.join("\n");
}

/** Decodes React Flight row text into a structured Flight response. */
export function fromReactFlightRows(rows: string): FlightResponse {
  // Issue 081 note: a native decoder exists in
  // `packages/router-native/src/flight.rs::decode_flight_rows`
  // but is intentionally *not* wired here. Benchmarking on
  // 2026-05-13 showed 4-14x regression vs. the pure JS walker —
  // V8's JSON.parse is already extremely optimized and the
  // napi -> serde_json::parse -> walk -> serde_json::serialize ->
  // JS.parse round-trip multiplies the work. Wiring it requires
  // returning a `napi::JsObject` directly (avoiding the double
  // JSON pass); see `docs/benchmarks/2026-05-13-flight-rust-port.md`.
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
  const modelChunks = new Map<number, unknown>();
  const errorChunks = new Map<number, FlightErrorModel>();
  let root: FlightModel | undefined;

  for (const line of lines) {
    const row = parseReactFlightRow(line);

    if (row.tag === "I") {
      clientReferences.push(parseReactFlightClientReference(row.id, row.payload));
      continue;
    }

    if (row.tag === "F") {
      serverReferences.push(
        parseReactFlightServerReference(row.id, row.payload, modelChunks, errorChunks),
      );
      continue;
    }

    if (row.tag === "E") {
      const error = parseReactFlightError(row.payload);
      errorChunks.set(row.id, error);

      if (row.id === 0) {
        root = error;
      }
      continue;
    }

    if (row.tag === "T") {
      modelChunks.set(row.id, parseReactFlightTextChunk(row.payload));
      continue;
    }

    if (isReactFlightBinaryRowTag(row.tag)) {
      modelChunks.set(row.id, parseReactFlightBinaryChunk(row.tag, row.payload));
      continue;
    }

    if (isReactFlightMetadataTag(row.tag)) {
      continue;
    }

    if (row.tag === undefined && row.payload !== "") {
      modelChunks.set(row.id, JSON.parse(row.payload));
    }
  }

  if (root === undefined && modelChunks.has(0)) {
    root = decodeReactFlightModel(modelChunks.get(0), modelChunks, errorChunks);
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

/** Merges additional React Flight row text into an existing Flight response. */
export function mergeReactFlightRows(response: FlightResponse, rows: string): FlightResponse {
  // Issue 081 note: same finding as `fromReactFlightRows` — the native
  // merge path is slower than the JS one given the double-JSON tax.
  const modelChunks = new Map<number, unknown>();
  const errorChunks = new Map<number, FlightErrorModel>();
  const clientReferences = [...response.clientReferences];
  const serverReferences = [...response.serverReferences];

  for (const line of rows.split(/\r?\n/).filter(Boolean)) {
    const row = parseReactFlightRow(line);

    if (row.tag === "I") {
      clientReferences.push(parseReactFlightClientReference(row.id, row.payload));
      continue;
    }

    if (row.tag === "F") {
      serverReferences.push(
        parseReactFlightServerReference(row.id, row.payload, modelChunks, errorChunks),
      );
      continue;
    }

    if (row.tag === "E") {
      errorChunks.set(row.id, parseReactFlightError(row.payload));
      continue;
    }

    if (row.tag === "T") {
      modelChunks.set(row.id, parseReactFlightTextChunk(row.payload));
      continue;
    }

    if (isReactFlightBinaryRowTag(row.tag)) {
      modelChunks.set(row.id, parseReactFlightBinaryChunk(row.tag, row.payload));
      continue;
    }

    if (isReactFlightMetadataTag(row.tag)) {
      continue;
    }

    if (row.tag === undefined && row.payload !== "") {
      modelChunks.set(row.id, JSON.parse(row.payload));
    }
  }

  return {
    ...response,
    clientReferences,
    serverReferences,
    root: resolveFlightPromiseChunks(response.root, modelChunks, errorChunks),
  };
}

/** Builds a Flight client manifest from client references and chunk resolution. */
export function createFlightClientManifest(
  references: readonly FlightClientReferenceInput[],
  resolveChunks: (reference: FlightClientReferenceInput) => string[],
): FlightClientManifestEntry[] {
  return references.map((reference) => ({
    ...reference,
    chunks: resolveChunks(reference),
  }));
}

/** Renders modulepreload links for client chunks referenced by a Flight response. */
export function renderFlightPreloadLinks(
  response: FlightResponse,
  options: { nonce?: string } = {},
): string {
  const seen = new Set<string>();
  const nonceAttribute =
    options.nonce === undefined ? "" : ` nonce="${escapeAttribute(options.nonce)}"`;

  return response.clientReferences
    .flatMap((reference) => reference.chunks ?? [])
    .filter((chunk) => {
      if (seen.has(chunk)) {
        return false;
      }

      seen.add(chunk);
      return true;
    })
    .map((chunk) => `<link rel="modulepreload" href="${escapeAttribute(chunk)}"${nonceAttribute}>`)
    .join("");
}

function resolveFlightPromiseChunks(
  model: FlightModel,
  modelChunks: ReadonlyMap<number, unknown>,
  errorChunks: ReadonlyMap<number, FlightErrorModel>,
  depth = 0,
  context: FlightDecodeContext = createFlightDecodeContext(),
): FlightModel {
  if (depth > MAX_FLIGHT_DECODE_DEPTH) flightTooDeep();

  if (
    model === null ||
    typeof model === "string" ||
    typeof model === "number" ||
    typeof model === "boolean"
  ) {
    return model;
  }

  if (Array.isArray(model)) {
    return model.map((item) =>
      resolveFlightPromiseChunks(item, modelChunks, errorChunks, depth + 1, context),
    );
  }

  if (model.kind === "promise") {
    const error = errorChunks.get(model.id);

    if (error !== undefined) {
      return error;
    }

    if (modelChunks.has(model.id)) {
      if (context.inProgressChunkIds.has(model.id)) {
        flightCycle(model.id);
      }

      context.inProgressChunkIds.add(model.id);
      try {
        return decodeReactFlightModel(
          modelChunks.get(model.id),
          modelChunks,
          errorChunks,
          depth + 1,
          context,
        );
      } finally {
        context.inProgressChunkIds.delete(model.id);
      }
    }

    return model;
  }

  if (model.kind === "element") {
    return {
      ...model,
      props: Object.fromEntries(
        Object.entries(model.props).map(([key, value]) => [
          key,
          resolveFlightPromiseChunks(value, modelChunks, errorChunks, depth + 1, context),
        ]),
      ),
    };
  }

  if (model.kind === "map") {
    return {
      ...model,
      entries: model.entries.map(([key, value]): [FlightModel, FlightModel] => [
        resolveFlightPromiseChunks(key, modelChunks, errorChunks, depth + 1, context),
        resolveFlightPromiseChunks(value, modelChunks, errorChunks, depth + 1, context),
      ]),
    };
  }

  if (model.kind === "set") {
    return {
      ...model,
      values: model.values.map((value) =>
        resolveFlightPromiseChunks(value, modelChunks, errorChunks, depth + 1, context),
      ),
    };
  }

  if ("kind" in model) {
    return model;
  }

  return Object.fromEntries(
    Object.entries(model).map(([key, value]) => [
      key,
      value === undefined
        ? undefined
        : resolveFlightPromiseChunks(value, modelChunks, errorChunks, depth + 1, context),
    ]),
  );
}

interface ReactFlightEncodingState {
  clientWireIds: ReadonlyMap<number, number>;
  serverWireIds: ReadonlyMap<number, number>;
  outlineRows: string[];
  nextWireId: number;
}

function encodeReactFlightModel(model: FlightModel, state: ReactFlightEncodingState): unknown {
  if (model === null || typeof model === "number" || typeof model === "boolean") {
    return model;
  }

  if (typeof model === "string") {
    return model.startsWith("$") ? `$${model}` : model;
  }

  if (Array.isArray(model)) {
    return model.map((item) => encodeReactFlightModel(item, state));
  }

  if (model.kind === "undefined") {
    return "$u";
  }

  if (model.kind === "date") {
    return `$D${model.value}`;
  }

  if (model.kind === "bigint") {
    return `$n${model.value}`;
  }

  if (model.kind === "number") {
    if (model.value === "Infinity") {
      return "$I";
    }

    if (model.value === "NaN") {
      return "$N";
    }

    return `$${model.value}`;
  }

  if (model.kind === "symbol") {
    return `$S${model.name}`;
  }

  if (model.kind === "map") {
    const id = allocateReactFlightOutlineRow(
      state,
      model.entries.map(([key, value]) => [
        encodeReactFlightModel(key, state),
        encodeReactFlightModel(value, state),
      ]),
    );
    return `$Q${formatReactFlightId(id)}`;
  }

  if (model.kind === "set") {
    const id = allocateReactFlightOutlineRow(
      state,
      model.values.map((value) => encodeReactFlightModel(value, state)),
    );
    return `$W${formatReactFlightId(id)}`;
  }

  if (model.kind === "form-data") {
    const id = allocateReactFlightOutlineRow(
      state,
      model.entries.map(([key, value]) => [key, encodeReactFlightModel(value, state)]),
    );
    return `$K${formatReactFlightId(id)}`;
  }

  if (model.kind === "iterable") {
    const id = allocateReactFlightOutlineRow(
      state,
      model.values.map((value) => encodeReactFlightModel(value, state)),
    );
    return `$i${formatReactFlightId(id)}`;
  }

  if (model.kind === "error") {
    const id = state.nextWireId;
    state.nextWireId += 1;
    state.outlineRows.push(
      `${formatReactFlightId(id)}:E${JSON.stringify(encodeReactFlightError(model))}`,
    );
    return `$Z${formatReactFlightId(id)}`;
  }

  if (model.kind === "promise") {
    return `$@${formatReactFlightId(model.id)}`;
  }

  if (model.kind === "server-reference") {
    return `$F${state.serverWireIds.get(model.id) ?? model.id}`;
  }

  if (model.kind === "client-reference") {
    return `$L${state.clientWireIds.get(model.id) ?? model.id}`;
  }

  if (model.kind === "element") {
    return [
      "$",
      encodeReactFlightElementType(model.type, state.clientWireIds),
      model.key,
      encodeReactFlightProps(model.props, state),
    ];
  }

  if (isReactFlightBinaryModel(model)) {
    return model;
  }

  return encodeReactFlightProps(model, state);
}

function allocateReactFlightOutlineRow(state: ReactFlightEncodingState, payload: unknown): number {
  const id = state.nextWireId;
  state.nextWireId += 1;
  state.outlineRows.push(`${formatReactFlightId(id)}:${JSON.stringify(payload)}`);
  return id;
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
  state: ReactFlightEncodingState,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(props)
      .filter((entry): entry is [string, FlightModel] => entry[1] !== undefined)
      .map(([key, value]) => [key, encodeReactFlightModel(value, state)]),
  );
}

interface ReactFlightRow {
  id: number;
  tag?: string;
  payload: string;
}

type ReactFlightBinaryRowTag =
  | "A"
  | "O"
  | "o"
  | "U"
  | "S"
  | "s"
  | "L"
  | "l"
  | "G"
  | "g"
  | "M"
  | "m"
  | "V";

function parseReactFlightRow(line: string): ReactFlightRow {
  const separator = line.indexOf(":");

  if (separator < 0) {
    throw new Error("Invalid React Flight row.");
  }

  const id = separator === 0 ? 0 : parseReactFlightId(line.slice(0, separator));
  const body = line.slice(separator + 1);
  const first = body[0];
  const hasTag = first !== undefined && isReactFlightRowTag(first, body);

  if (first !== undefined && !hasTag && looksLikeUnsupportedReactFlightTag(first, body)) {
    throw new Error(`Unsupported React Flight row tag: ${first}`);
  }

  return {
    id,
    ...(hasTag ? { tag: first } : {}),
    payload: hasTag ? body.slice(1) : body,
  };
}

function looksLikeUnsupportedReactFlightTag(tag: string, body: string): boolean {
  return /^[A-Z]$/.test(tag) && (body[1] === "{" || body[1] === "[" || body[1] === '"');
}

function parseReactFlightTextChunk(payload: string): string {
  const separator = payload.indexOf(",");

  if (separator < 0) {
    throw new Error("Invalid React Flight text row.");
  }

  return payload.slice(separator + 1);
}

function parseReactFlightBinaryChunk(
  tag: ReactFlightBinaryRowTag,
  payload: string,
): FlightArrayBufferModel | FlightTypedArrayModel | FlightDataViewModel {
  const separator = payload.indexOf(",");

  if (separator < 0) {
    throw new Error("Invalid React Flight binary row.");
  }

  const byteLength = parseReactFlightId(payload.slice(0, separator));
  const bytes = decodeBase64Bytes(payload.slice(separator + 1));

  if (bytes.length !== byteLength) {
    throw new Error("React Flight binary row length did not match declared payload length.");
  }

  return createReactFlightBinaryModel(tag, bytes);
}

function isReactFlightMetadataTag(tag: string | undefined): boolean {
  return (
    tag === "H" ||
    tag === "N" ||
    tag === "P" ||
    tag === "D" ||
    tag === "J" ||
    tag === "W" ||
    tag === "R" ||
    tag === "r" ||
    tag === "X" ||
    tag === "x" ||
    tag === "C"
  );
}

function isReactFlightRowTag(tag: string, body: string): boolean {
  if (
    tag === "I" ||
    tag === "F" ||
    tag === "E" ||
    tag === "T" ||
    tag === "H" ||
    tag === "N" ||
    tag === "P" ||
    tag === "D" ||
    tag === "J" ||
    tag === "W" ||
    tag === "R" ||
    tag === "r" ||
    tag === "X" ||
    tag === "x" ||
    tag === "C"
  ) {
    return true;
  }

  return isReactFlightBinaryRowTag(tag) && /^[AOoUSsLlGgMmV][0-9a-f]+,/i.test(body);
}

function isReactFlightBinaryRowTag(tag: string | undefined): tag is ReactFlightBinaryRowTag {
  return (
    tag === "A" ||
    tag === "O" ||
    tag === "o" ||
    tag === "U" ||
    tag === "S" ||
    tag === "s" ||
    tag === "L" ||
    tag === "l" ||
    tag === "G" ||
    tag === "g" ||
    tag === "M" ||
    tag === "m" ||
    tag === "V"
  );
}

function createReactFlightBinaryModel(
  tag: ReactFlightBinaryRowTag,
  bytes: Uint8Array,
): FlightArrayBufferModel | FlightTypedArrayModel | FlightDataViewModel {
  const byteValues = Array.from(bytes);

  if (tag === "A") {
    return {
      kind: "array-buffer",
      bytes: byteValues,
    };
  }

  if (tag === "V") {
    return {
      kind: "data-view",
      bytes: byteValues,
    };
  }

  return {
    kind: "typed-array",
    arrayType: getReactFlightTypedArrayName(tag),
    bytes: byteValues,
  };
}

function getReactFlightTypedArrayName(
  tag: Exclude<ReactFlightBinaryRowTag, "A" | "V">,
): FlightTypedArrayName {
  switch (tag) {
    case "O":
      return "Int8Array";
    case "o":
      return "Uint8Array";
    case "U":
      return "Uint8ClampedArray";
    case "S":
      return "Int16Array";
    case "s":
      return "Uint16Array";
    case "L":
      return "Int32Array";
    case "l":
      return "Uint32Array";
    case "G":
      return "Float32Array";
    case "g":
      return "Float64Array";
    case "M":
      return "BigInt64Array";
    case "m":
      return "BigUint64Array";
    default:
      throw new Error(`Unsupported React Flight typed array row tag: ${tag}`);
  }
}

function decodeBase64Bytes(value: string): Uint8Array {
  // Issue 081: route through the native binding when available. The
  // native implementation accepts both URL-safe and standard alphabets
  // and tolerates missing padding, matching the JS fallback below.
  const native = getNativeFlight()?.decodeFlightBase64;

  if (native !== undefined) {
    const result = native(value);
    // napi-rs returns a Buffer which is a Uint8Array subclass; the
    // callsite types it as Uint8Array so this is structurally fine.
    return result instanceof Uint8Array ? result : new Uint8Array(result);
  }

  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = globalThis.atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
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

function parseReactFlightServerReference(
  id: number,
  payload: string,
  modelChunks: ReadonlyMap<number, unknown> = new Map(),
  errorChunks: ReadonlyMap<number, FlightErrorModel> = new Map(),
): FlightServerReference {
  const value = JSON.parse(payload) as unknown;
  const object = valueIsObject(value) ? value : {};
  const actionId = String(object.id ?? "");
  const separator = actionId.lastIndexOf("#");
  const bound = Array.isArray(object.bound)
    ? object.bound.map((entry) => decodeReactFlightModel(entry, modelChunks, errorChunks))
    : undefined;

  return {
    id,
    moduleId: separator < 0 ? actionId : actionId.slice(0, separator),
    exportName:
      typeof object.name === "string"
        ? object.name
        : separator < 0
          ? "default"
          : actionId.slice(separator + 1),
    ...(bound === undefined ? {} : { bound }),
  };
}

// Issue 079: hard cap on Flight tree depth to prevent stack-exhaustion
// DoS from a deeply-nested payload. The cap is far higher than any
// legitimate component tree.
const MAX_FLIGHT_DECODE_DEPTH = 256;

class FlightDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlightDecodeError";
  }
}

function flightTooDeep(): never {
  throw new FlightDecodeError(
    `MR_FLIGHT_TOO_DEEP: nested deeper than ${MAX_FLIGHT_DECODE_DEPTH} levels`,
  );
}

function flightCycle(id: number): never {
  throw new FlightDecodeError(`MR_FLIGHT_CYCLE: cyclic chunk reference ${id}`);
}

interface FlightDecodeContext {
  inProgressChunkIds: Set<number>;
}

function createFlightDecodeContext(): FlightDecodeContext {
  return {
    inProgressChunkIds: new Set(),
  };
}

function decodeReactFlightModel(
  value: unknown,
  modelChunks: ReadonlyMap<number, unknown> = new Map(),
  errorChunks: ReadonlyMap<number, FlightErrorModel> = new Map(),
  depth = 0,
  context: FlightDecodeContext = createFlightDecodeContext(),
): FlightModel {
  if (depth > MAX_FLIGHT_DECODE_DEPTH) flightTooDeep();
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return decodeReactFlightString(value, modelChunks, errorChunks, depth, context);
  }

  if (Array.isArray(value)) {
    if (value[0] === "$") {
      return {
        kind: "element",
        type: decodeReactFlightElementType(value[1]),
        key: typeof value[2] === "string" ? value[2] : null,
        props: decodeReactFlightProps(
          valueIsObject(value[3]) ? value[3] : {},
          modelChunks,
          errorChunks,
          depth + 1,
          context,
        ),
      };
    }

    return value.map((item) =>
      decodeReactFlightModel(item, modelChunks, errorChunks, depth + 1, context),
    );
  }

  if (isReactFlightBinaryModel(value)) {
    return value;
  }

  if (valueIsObject(value)) {
    return decodeReactFlightProps(value, modelChunks, errorChunks, depth + 1, context);
  }

  return { kind: "undefined" };
}

function decodeReactFlightString(
  value: string,
  modelChunks: ReadonlyMap<number, unknown>,
  errorChunks: ReadonlyMap<number, FlightErrorModel>,
  depth: number,
  context: FlightDecodeContext,
): FlightModel {
  if (value === "$undefined" || value === "$u") {
    return { kind: "undefined" };
  }

  if (value.startsWith("$$")) {
    return value.slice(1);
  }

  if (value === "$I") {
    return { kind: "number", value: "Infinity" };
  }

  if (value === "$-Infinity") {
    return { kind: "number", value: "-Infinity" };
  }

  if (value === "$-0") {
    return { kind: "number", value: "-0" };
  }

  if (value === "$N") {
    return { kind: "number", value: "NaN" };
  }

  if (value.startsWith("$D")) {
    return { kind: "date", value: value.slice(2) };
  }

  if (value.startsWith("$n")) {
    return { kind: "bigint", value: value.slice(2) };
  }

  if (/^\$[AOoUSsLlGgMmV][0-9a-f]+$/.test(value)) {
    return decodeReactFlightChunk(value.slice(2), modelChunks, errorChunks, depth + 1, context);
  }

  if (value.startsWith("$S")) {
    return { kind: "symbol", name: value.slice(2) };
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

  if (/^\$@[0-9a-f]*$/i.test(value)) {
    return {
      kind: "promise",
      id: value.length === 2 ? 0 : parseReactFlightId(value.slice(2)),
    };
  }

  if (/^\$Q[0-9a-f]+$/i.test(value)) {
    const decoded = decodeReactFlightChunk(
      value.slice(2),
      modelChunks,
      errorChunks,
      depth + 1,
      context,
    );
    const entries = Array.isArray(decoded)
      ? decoded.map((entry): [FlightModel, FlightModel] =>
          Array.isArray(entry)
            ? [entry[0] ?? { kind: "undefined" }, entry[1] ?? { kind: "undefined" }]
            : [entry, { kind: "undefined" }],
        )
      : [];

    return {
      kind: "map",
      entries,
    };
  }

  if (/^\$W[0-9a-f]+$/i.test(value)) {
    const decoded = decodeReactFlightChunk(
      value.slice(2),
      modelChunks,
      errorChunks,
      depth + 1,
      context,
    );

    return {
      kind: "set",
      values: Array.isArray(decoded) ? decoded : [],
    };
  }

  if (/^\$K[0-9a-f]+$/i.test(value)) {
    const decoded = decodeReactFlightChunk(
      value.slice(2),
      modelChunks,
      errorChunks,
      depth + 1,
      context,
    );
    const entries = Array.isArray(decoded)
      ? decoded.flatMap((entry): [string, FlightModel][] =>
          Array.isArray(entry) && typeof entry[0] === "string"
            ? [[entry[0], entry[1] ?? { kind: "undefined" }]]
            : [],
        )
      : [];

    return {
      kind: "form-data",
      entries,
    };
  }

  if (/^\$i[0-9a-f]+$/i.test(value)) {
    const decoded = decodeReactFlightChunk(
      value.slice(2),
      modelChunks,
      errorChunks,
      depth + 1,
      context,
    );

    return {
      kind: "iterable",
      values: Array.isArray(decoded) ? decoded : [],
    };
  }

  if (/^\$Z[0-9a-f]+$/i.test(value)) {
    return (
      errorChunks.get(parseReactFlightId(value.slice(2))) ?? {
        kind: "error",
        name: "Error",
        message: "Unknown React Flight error.",
      }
    );
  }

  if (value === "$Y" || value.startsWith("$E")) {
    return { kind: "undefined" };
  }

  if (/^\$[0-9a-f]+$/i.test(value)) {
    return decodeReactFlightChunk(value.slice(1), modelChunks, errorChunks, depth + 1, context);
  }

  return value;
}

function decodeReactFlightChunk(
  id: string,
  modelChunks: ReadonlyMap<number, unknown>,
  errorChunks: ReadonlyMap<number, FlightErrorModel>,
  depth: number,
  context: FlightDecodeContext,
): FlightModel {
  if (depth > MAX_FLIGHT_DECODE_DEPTH) flightTooDeep();
  const numericId = parseReactFlightId(id);
  const error = errorChunks.get(numericId);

  if (error !== undefined) {
    return error;
  }

  if (!modelChunks.has(numericId)) {
    return {
      kind: "promise",
      id: numericId,
    };
  }

  if (context.inProgressChunkIds.has(numericId)) {
    flightCycle(numericId);
  }

  context.inProgressChunkIds.add(numericId);
  try {
    return decodeReactFlightModel(
      modelChunks.get(numericId),
      modelChunks,
      errorChunks,
      depth,
      context,
    );
  } finally {
    context.inProgressChunkIds.delete(numericId);
  }
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

function decodeReactFlightProps(
  value: Record<string, unknown>,
  modelChunks: ReadonlyMap<number, unknown>,
  errorChunks: ReadonlyMap<number, FlightErrorModel>,
  depth = 0,
  context: FlightDecodeContext = createFlightDecodeContext(),
): Record<string, FlightModel> {
  if (depth > MAX_FLIGHT_DECODE_DEPTH) flightTooDeep();
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      decodeReactFlightModel(child, modelChunks, errorChunks, depth + 1, context),
    ]),
  );
}

function isReactFlightBinaryModel(
  value: unknown,
): value is FlightArrayBufferModel | FlightTypedArrayModel | FlightDataViewModel {
  return (
    valueIsObject(value) &&
    (value.kind === "array-buffer" || value.kind === "typed-array" || value.kind === "data-view")
  );
}

function parseReactFlightError(payload: string): FlightErrorModel {
  const value = JSON.parse(payload) as unknown;
  const object = valueIsObject(value) ? value : {};
  const digest = typeof object.digest === "string" ? object.digest : undefined;

  return {
    kind: "error",
    name: typeof object.name === "string" ? object.name : "Error",
    message: typeof object.message === "string" ? object.message : "React Flight error.",
    ...(digest === undefined ? {} : { digest }),
  };
}

function encodeReactFlightError(model: FlightErrorModel): Record<string, unknown> {
  return {
    digest: model.digest ?? "",
    name: model.name,
    message: model.message,
    stack: [],
    env: "Server",
  };
}

function isFlightErrorModel(model: FlightModel): model is FlightErrorModel {
  return (
    typeof model === "object" && model !== null && !Array.isArray(model) && model.kind === "error"
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

type FlightSerializationResult<T extends FlightModel = FlightModel> = T | Promise<T>;

function serializeFlightValue(
  value: unknown,
  state: FlightSerializationState,
  depth: number,
): FlightSerializationResult {
  if (depth > MAX_FLIGHT_DECODE_DEPTH) flightTooDeep();

  if (isThenable(value)) {
    return Promise.resolve(value).then((awaited) => serializeFlightValue(awaited, state, depth));
  }

  if (value === null) {
    return null;
  }

  if (value === undefined) {
    return { kind: "undefined" };
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (Number.isNaN(value)) {
      return { kind: "number", value: "NaN" };
    }

    if (value === Infinity) {
      return { kind: "number", value: "Infinity" };
    }

    if (value === -Infinity) {
      return { kind: "number", value: "-Infinity" };
    }

    if (Object.is(value, -0)) {
      return { kind: "number", value: "-0" };
    }

    return value;
  }

  if (typeof value === "bigint") {
    return { kind: "bigint", value: value.toString() };
  }

  if (typeof value === "symbol") {
    return { kind: "symbol", name: Symbol.keyFor(value) ?? value.description ?? "" };
  }

  if (Array.isArray(value)) {
    return resolveFlightArray(value.map((item) => serializeFlightValue(item, state, depth + 1)));
  }

  if (isServerReference(value)) {
    const id = getServerReferenceId(value, state);
    return resolveFlightResult(id, (resolvedId) => ({
      kind: "server-reference",
      id: resolvedId,
    }));
  }

  if (isReactCompatElement(value)) {
    return serializeElement(value, state, depth + 1);
  }

  if (value instanceof Date) {
    return { kind: "date", value: value.toJSON() };
  }

  if (value instanceof Map) {
    const entries = resolveFlightArray(
      Array.from(value.entries()).map(([key, entryValue]) =>
        resolveFlightTuple(
          serializeFlightValue(key, state, depth + 1),
          serializeFlightValue(entryValue, state, depth + 1),
        ),
      ),
    );
    return resolveFlightResult(entries, (resolvedEntries) => ({
      kind: "map",
      entries: resolvedEntries,
    }));
  }

  if (value instanceof Set) {
    const values = resolveFlightArray(
      Array.from(value.values()).map((entryValue) =>
        serializeFlightValue(entryValue, state, depth + 1),
      ),
    );
    return resolveFlightResult(values, (resolvedValues) => ({
      kind: "set",
      values: resolvedValues,
    }));
  }

  if (isFormDataLike(value)) {
    const entries = resolveFlightArray(
      Array.from(value.entries()).map(([key, entryValue]) =>
        resolveFlightResult(serializeFlightValue(entryValue, state, depth + 1), (resolvedValue) => [
          key,
          resolvedValue,
        ] as [string, FlightModel]),
      ),
    );
    return resolveFlightResult(entries, (resolvedEntries) => ({
      kind: "form-data",
      entries: resolvedEntries,
    }));
  }

  if (isIterableObject(value)) {
    const values = resolveFlightArray(
      Array.from(value).map((entryValue) => serializeFlightValue(entryValue, state, depth + 1)),
    );
    return resolveFlightResult(values, (resolvedValues) => ({
      kind: "iterable",
      values: resolvedValues,
    }));
  }

  if (value instanceof Error) {
    return {
      kind: "error",
      name: value.name,
      message: value.message,
    };
  }

  if (typeof value === "object") {
    return serializeObject(value as Record<string, unknown>, state, depth + 1);
  }

  throw new TypeError(`Unsupported Flight value: ${typeof value}`);
}

function serializeElement(
  element: ReactCompatElementLike,
  state: FlightSerializationState,
  depth: number,
): FlightSerializationResult<FlightElementModel | FlightModel> {
  if (typeof element.type === "function") {
    return serializeFlightValue(element.type(element.props), state, depth + 1);
  }

  if (isClientReference(element.type)) {
    const elementType = element.type;
    const props = serializeProps(element.props, state, depth + 1);
    return resolveFlightResult(props, (resolvedProps) => ({
      kind: "element",
      type: {
        kind: "client-reference",
        id: getClientReferenceId(elementType, state),
      },
      key: element.key,
      props: resolvedProps,
    }));
  }

  if (typeof element.type === "string") {
    const elementType = element.type;
    const props = serializeProps(element.props, state, depth + 1);
    return resolveFlightResult(props, (resolvedProps) => ({
      kind: "element",
      type: elementType,
      key: element.key,
      props: resolvedProps,
    }));
  }

  if (element.type === REACT_COMPAT_FRAGMENT_TYPE) {
    const props = serializeProps(element.props, state, depth + 1);
    return resolveFlightResult(props, (resolvedProps) => ({
      kind: "element",
      type: { kind: "fragment" },
      key: element.key,
      props: resolvedProps,
    }));
  }

  throw new TypeError("Unsupported Flight element type.");
}

function serializeProps(
  props: Record<string, unknown>,
  state: FlightSerializationState,
  depth: number,
): FlightSerializationResult<Record<string, FlightModel>> {
  const entries = resolveFlightArray(
    Object.entries(props).map(([key, value]) =>
      resolveFlightResult(serializeFlightValue(value, state, depth + 1), (resolvedValue) => [
        key,
        resolvedValue,
      ]),
    ),
  );

  return resolveFlightResult(entries, (resolvedEntries) => Object.fromEntries(resolvedEntries));
}

function serializeObject(
  object: Record<string, unknown>,
  state: FlightSerializationState,
  depth: number,
): FlightSerializationResult<FlightObjectModel> {
  const entries = resolveFlightArray(
    Object.entries(object).map(([key, value]) =>
      resolveFlightResult(
        serializeFlightValue(value, state, depth + 1),
        (resolvedValue) => [key, resolvedValue] as const,
      ),
    ),
  );

  return resolveFlightResult(
    entries,
    (resolvedEntries) => Object.fromEntries(resolvedEntries) as FlightObjectModel,
  );
}

function getClientReferenceId(reference: ClientReference, state: FlightSerializationState): number {
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
): number | Promise<number> {
  const serializedBound =
    reference.bound === undefined
      ? undefined
      : resolveFlightArray(reference.bound.map((value) => serializeFlightValue(value, state, 0)));
  return resolveFlightResult(serializedBound, (resolvedBound) =>
    getServerReferenceIdForBound(reference, state, resolvedBound),
  );
}

function getServerReferenceIdForBound(
  reference: ServerReference,
  state: FlightSerializationState,
  serializedBound: FlightModel[] | undefined,
): number {
  const key = `${reference.moduleId}:${reference.exportName}:${JSON.stringify(serializedBound ?? null)}`;
  const existing = state.serverReferenceIndexes.get(key);

  if (existing !== undefined) {
    return existing;
  }

  const id = state.serverReferences.length;
  state.serverReferences.push({
    id,
    moduleId: reference.moduleId,
    exportName: reference.exportName,
    ...(serializedBound === undefined ? {} : { bound: serializedBound }),
  });
  state.serverReferenceIndexes.set(key, id);
  return id;
}

function resolveFlightArray<T>(values: Array<T | Promise<T>>): T[] | Promise<T[]> {
  return values.some(isThenable) ? Promise.all(values) : (values as T[]);
}

function resolveFlightTuple<TLeft, TRight>(
  left: TLeft | Promise<TLeft>,
  right: TRight | Promise<TRight>,
): [TLeft, TRight] | Promise<[TLeft, TRight]> {
  return isThenable(left) || isThenable(right) ? Promise.all([left, right]) : [left, right];
}

function resolveFlightResult<T, TResult>(
  value: T | Promise<T>,
  map: (value: T) => TResult,
): TResult | Promise<TResult> {
  return isThenable(value) ? value.then(map) : map(value);
}

function isReactCompatElement(value: unknown): value is ReactCompatElementLike {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === REACT_COMPAT_ELEMENT_TYPE
  );
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function isFormDataLike(value: unknown): value is FormData {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function isIterableObject(value: unknown): value is Iterable<unknown> {
  return typeof value === "object" && value !== null && Symbol.iterator in value;
}

function serverActionKey(moduleId: string, exportName: string): string {
  return `${moduleId}#${exportName}`;
}

async function readServerActionPayload(
  request: Request,
  maxBodyBytes: number,
): Promise<
  | {
      moduleId?: unknown;
      exportName?: unknown;
      bound?: unknown;
      args?: unknown;
    }
  | Response
> {
  // Issue 076: bound the body before JSON.parse. The Content-Length
  // header (when present) is the cheap pre-check; the streaming reader
  // catches chunked / missing-length bodies too.
  const declaredLength = Number(request.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    return jsonResponse({ ok: false, error: "Payload too large." }, 413);
  }

  const body = request.body;
  let text = "";
  if (body !== null) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBodyBytes) {
          await reader.cancel();
          return jsonResponse({ ok: false, error: "Payload too large." }, 413);
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      reader.releaseLock?.();
    }
  } else {
    text = await request.text();
  }

  try {
    return JSON.parse(text) as {
      moduleId?: unknown;
      exportName?: unknown;
      bound?: unknown;
      args?: unknown;
    };
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON payload." }, 400);
  }
}

function validateServerActionJsonArgumentStructure(
  boundArgs: readonly unknown[],
  args: readonly unknown[],
): { valid: true } | { valid: false } {
  const stack: { depth: number; value: unknown }[] = [
    { depth: 0, value: boundArgs },
    { depth: 0, value: args },
  ];
  const seen = new WeakSet<object>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      continue;
    }

    if (current.depth > MAX_SERVER_ACTION_ARGUMENT_DEPTH) {
      return { valid: false };
    }

    if (current.value === null || typeof current.value !== "object") {
      continue;
    }

    if (seen.has(current.value)) {
      continue;
    }
    seen.add(current.value);

    if (Array.isArray(current.value)) {
      if (current.value.length > MAX_SERVER_ACTION_ARGUMENT_ARRAY_LENGTH) {
        return { valid: false };
      }

      for (const item of current.value) {
        stack.push({ depth: current.depth + 1, value: item });
      }
      continue;
    }

    const entries = Object.entries(current.value);
    if (entries.length > MAX_SERVER_ACTION_ARGUMENT_OBJECT_KEYS) {
      return { valid: false };
    }

    for (const [key, value] of entries) {
      if (SERVER_ACTION_FORBIDDEN_JSON_KEYS.has(key)) {
        return { valid: false };
      }
      stack.push({ depth: current.depth + 1, value });
    }
  }

  return { valid: true };
}

function getServerAction(entry: ServerAction | ServerActionDescriptor): ServerAction {
  return typeof entry === "function" ? entry : entry.action;
}

function isAllowedServerAction(
  reference: ServerActionRequestReference,
  allowedActionSet: ReadonlySet<string> | undefined,
): boolean {
  if (allowedActionSet === undefined) {
    return true;
  }

  return allowedActionSet.has(serverActionKey(reference.moduleId, reference.exportName));
}

function getServerActionArgsValidator(
  entry: ServerAction | ServerActionDescriptor,
): ServerActionDescriptor["validateArgs"] {
  return typeof entry === "function" ? undefined : entry.validateArgs;
}

function runWithFlightCacheScope<T>(callback: () => T): T {
  const scope = createCacheScope();
  scope.ownerStack.push("renderToFlightResponse");
  return runWithCacheScope(scope, callback);
}

function validateRequestOrigin(
  request: Request,
  allowedOrigins: ServerActionHandlerOptions["allowedOrigins"],
): Response | undefined {
  // Issue 076: secure default. `"any"` disables the check (explicit
  // opt-out for embedders behind their own auth boundary). Otherwise we
  // enforce same-origin by default and extend with the array if given.
  if (allowedOrigins === "any") return undefined;

  const origin = request.headers.get("origin");
  // Browsers omit `Origin` on same-origin GETs but include it on
  // cross-site POSTs. Missing Origin therefore signals same-origin
  // (or non-browser traffic) and is allowed.
  if (origin === null) return undefined;

  let expected: string | undefined;
  try {
    expected = new URL(request.url).origin;
  } catch {
    expected = undefined;
  }

  if (expected !== undefined && origin === expected) return undefined;
  if (allowedOrigins !== undefined && allowedOrigins.includes(origin)) {
    return undefined;
  }
  return jsonResponse({ ok: false, error: "Origin not allowed." }, 403);
}

function validateCsrfToken(
  request: Request,
  csrf: ServerActionHandlerOptions["csrf"],
): Response | undefined {
  // Issue 076: CSRF check is on by default. `false` disables it
  // (documented opt-out); `true` / object override the names.
  if (csrf === false) return undefined;

  const config = typeof csrf === "object" ? csrf : {};
  const headerName = config.headerName ?? "x-mreact-csrf";
  const cookieName = config.cookieName ?? "mreact.csrf";
  const headerToken = request.headers.get(headerName);
  const cookieToken = readCookie(request.headers.get("cookie"), cookieName);

  return headerToken !== null &&
    cookieToken !== undefined &&
    constantTimeStringEqual(headerToken, cookieToken)
    ? undefined
    : jsonResponse({ ok: false, error: "Invalid CSRF token." }, 403);
}

function constantTimeStringEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return diff === 0;
}

function validateServerActionNonce(
  request: Request,
  replayProtection: ServerActionHandlerOptions["replayProtection"],
): { response?: Response; commit?: () => void } {
  if (replayProtection === undefined) {
    return {};
  }

  const headerName = replayProtection.headerName ?? "x-mreact-action-nonce";
  const nonce = request.headers.get(headerName);

  if (nonce === null || nonce.length === 0) {
    return {
      response: jsonResponse({ ok: false, error: "Missing server action nonce." }, 400),
    };
  }

  if (replayProtection.seen.has(nonce)) {
    return {
      response: jsonResponse({ ok: false, error: "Server action nonce was already used." }, 409),
    };
  }

  // Issue 076: defer the .add() until the action succeeds so a failed
  // run does not consume a replay slot. The caller invokes `commit()`
  // on the success path only.
  return {
    commit: () => replayProtection.seen.add(nonce),
  };
}

function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (cookieHeader === null) {
    return undefined;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");

    if (rawKey === name) {
      const raw = rawValue.join("=");
      if (raw.indexOf("%") === -1) {
        return raw;
      }

      // Issue 076 / 072: malformed `%`-escapes raise URIError; treat
      // the cookie as absent so a bogus cookie cannot abort the handler.
      try {
        return decodeURIComponent(raw);
      } catch {
        return undefined;
      }
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
