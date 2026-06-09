/**
 * Configures locale detection for app-router requests.
 */
export interface LocaleRoutingOptions<Locale extends string = string> {
  defaultLocale: Locale;
  locales: readonly Locale[];
}

/**
 * Reports the locale selected for an incoming request.
 */
export interface DetectedLocale<Locale extends string = string> {
  locale: Locale;
  pathname: string;
  source: "accept-language" | "default" | "path";
}

/**
 * Describes a nested tree of localized message strings.
 */
export type MessageTree = {
  readonly [key: string]: MessageTree | string;
};

/**
 * Detects the request locale from the URL path or Accept-Language header.
 */
export function detectLocale<Locale extends string>(
  request: Request,
  options: LocaleRoutingOptions<Locale>,
): DetectedLocale<Locale> {
  const url = new URL(request.url);
  const pathMatch = localeFromPath(url.pathname, options.locales);

  if (pathMatch !== undefined) {
    return {
      locale: pathMatch.locale,
      pathname: pathMatch.pathname,
      source: "path",
    };
  }

  const accepted = localeFromAcceptLanguage(
    request.headers.get("accept-language"),
    options.locales,
  );

  if (accepted !== undefined) {
    return {
      locale: accepted,
      pathname: url.pathname,
      source: "accept-language",
    };
  }

  return {
    locale: options.defaultLocale,
    pathname: url.pathname,
    source: "default",
  };
}

/**
 * Preserves literal types for a localized message tree.
 */
export function defineMessages<const Messages extends MessageTree>(messages: Messages): Messages {
  return messages;
}

function localeFromPath<Locale extends string>(
  pathname: string,
  locales: readonly Locale[],
): { locale: Locale; pathname: string } | undefined {
  const [, firstSegment = "", ...rest] = pathname.split("/");
  const locale = locales.find((candidate) => candidate === firstSegment);

  if (locale === undefined) {
    return undefined;
  }

  return {
    locale,
    pathname: rest.length === 0 ? "/" : `/${rest.join("/")}`,
  };
}

function localeFromAcceptLanguage<Locale extends string>(
  header: string | null,
  locales: readonly Locale[],
): Locale | undefined {
  if (header === null) {
    return undefined;
  }

  return header
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params
        .map((param) => /^q=(?<value>\d(?:\.\d+)?)$/.exec(param.trim())?.groups?.value)
        .find((value): value is string => value !== undefined);

      return {
        q: q === undefined ? 1 : Number(q),
        tag: tag.toLowerCase(),
      };
    })
    .filter((entry) => entry.tag !== "" && Number.isFinite(entry.q) && entry.q > 0)
    .sort((left, right) => right.q - left.q)
    .flatMap((entry) => [entry.tag, entry.tag.split("-")[0] ?? ""])
    .map((tag) => locales.find((locale) => locale.toLowerCase() === tag))
    .find((locale): locale is Locale => locale !== undefined);
}
