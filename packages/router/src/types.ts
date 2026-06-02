import type { ReactCompatNode } from "@reckona/mreact-compat";
import type { QueryClient } from "@reckona/mreact-query";

export type InferLoaderData<TLoader extends (...args: never[]) => unknown> = Awaited<
  ReturnType<TLoader>
>;

export type RouteParams = Record<string, readonly string[] | string>;

export interface LoaderContext<TParams extends RouteParams = RouteParams> {
  env?: unknown;
  params: TParams;
  queryClient: QueryClient;
  request: Request;
}

export interface GenerateMetadataContext<
  TData = unknown,
  TParams extends RouteParams = RouteParams,
> {
  data: TData;
  params: TParams;
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

export type MetadataScalar = boolean | number | string;

export interface MetadataImage {
  alt?: MetadataScalar;
  height?: MetadataScalar;
  type?: MetadataScalar;
  url: MetadataScalar;
  width?: MetadataScalar;
}

export interface RouteMetadata {
  alternates?: {
    canonical?: MetadataScalar;
  };
  csp?: {
    disable?: boolean;
    directives?: Record<string, readonly string[] | string>;
    nonce?: string;
    remove?: readonly string[];
    replace?: Record<string, readonly string[] | string>;
  };
  description?: MetadataScalar;
  head?: readonly RouteHeadDescriptor[];
  icons?: {
    apple?: MetadataScalar;
    icon?: MetadataScalar;
  };
  openGraph?: {
    description?: MetadataScalar;
    image?: MetadataImage | MetadataScalar;
    images?: readonly (MetadataImage | MetadataScalar)[];
    title?: MetadataScalar;
  };
  lang?: MetadataScalar;
  robots?:
    | string
    | {
        follow?: boolean;
        index?: boolean;
      };
  security?: RouteSecurityHeaders;
  themeColor?: MetadataScalar | MetadataThemeColor;
  title?: MetadataScalar;
  viewport?: MetadataScalar | MetadataViewport;
}

export type MetadataViewport = Record<string, MetadataScalar | null | undefined>;

export interface MetadataThemeColor {
  color?: MetadataScalar;
  media?: MetadataScalar;
}

export interface RouteHeadDescriptor {
  attrs?: Record<string, boolean | number | string | undefined>;
  content?: string;
  nonce?: boolean | string;
  tag: "base" | "link" | "meta" | "script" | "style";
}

export interface RouteSecurityHeaders {
  contentTypeOptions?: "nosniff" | null | undefined;
  frameOptions?: "DENY" | "SAMEORIGIN" | null | undefined;
  hsts?: RouteStrictTransportSecurity | false | null | undefined;
  permissionsPolicy?: Record<string, readonly string[] | null | undefined> | null | undefined;
  referrerPolicy?: string | null | undefined;
}

export interface RouteStrictTransportSecurity {
  includeSubDomains?: boolean | undefined;
  maxAge: number;
  preload?: boolean | undefined;
}

export interface RobotsContext {
  baseUrl: string;
  host: string;
  request: Request;
}

export interface RobotsManifest {
  host?: string | undefined;
  rules?: RobotsRule | readonly RobotsRule[] | undefined;
  sitemap?: string | readonly string[] | undefined;
}

export interface RobotsRule {
  allow?: string | readonly string[] | undefined;
  disallow?: string | readonly string[] | undefined;
  userAgent: string | readonly string[];
}

export interface SitemapContext {
  baseUrl: string;
  host: string;
  request: Request;
}

export interface SitemapEntry {
  changeFrequency?: string | undefined;
  lastModified?: Date | string | number | undefined;
  priority?: number | undefined;
  url: string;
}

export interface ManifestContext {
  baseUrl: string;
  host: string;
  request: Request;
}

export type ManifestDescriptor = Record<string, unknown>;
