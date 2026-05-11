import { createElement, Fragment } from "./element.js";
import type { ElementType, ReactCompatNode } from "./element.js";
import { hydrateRoot } from "./render.js";

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
  csrfHeaderName?: string;
  csrfToken?: string | (() => string);
  nonceHeaderName?: string;
  nonce?: string | (() => string);
}

export function parseFlightResponse(payload: string): FlightResponse {
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
  return decodeModel(response.root, response, options);
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
  options: DecodeFlightOptions,
): ReturnType<typeof import("./render.js").hydrateRoot> {
  return hydrateRoot(container, decodeFlightResponse(response, options));
}

export function createFetchServerReferenceCaller(
  endpoint: string,
  options: FetchServerReferenceCallerOptions = {},
): NonNullable<DecodeFlightOptions["callServerReference"]> {
  const fetchImpl = options.fetch ?? fetch;

  return async (reference, args) => {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: createServerReferenceHeaders(options),
      body: JSON.stringify({
        moduleId: reference.moduleId,
        exportName: reference.exportName,
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

function parseReactFlightId(value: string): number {
  return Number.parseInt(value, 16);
}

function decodeModel(
  model: FlightModel,
  response: FlightResponse,
  options: DecodeFlightOptions,
): ReactCompatNode {
  if (
    model === null ||
    typeof model === "string" ||
    typeof model === "number" ||
    typeof model === "boolean"
  ) {
    return model;
  }

  if (Array.isArray(model)) {
    return model.map((item) => decodeModel(item, response, options));
  }

  if (model.kind === "undefined") {
    return undefined;
  }

  if (model.kind === "element") {
    const type = decodeElementType(model.type, response, options);
    const props = decodeProps(model.props, response, options);

    return createElement(type, { ...props, key: model.key });
  }

  if (model.kind === "server-reference") {
    return createServerReferenceStub(model.id, response, options) as unknown as ReactCompatNode;
  }

  throw new Error(`Unexpected Flight model kind: ${model.kind}`);
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
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(props).map(([key, value]) => [
      key,
      valueIsServerReference(value)
        ? createServerReferenceStub(value.id, response, options)
        : decodeModel(value, response, options),
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

    return options.callServerReference(reference, args);
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
