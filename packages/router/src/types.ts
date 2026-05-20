import type { ReactCompatNode } from "@reckona/mreact-compat";
import type { QueryClient } from "@reckona/mreact-query";

export type InferLoaderData<TLoader extends (...args: never[]) => unknown> = Awaited<
  ReturnType<TLoader>
>;

export type RouteParams = Record<string, string>;

export interface LoaderContext<TParams extends RouteParams = RouteParams> {
  params: TParams;
  queryClient: QueryClient;
  request: Request;
}

export interface RouteHandlerContext<TParams extends RouteParams = RouteParams> {
  params: TParams;
  request: Request;
}

export interface PageProps<TData = unknown, TParams extends RouteParams = RouteParams> {
  data: TData;
  params: TParams;
  request: Request;
}

export interface LayoutProps<TParams extends RouteParams = RouteParams> {
  children: ReactCompatNode;
  params: TParams;
  request: Request;
}

export type MReactNode = ReactCompatNode;
