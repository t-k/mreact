import type { ReactCompatNode } from "@reckona/mreact-compat";
import type { QueryClient } from "@reckona/mreact-query";

/**
 * Represents an app-router loader function.
 */
export type RouteLoader = (...args: never[]) => unknown;

/**
 * Infers resolved data returned by a route loader.
 */
export type InferLoaderData<TLoader extends RouteLoader> = Awaited<ReturnType<TLoader>>;

/**
 * Represents dynamic route params passed to loaders, pages, and handlers.
 */
export type RouteParams = Record<string, readonly string[] | string>;

/**
 * Infers route params from a loader context parameter.
 */
export type InferLoaderParams<TLoader extends RouteLoader> = TLoader extends (
  context: infer TContext,
  ...args: never[]
) => unknown
  ? TContext extends { params: infer TParams }
    ? TParams extends RouteParams
      ? TParams
      : RouteParams
    : RouteParams
  : RouteParams;

/**
 * Provides request, params, environment, and query client data to route loaders.
 */
export interface LoaderContext<TParams extends RouteParams = RouteParams> {
  env?: unknown;
  params: TParams;
  queryClient: QueryClient;
  request: Request;
}

/**
 * Context passed to a route `generateMetadata` export.
 *
 * Metadata is evaluated on the server after loader data is available, so it can derive head tags, robots data, sitemap entries, and security header directives from the same request and route params as the page.
 */
export interface GenerateMetadataContext<
  TData = unknown,
  TParams extends RouteParams = RouteParams,
> {
  data: TData;
  params: TParams;
  request: Request;
}

/**
 * Provides request and params to server route handlers.
 */
export interface RouteHandlerContext<TParams extends RouteParams = RouteParams> {
  params: TParams;
  request: Request;
}

/**
 * Serializable location data passed to shared page and layout components.
 *
 * Server-only request data such as headers, body, credentials, and abort
 * signals is available through loader and handler contexts instead.
 */
export interface RouteLocation {
  readonly hash: string;
  readonly pathname: string;
  readonly search: string;
  readonly url: string;
}

/**
 * Provides loader data, params, and request context to page components.
 */
export interface PageProps<TData = unknown, TParams extends RouteParams = RouteParams> {
  data: TData;
  params: TParams;
  request: RouteLocation;
}

/**
 * Represents a page component whose props are inferred from a route loader.
 */
export type PageComponent<TLoader extends RouteLoader> = (
  props: PageProps<InferLoaderData<TLoader>, InferLoaderParams<TLoader>>,
) => ReactCompatNode;

/**
 * Preserves the relationship between a page component and its loader when authoring route files.
 *
 * Wrap a default page export with `definePage<typeof loader>(...)` to infer `data` and `params` props from the route loader without changing runtime behavior.
 */
export function definePage<TLoader extends RouteLoader>(
  component: PageComponent<TLoader>,
): PageComponent<TLoader> {
  return component;
}

/**
 * Provides children, params, and request context to layout components.
 */
export interface LayoutProps<TParams extends RouteParams = RouteParams> {
  children: ReactCompatNode;
  params: TParams;
  request: RouteLocation;
}

/**
 * Re-exports the node type accepted by mreact-compatible components.
 */
export type MReactNode = ReactCompatNode;

/**
 * Represents scalar metadata values rendered into head tags and headers.
 */
export type MetadataScalar = boolean | number | string;

/**
 * Describes an image value used by route metadata.
 */
export interface MetadataImage {
  alt?: MetadataScalar;
  height?: MetadataScalar;
  type?: MetadataScalar;
  url: MetadataScalar;
  width?: MetadataScalar;
}

/**
 * Declarative metadata returned by route metadata exports.
 *
 * Values are rendered into the document head and response headers by the app router; use `generateMetadata` when the values depend on loader data, params, or the current request.
 */
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

/**
 * Describes viewport metadata key-value pairs.
 */
export type MetadataViewport = Record<string, MetadataScalar | null | undefined>;

/**
 * Describes a theme-color metadata entry with an optional media query.
 */
export interface MetadataThemeColor {
  color?: MetadataScalar;
  media?: MetadataScalar;
}

/**
 * Describes an extra head element emitted by route metadata.
 */
export interface RouteHeadDescriptor {
  attrs?: Record<string, boolean | number | string | undefined>;
  content?: string;
  nonce?: boolean | string;
  tag: "base" | "link" | "meta" | "script" | "style";
}

/**
 * Configures security-related response headers from route metadata.
 */
export interface RouteSecurityHeaders {
  contentTypeOptions?: "nosniff" | null | undefined;
  frameOptions?: "DENY" | "SAMEORIGIN" | null | undefined;
  hsts?: RouteStrictTransportSecurity | false | null | undefined;
  permissionsPolicy?: Record<string, readonly string[] | null | undefined> | null | undefined;
  referrerPolicy?: string | null | undefined;
}

/**
 * Configures the Strict-Transport-Security header from route metadata.
 */
export interface RouteStrictTransportSecurity {
  includeSubDomains?: boolean | undefined;
  maxAge: number;
  preload?: boolean | undefined;
}

/**
 * Provides request context to a robots metadata route.
 */
export interface RobotsContext {
  baseUrl: string;
  host: string;
  request: Request;
}

/**
 * Describes the robots.txt metadata route result.
 */
export interface RobotsManifest {
  host?: string | undefined;
  rules?: RobotsRule | readonly RobotsRule[] | undefined;
  sitemap?: string | readonly string[] | undefined;
}

/**
 * Describes one robots.txt user-agent rule.
 */
export interface RobotsRule {
  allow?: string | readonly string[] | undefined;
  disallow?: string | readonly string[] | undefined;
  userAgent: string | readonly string[];
}

/**
 * Provides request context to a sitemap metadata route.
 */
export interface SitemapContext {
  baseUrl: string;
  host: string;
  request: Request;
}

/**
 * Describes one URL entry returned by a sitemap metadata route.
 */
export interface SitemapEntry {
  changeFrequency?: string | undefined;
  lastModified?: Date | string | number | undefined;
  priority?: number | undefined;
  url: string;
}

/**
 * Provides request context to a web app manifest metadata route.
 */
export interface ManifestContext {
  baseUrl: string;
  host: string;
  request: Request;
}

/**
 * Represents an arbitrary web app manifest descriptor.
 */
export type ManifestDescriptor = Record<string, unknown>;
