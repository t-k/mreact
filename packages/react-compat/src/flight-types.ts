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
