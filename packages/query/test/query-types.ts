import {
  createQuery,
  createQueryClient,
  queryDefinition,
  type QueryDefinitionData,
  type QueryEntry,
  type QueryResult,
} from "../src/index.js";

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false;
type Assert<Value extends true> = Value;
type SuccessfulData = Extract<QueryResult<number>, { status: "success" }>["data"];
type ErrorData = Extract<QueryResult<number>, { status: "error" }>["data"];
type _SuccessfulDataIsNarrowed = Assert<Equal<SuccessfulData, number>>;
type _ErrorDataRetainsPreviousValue = Assert<Equal<ErrorData, number | undefined>>;
type UndefinedSuccessfulData = Extract<QueryResult<undefined>, { status: "success" }>["data"];
type _UndefinedDataRemainsUndefined = Assert<Equal<UndefinedSuccessfulData, undefined>>;

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

const readonlyKey: readonly ["settings", number] = ["settings", 1];
const settingsDefinition = queryDefinition(readonlyKey, ({ queryKey }) => ({ id: queryKey[1] }));
const settings: QueryDefinitionData<typeof settingsDefinition> | undefined =
  client.getQueryData(settingsDefinition);
const settingsId: number | undefined = settings?.id;
void settingsId;
client.setQueryData(settingsDefinition, { id: 2 });

const maybeDefinition = queryDefinition(
  ["maybe"] as const,
  (): { value: string } | undefined => undefined,
);
const maybe: QueryDefinitionData<typeof maybeDefinition> | undefined =
  client.getQueryData(maybeDefinition);
const maybeEntry: QueryEntry<QueryDefinitionData<typeof maybeDefinition>> | undefined =
  client.getQueryEntry(maybeDefinition);
void maybe;
void maybeEntry;
client.setQueryData(maybeDefinition, undefined);
const maybeObserver = createQuery(client, maybeDefinition, { autoFetch: false });
maybeObserver.dispose();

// @ts-expect-error A definition-bound read cannot override its inferred data type.
client.getQueryData<number>(profileDefinition);
// @ts-expect-error Definition-bound writes must use the definition's inferred data type.
client.setQueryData(profileDefinition, { id: "wrong", name: "invalid" });
