import { createQuery, createQueryClient, queryDefinition, type QueryResult } from "../src/index.js";

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

const client = createQueryClient();
const profileDefinition = queryDefinition(["profile", 1] as const, ({ queryKey }) => ({
  id: queryKey[1],
  name: "Ada",
}));

const profile = client.getQueryData(profileDefinition);
const profileId: number | undefined = profile?.id;
void profileId;
client.setQueryData(profileDefinition, { id: 1, name: "Grace" });
client.setQueryData(profileDefinition, (previous) => ({
  id: previous?.id ?? 1,
  name: "Lin",
}));
void client.fetchQuery(profileDefinition);
void client.prefetchQuery(profileDefinition);
createQuery(client, profileDefinition, { autoFetch: false });

// @ts-expect-error A definition-bound read cannot override its inferred data type.
client.getQueryData<number>(profileDefinition);
// @ts-expect-error Definition-bound writes must use the definition's inferred data type.
client.setQueryData(profileDefinition, { id: "wrong", name: "invalid" });
