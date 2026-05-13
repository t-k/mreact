import { createElement, Fragment } from "./element.js";
import type { ElementType, ReactCompatNode } from "./element.js";
import { hydrateRoot, type HydrateRootOptions } from "./render.js";

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
  bound?: FlightModel[];
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

export interface FlightDateModel {
  kind: "date";
  value: string;
}

export interface FlightBigIntModel {
  kind: "bigint";
  value: string;
}

export interface FlightNumberModel {
  kind: "number";
  value: "Infinity" | "-Infinity" | "NaN" | "-0";
}

export interface FlightSymbolModel {
  kind: "symbol";
  name: string;
}

export interface FlightMapModel {
  kind: "map";
  entries: [FlightModel, FlightModel][];
}

export interface FlightSetModel {
  kind: "set";
  values: FlightModel[];
}

export interface FlightFormDataModel {
  kind: "form-data";
  entries: [string, FlightModel][];
}

export interface FlightIterableModel {
  kind: "iterable";
  values: FlightModel[];
}

export interface FlightErrorModel {
  kind: "error";
  name: string;
  message: string;
  digest?: string;
}

export interface FlightPromiseModel {
  kind: "promise";
  id: number;
}

export interface FlightArrayBufferModel {
  kind: "array-buffer";
  bytes: number[];
}

export interface FlightTypedArrayModel {
  kind: "typed-array";
  arrayType: FlightTypedArrayName;
  bytes: number[];
}

export interface FlightDataViewModel {
  kind: "data-view";
  bytes: number[];
}

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

const reactFlightBinaryRowTags = ["A", "O", "o", "U", "S", "s", "L", "l", "G", "g", "M", "m", "V"] as const;
const reactFlightRowTags = ["C", "D", "E", "F", "H", "I", "J", "N", "P", "R", "T", "W", "X", "x", "r"] as const;
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

export interface ReactFlightProtocolCoverage {
  binaryRowTags: string[];
  modelTokens: string[];
  rowTags: string[];
}

export function getReactFlightProtocolCoverage(): ReactFlightProtocolCoverage {
  return {
    binaryRowTags: [...reactFlightBinaryRowTags],
    modelTokens: [...reactFlightModelTokens],
    rowTags: [...reactFlightRowTags],
  };
}

export interface DecodeFlightOptions {
  loadClientReference(reference: FlightClientReference): ElementType<Record<string, unknown>>;
  callServerReference?(
    reference: FlightServerReference,
    args: unknown[],
  ): unknown | Promise<unknown>;
}

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
  if (typeof payload !== "string") {
    return parseReactFlightBinaryRows(payload);
  }

  const trimmed = payload.trim();

  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as FlightResponse;
  }

  return parseReactFlightRows(trimmed);
}

