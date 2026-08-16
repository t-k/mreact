export interface NativeMatch {
  index: number;
  params: Record<string, string>;
  catchAllParams: Record<string, string[]>;
}

export class NativeRouteMatcher {
  constructor(routesJson: string);
  matchRoute(pathname: string): NativeMatch | null;
}

export function escapeHtmlBatch(values: string[]): string[];
export function escapeAttributeBatch(values: string[]): string[];
export function decodeFlightBase64(value: string): Uint8Array;
export function decodeFlightRows(rows: string): string;
export function encodeFlightResponse(responseJson: string): string;
export function encodeFlightPayload(responseJson: string): Uint8Array;
export function mergeFlightRows(baseRows: string, patchRows: string): string;
