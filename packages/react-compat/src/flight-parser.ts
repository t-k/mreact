import type { ReactFlightBinaryRowTag } from "./flight-protocol.js";
import type {
  FlightArrayBufferModel,
  FlightClientReference,
  FlightDataViewModel,
  FlightElementModel,
  FlightErrorModel,
  FlightFormDataModel,
  FlightMapModel,
  FlightModel,
  FlightResponse,
  FlightServerReference,
  FlightTypedArrayModel,
  FlightTypedArrayName,
} from "./flight-types.js";

interface ReactFlightRow {
  id: number;
  tag?: string;
  payload: string;
  payloadBytes?: Uint8Array;
}

const MAX_FLIGHT_DECODE_DEPTH = 256;

class FlightDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlightDecodeError";
  }
}

interface FlightDecodeContext {
  inProgressChunkIds: Set<number>;
  completedChunkModels: Map<number, FlightModel>;
  completedMapModels: Map<number, FlightMapModel>;
  completedFormDataModels: Map<number, FlightFormDataModel>;
}

function createFlightDecodeContext(): FlightDecodeContext {
  return {
    inProgressChunkIds: new Set(),
    completedChunkModels: new Map(),
    completedMapModels: new Map(),
    completedFormDataModels: new Map(),
  };
}

function flightTooDeep(): never {
  throw new FlightDecodeError(
    `MR_FLIGHT_TOO_DEEP: nested deeper than ${MAX_FLIGHT_DECODE_DEPTH} levels`,
  );
}

function flightCycle(id: number): never {
  throw new FlightDecodeError(`MR_FLIGHT_CYCLE: cyclic chunk reference ${id}`);
}

export function parseReactFlightPayload(
  payload: string | ArrayBuffer | Uint8Array,
): FlightResponse {
  if (typeof payload !== "string") {
    return parseReactFlightBinaryRows(payload);
  }

  const trimmed = payload.trim();

  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as FlightResponse;
  }

  return parseReactFlightRows(trimmed);
}

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
      ...(metadata.objectReferences === undefined
        ? {}
        : { objectReferences: metadata.objectReferences }),
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
  const serverReferenceRows: ReactFlightRow[] = [];
  const modelChunks = new Map<number, unknown>();
  const errorChunks = new Map<number, FlightErrorModel>();
  const decodeContext = createFlightDecodeContext();
  let root: FlightModel | undefined;

  for (const row of rows) {
    if (row.tag === "I") {
      clientReferences.push(parseReactFlightClientReference(row.id, row.payload));
      continue;
    }

    if (row.tag === "F") {
      serverReferenceRows.push(row);
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

  for (const row of serverReferenceRows) {
    serverReferences.push(
      parseReactFlightServerReference(
        row.id,
        row.payload,
        modelChunks,
        errorChunks,
        decodeContext,
      ),
    );
  }

  if (root === undefined && modelChunks.has(0)) {
    root = decodeReactFlightModel(modelChunks.get(0), modelChunks, errorChunks, 0, decodeContext);
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
  context: FlightDecodeContext = createFlightDecodeContext(),
): FlightServerReference {
  const value = JSON.parse(payload) as unknown;
  const object = valueIsObject(value) ? value : {};
  const actionId = String(object.id ?? "");
  const separator = actionId.lastIndexOf("#");
  let bound: FlightModel[] | undefined;
  if (Array.isArray(object.bound)) {
    bound = object.bound.map((entry) =>
      decodeReactFlightModel(entry, modelChunks, errorChunks, 0, context),
    );
  }

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

  if (/^\$F[0-9a-fA-F]+$/.test(value)) {
    return {
      kind: "server-reference",
      id: parseReactFlightId(value.slice(2)),
    };
  }

  if (/^\$L[0-9a-fA-F]+$/.test(value)) {
    return {
      kind: "client-reference",
      id: parseReactFlightId(value.slice(2)),
    };
  }

  if (value.startsWith("$S")) {
    return { kind: "symbol", name: value.slice(2) };
  }

  if (/^\$@[0-9a-fA-F]*$/.test(value)) {
    return {
      kind: "promise",
      id: value.length === 2 ? 0 : parseReactFlightId(value.slice(2)),
    };
  }

  if (/^\$Q[0-9a-fA-F]+$/.test(value)) {
    const id = parseReactFlightId(value.slice(2));
    const completed = context.completedMapModels.get(id);
    if (completed !== undefined) {
      return completed;
    }
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

    const model: FlightMapModel = {
      kind: "map",
      entries,
    };
    context.completedMapModels.set(id, model);
    return model;
  }

  if (/^\$W[0-9a-fA-F]+$/.test(value)) {
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

  if (/^\$K[0-9a-fA-F]+$/.test(value)) {
    const id = parseReactFlightId(value.slice(2));
    const completed = context.completedFormDataModels.get(id);
    if (completed !== undefined) {
      return completed;
    }
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

    const model: FlightFormDataModel = {
      kind: "form-data",
      entries,
    };
    context.completedFormDataModels.set(id, model);
    return model;
  }

  if (/^\$i[0-9a-fA-F]+$/.test(value)) {
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

  if (/^\$Z[0-9a-fA-F]+$/.test(value)) {
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

  const completed = context.completedChunkModels.get(numericId);
  if (completed !== undefined) {
    return completed;
  }

  if (context.inProgressChunkIds.has(numericId)) {
    flightCycle(numericId);
  }

  context.inProgressChunkIds.add(numericId);
  try {
    const decoded = decodeReactFlightModel(
      modelChunks.get(numericId),
      modelChunks,
      errorChunks,
      depth,
      context,
    );
    context.completedChunkModels.set(numericId, decoded);
    return decoded;
  } finally {
    context.inProgressChunkIds.delete(numericId);
  }
}

function decodeReactFlightElementType(value: unknown): FlightElementModel["type"] {
  if (value === "$Sreact.fragment") {
    return { kind: "fragment" };
  }

  if (typeof value === "string" && /^\$L[0-9a-fA-F]+$/.test(value)) {
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

function valueIsObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseReactFlightId(value: string): number {
  return Number.parseInt(value, 16);
}
