import type { ElementType } from "./element.js";
import {
  createFlightServerReferenceStub,
  decodeFlightElementModel,
} from "./flight-element-builder.js";
import type {
  FlightClientReference,
  FlightModel,
  FlightResponse,
  FlightServerReference,
  FlightTypedArrayName,
} from "./flight-types.js";

export interface DecodeFlightOptions {
  loadClientReference(reference: FlightClientReference): ElementType<Record<string, unknown>>;
  callServerReference?(
    reference: FlightServerReference,
    args: unknown[],
  ): unknown | Promise<unknown>;
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

export function decodeFlightModel(
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
    return model.map((item) => decodeFlightModel(item, response, options, depth + 1));
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
        decodeFlightModel(key, response, options, depth + 1),
        decodeFlightModel(value, response, options, depth + 1),
      ]),
    );
  }

  if (model.kind === "set") {
    return new Set(
      model.values.map((value) => decodeFlightModel(value, response, options, depth + 1)),
    );
  }

  if (model.kind === "form-data") {
    const formData = new FormData();

    for (const [name, value] of model.entries) {
      const decoded = decodeFlightModel(value, response, options, depth + 1);
      formData.append(name, decoded instanceof Blob ? decoded : String(decoded ?? ""));
    }

    return formData;
  }

  if (model.kind === "iterable") {
    return model.values.map((value) => decodeFlightModel(value, response, options, depth + 1));
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
    return decodeFlightElementModel(
      model,
      response,
      options,
      (value, childDepth = 0) => decodeFlightModel(value, response, options, childDepth),
      depth,
      assertFlightDecodeDepth,
    );
  }

  if (model.kind === "server-reference") {
    return createFlightServerReferenceStub(
      model.id,
      response,
      options,
      (value, childDepth = 0) => decodeFlightModel(value, response, options, childDepth),
    );
  }

  throw new Error(`Unexpected Flight model kind: ${model.kind}`);
}

function assertFlightDecodeDepth(depth: number): void {
  if (depth > MAX_FLIGHT_DECODE_DEPTH) {
    throw new FlightDecodeError(
      `MR_FLIGHT_TOO_DEEP: nested deeper than ${MAX_FLIGHT_DECODE_DEPTH} levels`,
    );
  }
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
