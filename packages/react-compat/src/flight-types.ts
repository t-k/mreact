/** Client module reference carried by a Flight response. */
export interface FlightClientReference {
  id: number;
  moduleId: string;
  exportName: string;
  chunks?: string[];
}

/** Server action reference carried by a Flight response. */
export interface FlightServerReference {
  id: number;
  moduleId: string;
  exportName: string;
  bound?: FlightModel[];
}

/** Parsed React Flight response with root model and reference tables. */
export interface FlightResponse {
  version: 1;
  root: FlightModel;
  clientReferences: FlightClientReference[];
  serverReferences: FlightServerReference[];
  /** Models referenced more than once, indexed by object-reference ids. */
  objectReferences?: FlightModel[];
}

/** Serializable model value supported by the mreact Flight decoder. */
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
  | FlightObjectReferenceModel
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

/** Flight model record for a rendered element. */
export interface FlightElementModel {
  kind: "element";
  type: string | FlightClientReferenceModel | { kind: "fragment" };
  key: string | null;
  props: Record<string, FlightModel>;
}

/** Flight model record that points at a client reference table entry. */
export interface FlightClientReferenceModel {
  kind: "client-reference";
  id: number;
}

/** Flight model record that points at a server reference table entry. */
export interface FlightServerReferenceModel {
  kind: "server-reference";
  id: number;
}

/** Flight model record that points at a shared object table entry. */
export interface FlightObjectReferenceModel {
  kind: "object-reference";
  id: number;
}

/** Flight model record for a Date value. */
export interface FlightDateModel {
  kind: "date";
  value: string;
}

/** Flight model record for a bigint value. */
export interface FlightBigIntModel {
  kind: "bigint";
  value: string;
}

/** Flight model record for non-finite or negative-zero numbers. */
export interface FlightNumberModel {
  kind: "number";
  value: "Infinity" | "-Infinity" | "NaN" | "-0";
}

/** Flight model record for a global symbol. */
export interface FlightSymbolModel {
  kind: "symbol";
  name: string;
}

/** Flight model record for a Map value. */
export interface FlightMapModel {
  kind: "map";
  entries: [FlightModel, FlightModel][];
}

/** Flight model record for a Set value. */
export interface FlightSetModel {
  kind: "set";
  values: FlightModel[];
}

/** Flight model record for a FormData value. */
export interface FlightFormDataModel {
  kind: "form-data";
  entries: [string, FlightModel][];
}

/** Flight model record for an iterable value encoded as an array. */
export interface FlightIterableModel {
  kind: "iterable";
  values: FlightModel[];
}

/** Flight model record for an error thrown while decoding. */
export interface FlightErrorModel {
  kind: "error";
  name: string;
  message: string;
  digest?: string;
}

/** Flight model record for a pending promise chunk. */
export interface FlightPromiseModel {
  kind: "promise";
  id: number;
}

/** Flight model record for an ArrayBuffer value. */
export interface FlightArrayBufferModel {
  kind: "array-buffer";
  bytes: number[];
}

/** Flight model record for a typed array value. */
export interface FlightTypedArrayModel {
  kind: "typed-array";
  arrayType: FlightTypedArrayName;
  bytes: number[];
}

/** Flight model record for a DataView value. */
export interface FlightDataViewModel {
  kind: "data-view";
  bytes: number[];
}

/** Typed array constructor names supported by the Flight decoder. */
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
