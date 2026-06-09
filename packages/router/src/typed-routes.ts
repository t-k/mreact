export type RouteSearchValue = boolean | number | string | null | undefined;
export type RouteSearchParams = Record<
  string,
  RouteSearchValue | readonly RouteSearchValue[]
>;

export type RouteParamsFor<Path extends `/${string}`> = Simplify<ExtractRouteParams<Path>>;

export type AppRouteHref<Path extends `/${string}`> = keyof RouteParamsFor<Path> extends never
  ? (options?: StaticHrefOptions) => string
  : (options: DynamicHrefOptions<Path>) => string;

export type AppRouteLinkHref<Path extends `/${string}`> =
  `${AppRouteLinkPathname<Path>}${AppRouteLinkHrefSuffix}`;

export interface StaticHrefOptions {
  hash?: string | undefined;
  search?: RouteSearchParams | undefined;
}

export interface DynamicHrefOptions<Path extends `/${string}`> extends StaticHrefOptions {
  params: RouteParamsFor<Path>;
}

type HasRouteParams<Path extends `/${string}`> = keyof RouteParamsFor<Path> extends never
  ? false
  : true;

type ExtractRouteParams<Path extends string> = Path extends `${infer Segment}/${infer Rest}`
  ? SegmentRouteParam<Segment> & ExtractRouteParams<Rest>
  : SegmentRouteParam<Path>;

type SegmentRouteParam<Segment extends string> = Segment extends `:...${infer Name}`
  ? { [Key in Name]: readonly string[] }
  : Segment extends `:${infer Name}`
    ? { [Key in Name]: string }
    : Record<never, never>;

type Simplify<T> = { [Key in keyof T]: T[Key] } & {};

export type AppRouteLinkHrefSuffix = "" | `?${string}` | `#${string}` | `?${string}#${string}`;

export type AppRouteLinkPathname<Path extends `/${string}`> = Path extends "/"
  ? "/"
  : Path extends `/${infer Segments}`
    ? `/${AppRouteLinkSegments<Segments>}`
    : never;

export type AppRouteLinkSegments<Segments extends string> = Segments extends `${infer Segment}/${infer Rest}`
  ? `${AppRouteLinkSegment<Segment>}/${AppRouteLinkSegments<Rest>}`
  : AppRouteLinkSegment<Segments>;

export type AppRouteLinkSegment<Segment extends string> = Segment extends `:${string}`
  ? string
  : Segment;

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
