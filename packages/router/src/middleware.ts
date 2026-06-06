import { normalizeRoutePath } from "./route-path.js";

export interface RouteMiddlewareControl {
  skip?: boolean | readonly string[];
}

export interface MiddlewareModule {
  config?: {
    id?: string | undefined;
    matcher?: string | RegExp | readonly string[] | undefined;
  };
  default?: unknown;
  middleware?: unknown;
}

export interface StaticMiddlewareConfig {
  hasMatcher: boolean;
  id?: string | undefined;
  matcher?: string | readonly string[] | undefined;
}

export function shouldSkipMiddleware(
  config: Pick<NonNullable<MiddlewareModule["config"]>, "id"> | undefined,
  control: RouteMiddlewareControl | undefined,
): boolean {
  if (control?.skip === true) {
    return true;
  }

  if (!Array.isArray(control?.skip)) {
    return false;
  }

  return typeof config?.id === "string" && control.skip.includes(config.id);
}

export function parseStaticMiddlewareConfig(code: string): StaticMiddlewareConfig {
  const configBody = /\bexport\s+const\s+config\s*=\s*\{(?<body>[\s\S]*?)\}\s*;?/.exec(code)
    ?.groups?.body;

  if (configBody === undefined) {
    return { hasMatcher: false };
  }

  const id = /\bid\s*:\s*["'](?<id>[^"']+)["']/.exec(configBody)?.groups?.id;
  const stringMatcher = /\bmatcher\s*:\s*["'](?<matcher>[^"']+)["']/.exec(configBody)?.groups
    ?.matcher;

  if (stringMatcher !== undefined) {
    return {
      hasMatcher: true,
      ...(id === undefined ? {} : { id }),
      matcher: stringMatcher,
    };
  }

  const matcherArray = /\bmatcher\s*:\s*\[(?<items>[\s\S]*?)\]/.exec(configBody)?.groups?.items;

  if (matcherArray !== undefined) {
    return {
      hasMatcher: true,
      ...(id === undefined ? {} : { id }),
      matcher: Array.from(
        matcherArray.matchAll(/["'](?<matcher>[^"']+)["']/g),
        (match) => match.groups?.matcher,
      ).filter((matcher): matcher is string => matcher !== undefined),
    };
  }

  return {
    hasMatcher: /\bmatcher\s*:/.test(configBody),
    ...(id === undefined ? {} : { id }),
  };
}

export function middlewareMatches(config: MiddlewareModule["config"], pathname: string): boolean {
  const matcher = config?.matcher;

  if (matcher === undefined) {
    return true;
  }

  if (matcher instanceof RegExp) {
    return matcher.test(pathname);
  }

  if (Array.isArray(matcher)) {
    return matcher.some((item) => middlewarePatternMatches(item, pathname));
  }

  return typeof matcher === "string" && middlewarePatternMatches(matcher, pathname);
}

export function parseRouteMiddlewareControl(code: string): RouteMiddlewareControl | undefined {
  if (!/\bexport\s+const\s+middleware\s*=/.test(code)) {
    return undefined;
  }

  if (/\bmiddleware\s*=\s*\{[\s\S]*?\bskip\s*:\s*true\b/.test(code)) {
    return { skip: true };
  }

  const skipArray = /\bmiddleware\s*=\s*\{[\s\S]*?\bskip\s*:\s*\[([\s\S]*?)\]/.exec(code);

  if (skipArray === null) {
    return undefined;
  }

  const ids = Array.from(
    skipArray[1]?.matchAll(/["']([^"']+)["']/g) ?? [],
    (match) => match[1],
  ).filter((id) => id !== undefined);

  return ids.length === 0 ? undefined : { skip: ids };
}

export function mergeRouteMiddlewareControls(
  controls: readonly (RouteMiddlewareControl | undefined)[],
): RouteMiddlewareControl | undefined {
  const skippedIds = new Set<string>();

  for (const control of controls) {
    if (control?.skip === true) {
      return { skip: true };
    }

    if (Array.isArray(control?.skip)) {
      for (const id of control.skip) {
        skippedIds.add(id);
      }
    }
  }

  return skippedIds.size === 0 ? undefined : { skip: [...skippedIds] };
}

function middlewarePatternMatches(pattern: string, pathname: string): boolean {
  const normalizedPattern = normalizeRoutePath(pattern);
  const normalizedPathname = normalizeRoutePath(pathname);

  if (normalizedPattern === normalizedPathname) {
    return true;
  }

  if (normalizedPattern.endsWith("/:path*")) {
    const prefix = normalizedPattern.slice(0, -"/:path*".length);

    return normalizedPathname === prefix || normalizedPathname.startsWith(`${prefix}/`);
  }

  if (normalizedPattern.endsWith("*")) {
    const prefix = normalizedPattern.slice(0, -1);

    return normalizedPathname.startsWith(prefix);
  }

  return false;
}