export function decodeFlightResponse(
  response: FlightResponse,
  options: DecodeFlightOptions,
): ReactCompatNode {
  return decodeModel(response.root, response, options) as ReactCompatNode;
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

interface ReactFlightRow {
  id: number;
  tag?: string;
  payload: string;
  payloadBytes?: Uint8Array;
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

function parseReactFlightRows(rows: string): FlightResponse {
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

  return parseReactFlightRowObjects(lines.map((line) => parseReactFlightRow(line)));
}

function parseReactFlightBinaryRows(payload: ArrayBuffer | Uint8Array): FlightResponse {
  const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  const decoder = new TextDecoder();
  const rows: ReactFlightRow[] = [];
  let index = 0;

  while (index < bytes.length) {
    index = skipReactFlightRowBreak(bytes, index);

    if (index >= bytes.length) {
      break;
    }

    const idStart = index;
    while (index < bytes.length && bytes[index] !== 58) {
      index += 1;
    }

    if (index >= bytes.length) {
      throw new Error("Invalid React Flight binary row.");
    }

    const idText = decoder.decode(bytes.subarray(idStart, index));
    const id = idText === "" ? 0 : parseReactFlightId(idText);
    index += 1;

    if (index >= bytes.length) {
      throw new Error("Invalid React Flight binary row.");
    }

    const tag = String.fromCharCode(bytes[index] ?? 0);

    if (isReactFlightBinaryRowTag(tag)) {
      index += 1;
      const lengthStart = index;

      while (index < bytes.length && bytes[index] !== 44) {
        index += 1;
      }

      if (index >= bytes.length) {
        throw new Error("Invalid React Flight binary row.");
      }

      const byteLength = parseReactFlightId(decoder.decode(bytes.subarray(lengthStart, index)));
      index += 1;

      if (index + byteLength > bytes.length) {
        throw new Error("React Flight binary row ended before declared payload length.");
      }

      rows.push({
        id,
        tag,
        payload: `${byteLength.toString(16)},`,
        payloadBytes: bytes.slice(index, index + byteLength),
      });
      index += byteLength;
      index = skipReactFlightRowBreak(bytes, index);
      continue;
    }

    const bodyStart = index;
    while (index < bytes.length && bytes[index] !== 10 && bytes[index] !== 13) {
      index += 1;
    }

    rows.push(parseReactFlightRow(`${idText}:${decoder.decode(bytes.subarray(bodyStart, index))}`));
    index = skipReactFlightRowBreak(bytes, index);
  }

  return parseReactFlightRowObjects(rows);
}

function parseReactFlightRowObjects(rows: ReactFlightRow[]): FlightResponse {
  const clientReferences: FlightClientReference[] = [];
  const serverReferences: FlightServerReference[] = [];
  const modelChunks = new Map<number, unknown>();
  const errorChunks = new Map<number, FlightErrorModel>();
  let root: FlightModel | undefined;

  for (const row of rows) {
    if (row.tag === "I") {
      clientReferences.push(parseReactFlightClientReference(row.id, row.payload));
      continue;
    }

    if (row.tag === "F") {
      serverReferences.push(parseReactFlightServerReference(row.id, row.payload, modelChunks, errorChunks));
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
      modelChunks.set(row.id, parseReactFlightBinaryChunk(row.tag, row.payload, row.payloadBytes));
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

function skipReactFlightRowBreak(bytes: Uint8Array, index: number): number {
  let next = index;

  while (next < bytes.length && (bytes[next] === 10 || bytes[next] === 13)) {
    next += 1;
  }

  return next;
}

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
  return /^[A-Z]$/.test(tag) && (body[1] === "{" || body[1] === "[" || body[1] === "\"");
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
  payloadBytes?: Uint8Array,
): FlightArrayBufferModel | FlightTypedArrayModel | FlightDataViewModel {
  if (payloadBytes !== undefined) {
    return createReactFlightBinaryModel(tag, payloadBytes);
  }

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

function getReactFlightTypedArrayName(tag: Exclude<ReactFlightBinaryRowTag, "A" | "V">): FlightTypedArrayName {
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

function decodeReactFlightModel(
  value: unknown,
  modelChunks: ReadonlyMap<number, unknown> = new Map(),
  errorChunks: ReadonlyMap<number, FlightErrorModel> = new Map(),
): FlightModel {
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return decodeReactFlightString(value, modelChunks, errorChunks);
  }

  if (Array.isArray(value)) {
    if (value[0] === "$") {
      return {
        kind: "element",
        type: decodeReactFlightElementType(value[1]),
        key: typeof value[2] === "string" ? value[2] : null,
        props: decodeReactFlightProps(valueIsObject(value[3]) ? value[3] : {}, modelChunks, errorChunks),
      };
    }

    return value.map((item) => decodeReactFlightModel(item, modelChunks, errorChunks));
  }

  if (isReactFlightBinaryModel(value)) {
    return value;
  }

  if (valueIsObject(value)) {
    return decodeReactFlightProps(value, modelChunks, errorChunks);
  }

  return { kind: "undefined" };
}

function decodeReactFlightString(
  value: string,
  modelChunks: ReadonlyMap<number, unknown>,
  errorChunks: ReadonlyMap<number, FlightErrorModel>,
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

  if (/^\$[AOoUSsLlGgMmV][0-9a-f]+$/.test(value)) {
    return decodeReactFlightChunk(value.slice(2), modelChunks, errorChunks);
  }

  if (value.startsWith("$S")) {
    return { kind: "symbol", name: value.slice(2) };
  }

  if (/^\$@[0-9a-f]*$/i.test(value)) {
    return {
      kind: "promise",
      id: value.length === 2 ? 0 : parseReactFlightId(value.slice(2)),
    };
  }

  if (/^\$Q[0-9a-f]+$/i.test(value)) {
    const decoded = decodeReactFlightChunk(value.slice(2), modelChunks, errorChunks);
    const entries = Array.isArray(decoded)
      ? decoded.map((entry): [FlightModel, FlightModel] =>
          Array.isArray(entry) ? [entry[0] ?? { kind: "undefined" }, entry[1] ?? { kind: "undefined" }] : [entry, { kind: "undefined" }],
        )
      : [];

    return {
      kind: "map",
      entries,
    };
  }

  if (/^\$W[0-9a-f]+$/i.test(value)) {
    const decoded = decodeReactFlightChunk(value.slice(2), modelChunks, errorChunks);

    return {
      kind: "set",
      values: Array.isArray(decoded) ? decoded : [],
    };
  }

  if (/^\$K[0-9a-f]+$/i.test(value)) {
    const decoded = decodeReactFlightChunk(value.slice(2), modelChunks, errorChunks);
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
    const decoded = decodeReactFlightChunk(value.slice(2), modelChunks, errorChunks);

    return {
      kind: "iterable",
      values: Array.isArray(decoded) ? decoded : [],
    };
  }

  if (/^\$Z[0-9a-f]+$/i.test(value)) {
    return errorChunks.get(parseReactFlightId(value.slice(2))) ?? {
      kind: "error",
      name: "Error",
      message: "Unknown React Flight error.",
    };
  }

  if (value === "$Y" || value.startsWith("$E")) {
    return { kind: "undefined" };
  }

  if (/^\$[0-9a-f]+$/i.test(value)) {
    return decodeReactFlightChunk(value.slice(1), modelChunks, errorChunks);
  }

  return value;
}

function decodeReactFlightChunk(
  id: string,
  modelChunks: ReadonlyMap<number, unknown>,
  errorChunks: ReadonlyMap<number, FlightErrorModel>,
): FlightModel {
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

  return decodeReactFlightModel(modelChunks.get(numericId), modelChunks, errorChunks);
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
): Record<string, FlightModel> {
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      decodeReactFlightModel(child, modelChunks, errorChunks),
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

function valueIsObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseReactFlightId(value: string): number {
  return Number.parseInt(value, 16);
}

// Issue 079: cap recursion depth so a deeply-nested Flight payload
// cannot stack-overflow the client decoder.
const MAX_FLIGHT_DECODE_DEPTH = 256;

class FlightDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlightDecodeError";
  }
}

function decodeModel(
  model: FlightModel,
  response: FlightResponse,
  options: DecodeFlightOptions,
  depth = 0,
): unknown {
  if (depth > MAX_FLIGHT_DECODE_DEPTH) {
    throw new FlightDecodeError(
      `MR_FLIGHT_TOO_DEEP: nested deeper than ${MAX_FLIGHT_DECODE_DEPTH} levels`,
    );
  }
  if (
    model === null ||
    typeof model === "string" ||
    typeof model === "number" ||
    typeof model === "boolean"
  ) {
    return model;
  }

  if (Array.isArray(model)) {
    return model.map((item) => decodeModel(item, response, options, depth + 1));
  }

  if (model.kind === "undefined") {
    return undefined;
  }

  if (model.kind === "date") {
    return new Date(model.value);
  }

  if (model.kind === "bigint") {
    return BigInt(model.value);
  }

  if (model.kind === "number") {
    switch (model.value) {
      case "Infinity":
        return Infinity;
      case "-Infinity":
        return -Infinity;
      case "-0":
        return -0;
      case "NaN":
        return Number.NaN;
    }
  }

  if (model.kind === "symbol") {
    return Symbol.for(model.name);
  }

  if (model.kind === "map") {
    return new Map(
      model.entries.map(([key, value]) => [
        decodeModel(key, response, options, depth + 1),
        decodeModel(value, response, options, depth + 1),
      ]),
    );
  }

  if (model.kind === "set") {
    return new Set(
      model.values.map((value) => decodeModel(value, response, options, depth + 1)),
    );
  }

  if (model.kind === "form-data") {
    const formData = new FormData();

    for (const [name, value] of model.entries) {
      const decoded = decodeModel(value, response, options, depth + 1);
      formData.append(name, decoded instanceof Blob ? decoded : String(decoded ?? ""));
    }

    return formData;
  }

  if (model.kind === "iterable") {
    return model.values.map((value) => decodeModel(value, response, options, depth + 1));
  }

  if (model.kind === "array-buffer") {
    return createArrayBuffer(model.bytes);
  }

  if (model.kind === "typed-array") {
    return createTypedArray(model.arrayType, model.bytes);
  }

  if (model.kind === "data-view") {
    return new DataView(createArrayBuffer(model.bytes));
  }

  if (model.kind === "error") {
    const error = new Error(model.message);
    error.name = model.name;
    if (model.digest !== undefined) {
      (error as Error & { digest?: string }).digest = model.digest;
    }
    throw error;
  }

  if (model.kind === "promise") {
    throw new Error(`React Flight chunk ${model.id} is still pending.`);
  }

  if (model.kind === "element") {
    const type = decodeElementType(model.type, response, options);
    const props = decodeProps(model.props, response, options, depth + 1);

    return createElement(type, { ...props, key: model.key });
  }

  if (model.kind === "server-reference") {
    return createServerReferenceStub(model.id, response, options) as unknown as ReactCompatNode;
  }

  throw new Error(`Unexpected Flight model kind: ${model.kind}`);
}

function createArrayBuffer(bytes: number[]): ArrayBuffer {
  const array = Uint8Array.from(bytes);

  return array.buffer.slice(array.byteOffset, array.byteOffset + array.byteLength);
}

function createTypedArray(arrayType: FlightTypedArrayName, bytes: number[]): unknown {
  const buffer = createArrayBuffer(bytes);

  switch (arrayType) {
    case "Int8Array":
      return new Int8Array(buffer);
    case "Uint8Array":
      return new Uint8Array(buffer);
    case "Uint8ClampedArray":
      return new Uint8ClampedArray(buffer);
    case "Int16Array":
      return new Int16Array(buffer);
    case "Uint16Array":
      return new Uint16Array(buffer);
    case "Int32Array":
      return new Int32Array(buffer);
    case "Uint32Array":
      return new Uint32Array(buffer);
    case "Float32Array":
      return new Float32Array(buffer);
    case "Float64Array":
      return new Float64Array(buffer);
    case "BigInt64Array":
      return new BigInt64Array(buffer);
    case "BigUint64Array":
      return new BigUint64Array(buffer);
  }
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
  depth = 0,
): Record<string, unknown> {
  if (depth > MAX_FLIGHT_DECODE_DEPTH) {
    throw new FlightDecodeError(
      `MR_FLIGHT_TOO_DEEP: nested deeper than ${MAX_FLIGHT_DECODE_DEPTH} levels`,
    );
  }
  return Object.fromEntries(
    Object.entries(props).map(([key, value]) => [
      key,
      valueIsServerReference(value)
        ? createServerReferenceStub(value.id, response, options)
        : decodeModel(value, response, options, depth + 1),
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

    const boundArgs = reference.bound?.map((value) => decodeModel(value, response, options)) ?? [];

    return options.callServerReference(reference, [...boundArgs, ...args]);
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

function cssEscape(value: string): string {
  return globalThis.CSS?.escape?.(value) ?? value.replaceAll('"', '\\"');
}
