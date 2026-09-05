import type { QueryResult } from "../src/index.js";

type Equal<Left, Right> = (<T>() => T extends Left ? 1 : 2) extends <T>() =>
  T extends Right ? 1 : 2
  ? true
  : false;
type Assert<Value extends true> = Value;
type SuccessfulData = Extract<QueryResult<number>, { status: "success" }>["data"];
type ErrorData = Extract<QueryResult<number>, { status: "error" }>["data"];
type _SuccessfulDataIsNarrowed = Assert<Equal<SuccessfulData, number>>;
type _ErrorDataRetainsPreviousValue = Assert<Equal<ErrorData, number | undefined>>;

export function readSuccessfulQueryData(result: QueryResult<number>): number | undefined {
  if (result.status === "success") {
    const value: number = result.data;
    return value;
  }

  return undefined;
}

export function readErrorQueryData(result: QueryResult<number>): number | undefined {
  if (result.status === "error") {
    return result.data;
  }

  return undefined;
}
