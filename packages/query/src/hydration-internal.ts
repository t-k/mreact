import type { QueryKey } from "./index.js";

export const hydrateQueryDataSymbol: unique symbol = Symbol.for(
  "@reckona/mreact-query/hydrateQueryData",
);

export interface HydrateQueryDataOptions {
  queryHash: string;
  updatedAt: number;
}

export interface HydratableQueryClient {
  [hydrateQueryDataSymbol]<TData>(
    queryKey: QueryKey,
    data: TData,
    options: HydrateQueryDataOptions,
  ): void;
}
