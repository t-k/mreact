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

export function validateRouteMiddlewareControl(options: {
  availableIds: ReadonlySet<string>;
  control: RouteMiddlewareControl | undefined;
  routePath: string;
}): void {
  if (!Array.isArray(options.control?.skip)) {
    return;
  }

  for (const id of options.control.skip) {
    if (!options.availableIds.has(id)) {
      throw new Error(
        `Unknown middleware skip id "${id}" for route "${options.routePath}". Available middleware ids: ${formatAvailableMiddlewareIds(options.availableIds)}.`,
      );
    }
  }
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
  const masked = maskCodeLiterals(code);
  const declaration = /\bexport\s+const\s+middleware\s*=\s*\{/.exec(masked);

  if (declaration === null) {
    return undefined;
  }

  const objectStart = masked.indexOf("{", declaration.index);
  const objectEnd = findMatchingBrace(masked, objectStart);

  if (objectStart < 0 || objectEnd < 0) {
    return undefined;
  }

  const maskedBody = masked.slice(objectStart + 1, objectEnd);
  const body = code.slice(objectStart + 1, objectEnd);

  if (/\bskip\s*:\s*true\b/.test(maskedBody)) {
    return { skip: true };
  }

  const skipArray = /\bskip\s*:\s*\[([\s\S]*?)\]/.exec(maskedBody);

  if (skipArray === null) {
    return undefined;
  }

  const arrayStart = skipArray.index + skipArray[0].indexOf("[") + 1;
  const arrayEnd = skipArray.index + skipArray[0].lastIndexOf("]");
  const arrayBody = body.slice(arrayStart, arrayEnd);
  const ids = Array.from(
    arrayBody.matchAll(/["']([^"']+)["']/g),
    (match) => match[1],
  ).filter((id) => id !== undefined);

  return ids.length === 0 ? undefined : { skip: ids };
}

function maskCodeLiterals(code: string): string {
  return code.replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n\r]*|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`/g,
    (match) => " ".repeat(match.length),
  );
}

function findMatchingBrace(code: string, openIndex: number): number {
  if (openIndex < 0) {
    return -1;
  }

  let depth = 0;

  for (let index = openIndex; index < code.length; index += 1) {
    const char = code[index];

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
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

function formatAvailableMiddlewareIds(ids: ReadonlySet<string>): string {
  return ids.size === 0 ? "(none)" : [...ids].sort().join(", ");
}
