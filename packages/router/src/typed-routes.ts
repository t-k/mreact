/**
 * Represents a value accepted in generated route search params.
 */
export type RouteSearchValue = boolean | number | string | null | undefined;
/**
 * Represents search params accepted by typed route href helpers.
 */
export type RouteSearchParams = Record<
  string,
  RouteSearchValue | readonly RouteSearchValue[]
>;

/**
 * Extracts dynamic and catch-all params from an app route path pattern.
 */
export type RouteParamsFor<Path extends `/${string}`> = Simplify<ExtractRouteParams<Path>>;

/**
 * Builds the callable `href()` helper type for a specific app route path.
 */
export type AppRouteHref<Path extends `/${string}`> = keyof RouteParamsFor<Path> extends never
  ? (options?: StaticHrefOptions) => string
  : (options: DynamicHrefOptions<Path>) => string;

/**
 * Builds the Link `href` string type accepted for a specific app route path.
 */
export type AppRouteLinkHref<Path extends `/${string}`> =
  `${AppRouteLinkPathname<Path>}${AppRouteLinkHrefSuffix}`;

/**
 * Configures a static href with optional search params and hash.
 */
export interface StaticHrefOptions {
  hash?: string | undefined;
  search?: RouteSearchParams | undefined;
}

/**
 * Configures a dynamic href with route params, optional search params, and hash.
 */
export interface DynamicHrefOptions<Path extends `/${string}`> extends StaticHrefOptions {
  params: RouteParamsFor<Path>;
}

export type HasRouteParams<Path extends `/${string}`> = keyof RouteParamsFor<Path> extends never
  ? false
  : true;

export type ExtractRouteParams<Path extends string> = Path extends `${infer Segment}/${infer Rest}`
  ? SegmentRouteParam<Segment> & ExtractRouteParams<Rest>
  : SegmentRouteParam<Path>;

export type SegmentRouteParam<Segment extends string> = Segment extends `:...${infer Name}`
  ? { [Key in Name]: readonly string[] }
  : Segment extends `:${infer Name}`
    ? { [Key in Name]: string }
    : Record<never, never>;

export type Simplify<T> = { [Key in keyof T]: T[Key] } & {};

/**
 * Represents the search and hash suffix portion of a typed route href.
 */
export type AppRouteLinkHrefSuffix = "" | `?${string}` | `#${string}` | `?${string}#${string}`;

/**
 * Builds the pathname string type for a typed route href.
 */
export type AppRouteLinkPathname<Path extends `/${string}`> = Path extends "/"
  ? "/"
  : Path extends `/${infer Segments}`
    ? `/${AppRouteLinkSegments<Segments>}`
    : never;

/**
 * Builds the joined path segment string type for a typed route href.
 */
export type AppRouteLinkSegments<Segments extends string> = Segments extends `${infer Segment}/${infer Rest}`
  ? `${AppRouteLinkSegment<Segment>}/${AppRouteLinkSegments<Rest>}`
  : AppRouteLinkSegment<Segments>;

/**
 * Builds the string type for one static or dynamic route segment.
 */
export type AppRouteLinkSegment<Segment extends string> = Segment extends `:${string}`
  ? string
  : Segment;

/**
 * Builds an internal app-route URL from a route pattern and typed params/search options.
 *
 * Dynamic `:param` and `:...catchAll` segments are URL-encoded, search values are serialized with `URLSearchParams`, and protocol-relative or external paths are rejected.
 */
export function href<const Path extends `/${string}`>(
  path: Path,
  ...args: HasRouteParams<Path> extends true
    ? [options: DynamicHrefOptions<Path>]
    : [options?: StaticHrefOptions]
): string {
  assertInternalRoutePath(path);

  const options = args[0] as
    | (StaticHrefOptions & { params?: Record<string, readonly string[] | string> | undefined })
    | undefined;
  const params =
    options !== undefined && "params" in options && options.params !== undefined
      ? (options.params as Record<string, readonly string[] | string>)
      : {};
  const pathname = path
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":...")) {
        const name = segment.slice(4);
        const value = params[name];

        if (!Array.isArray(value)) {
          throw new Error(`Missing catch-all route param ${JSON.stringify(name)} for ${path}.`);
        }

        return value.map((part) => encodeURIComponent(part)).join("/");
      }

      if (segment.startsWith(":")) {
        const name = segment.slice(1);
        const value = params[name];

        if (typeof value !== "string") {
          throw new Error(`Missing route param ${JSON.stringify(name)} for ${path}.`);
        }

        return encodeURIComponent(value);
      }

      return segment;
    })
    .join("/");
  const search = searchString(options?.search);
  const hash = options?.hash === undefined ? "" : `#${encodeURIComponent(options.hash)}`;

  return `${pathname}${search}${hash}`;
}

function assertInternalRoutePath(path: string): void {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error(`href() expected an internal route path, received ${JSON.stringify(path)}.`);
  }

  for (let index = 0; index < path.length; index += 1) {
    const code = path.charCodeAt(index);

    if (code <= 0x1f || code === 0x7f) {
      throw new Error("href() route paths must not contain control characters.");
    }
  }
}

function searchString(search: RouteSearchParams | undefined): string {
  if (search === undefined) {
    return "";
  }

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(search)) {
    const values = Array.isArray(value) ? value : [value];

    for (const entry of values) {
      if (entry !== undefined && entry !== null) {
        params.append(key, String(entry));
      }
    }
  }

  const value = params.toString();

  return value === "" ? "" : `?${value}`;
}
