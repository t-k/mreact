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

/** Options used when resolving client and server references while decoding Flight models. */
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

interface FlightDecodeContext {
  decodedModels: WeakMap<object, unknown>;
  activeReferenceIds: Set<number>;
  completedReferences: Map<number, unknown>;
}

function createFlightDecodeContext(): FlightDecodeContext {
  return {
    decodedModels: new WeakMap(),
    activeReferenceIds: new Set(),
    completedReferences: new Map(),
  };
}

export function decodeFlightModel(
  model: FlightModel,
  response: FlightResponse,
  options: DecodeFlightOptions,
  depth = 0,
  context: FlightDecodeContext = createFlightDecodeContext(),
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

  if (context.decodedModels.has(model)) {
    return context.decodedModels.get(model);
  }

  const finish = <T>(value: T): T => {
    context.decodedModels.set(model, value);
    return value;
  };

  if (Array.isArray(model)) {
    const decoded: unknown[] = [];
    context.decodedModels.set(model, decoded);
    decoded.push(
      ...model.map((item) => decodeFlightModel(item, response, options, depth + 1, context)),
    );
    return decoded;
  }

  if (model.kind === "undefined") {
    return undefined;
  }

  if (model.kind === "date") {
    return finish(new Date(model.value));
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
    return finish(
      new Map(
        model.entries.map(([key, value]) => [
          decodeFlightModel(key, response, options, depth + 1, context),
          decodeFlightModel(value, response, options, depth + 1, context),
        ]),
      ),
    );
  }

  if (model.kind === "set") {
    return finish(
      new Set(
        model.values.map((value) =>
          decodeFlightModel(value, response, options, depth + 1, context),
        ),
      ),
    );
  }

  if (model.kind === "form-data") {
    const formData = new FormData();

    for (const [name, value] of model.entries) {
      const decoded = decodeFlightModel(value, response, options, depth + 1, context);
      formData.append(name, decoded instanceof Blob ? decoded : String(decoded ?? ""));
    }

    return finish(formData);
  }

  if (model.kind === "iterable") {
    return finish(
      model.values.map((value) => decodeFlightModel(value, response, options, depth + 1, context)),
    );
  }

  if (model.kind === "array-buffer") {
    return finish(createArrayBuffer(model.bytes));
  }

  if (model.kind === "typed-array") {
    return finish(createTypedArray(model.arrayType, model.bytes));
  }

  if (model.kind === "data-view") {
    return finish(new DataView(createArrayBuffer(model.bytes)));
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
    return finish(
      decodeFlightElementModel(
        model,
        response,
        options,
        (value, childDepth = 0) => decodeFlightModel(value, response, options, childDepth, context),
        depth,
        assertFlightDecodeDepth,
      ),
    );
  }

  if (model.kind === "server-reference") {
    return finish(
      createFlightServerReferenceStub(model.id, response, options, (value, childDepth = 0) =>
        decodeFlightModel(value, response, options, childDepth, context),
      ),
    );
  }

  if (model.kind === "object-reference") {
    if (context.completedReferences.has(model.id)) {
      return context.completedReferences.get(model.id);
    }
    if (context.activeReferenceIds.has(model.id)) {
      throw new FlightDecodeError(`MR_FLIGHT_CYCLE: cyclic object reference ${model.id}`);
    }

    const referencedModel = response.objectReferences?.[model.id];
    if (referencedModel === undefined) {
      throw new FlightDecodeError(`MR_FLIGHT_REFERENCE_MISSING: object reference ${model.id}`);
    }

    context.activeReferenceIds.add(model.id);
    try {
      const decoded = decodeFlightModel(referencedModel, response, options, depth + 1, context);
      context.completedReferences.set(model.id, decoded);
      return decoded;
    } finally {
      context.activeReferenceIds.delete(model.id);
    }
  }

  if (model.kind === undefined) {
    const decoded: Record<string, unknown> = {};
    context.decodedModels.set(model, decoded);
    for (const [key, value] of Object.entries(model)) {
      const decodedValue =
        value === undefined
          ? undefined
          : decodeFlightModel(value, response, options, depth + 1, context);
      if (key === "__proto__") {
        Object.defineProperty(decoded, key, {
          configurable: true,
          enumerable: true,
          value: decodedValue,
          writable: true,
        });
      } else {
        decoded[key] = decodedValue;
      }
    }
    return decoded;
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
