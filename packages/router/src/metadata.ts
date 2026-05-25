import {
  escapeHtmlAttribute,
  escapeHtmlText as escapeHtml,
} from "@reckona/mreact-shared/html-escape";
import { contentSecurityPolicy } from "./csp.js";
import type { AppFileConvention } from "./file-conventions.js";
import type { AppRoute } from "./routes.js";
import { routeSecurityHeaders } from "./security-headers.js";
import type {
  MetadataImage,
  MetadataScalar,
  MetadataThemeColor,
  MetadataViewport,
  RobotsManifest,
  RouteHeadDescriptor,
  RouteMetadata,
  RouteParams,
  SitemapEntry,
} from "./types.js";

type CspDirectiveMap = Record<string, readonly string[] | string>;

const DEFAULT_HTML_RESPONSE_HEADERS = Object.freeze({
  "content-type": "text/html; charset=utf-8",
});

export function mergeRouteMetadata(metadata: readonly RouteMetadata[]): RouteMetadata | undefined {
  if (metadata.length === 0) {
    return undefined;
  }

  return metadata.reduce<RouteMetadata>((merged, next) => {
    const mergedMetadata: RouteMetadata = { ...merged, ...next };
    const alternates = mergeObject(merged.alternates, next.alternates);
    const csp = mergeCspMetadata(merged.csp, next.csp);
    const head = mergeReadonlyArrays(merged.head, next.head);
    const icons = mergeObject(merged.icons, next.icons);
    const openGraph = mergeOpenGraphMetadata(merged.openGraph, next.openGraph);

    if (alternates !== undefined) {
      mergedMetadata.alternates = alternates;
    }
    if (csp !== undefined) {
      mergedMetadata.csp = csp;
    }
    if (head !== undefined) {
      mergedMetadata.head = head;
    }
    if (icons !== undefined) {
      mergedMetadata.icons = icons;
    }
    if (openGraph !== undefined) {
      mergedMetadata.openGraph = openGraph;
    }

    return mergedMetadata;
  }, {});
}

export function applyFileConventionMetadata(
  metadata: RouteMetadata | undefined,
  routes: readonly AppRoute[],
  filename: string,
  params: RouteParams,
): RouteMetadata | undefined {
  const next: RouteMetadata = metadata === undefined ? {} : { ...metadata };
  const iconRoute = routes.find((route) => route.kind === "asset" && route.convention === "icon");
  const appleIconRoute = routes.find(
    (route) => route.kind === "asset" && route.convention === "apple-icon",
  );
  const openGraphImagePath = fileConventionMetadataRoutePath(
    routes,
    filename,
    params,
    "opengraph-image",
  );

  if (iconRoute !== undefined && next.icons?.icon === undefined) {
    next.icons = { ...next.icons, icon: iconRoute.path };
  }
  if (appleIconRoute !== undefined && next.icons?.apple === undefined) {
    next.icons = { ...next.icons, apple: appleIconRoute.path };
  }
  if (
    openGraphImagePath !== undefined &&
    next.openGraph?.image === undefined &&
    (next.openGraph?.images === undefined || next.openGraph.images.length === 0)
  ) {
    next.openGraph = { ...next.openGraph, image: openGraphImagePath };
  }

  return Object.keys(next).length === 0 ? undefined : next;
}

export function injectHeadMetadata(html: string, metadata: RouteMetadata | undefined): string {
  if (metadata === undefined) {
    return html;
  }

  let nextHtml =
    metadata.lang === undefined
      ? html
      : injectHtmlLangAttribute(html, metadataString(metadata.lang, "lang"));
  const tags = [
    metadata.title === undefined
      ? undefined
      : `<title>${escapeHtml(metadataString(metadata.title, "title"))}</title>`,
    metadata.description === undefined
      ? undefined
      : `<meta name="description" content="${escapeHtmlAttribute(metadataString(metadata.description, "description"))}">`,
    metadata.alternates?.canonical === undefined
      ? undefined
      : `<link rel="canonical" href="${escapeHtmlAttribute(metadataString(metadata.alternates.canonical, "alternates.canonical"))}">`,
    metadata.openGraph?.title === undefined
      ? undefined
      : `<meta property="og:title" content="${escapeHtmlAttribute(metadataString(metadata.openGraph.title, "openGraph.title"))}">`,
    metadata.openGraph?.description === undefined
      ? undefined
      : `<meta property="og:description" content="${escapeHtmlAttribute(metadataString(metadata.openGraph.description, "openGraph.description"))}">`,
    ...openGraphImages(metadata.openGraph).map(
      (image) => `<meta property="og:image" content="${escapeHtmlAttribute(image)}">`,
    ),
    metadata.icons?.icon === undefined
      ? undefined
      : `<link rel="icon" href="${escapeHtmlAttribute(metadataString(metadata.icons.icon, "icons.icon"))}">`,
    metadata.icons?.apple === undefined
      ? undefined
      : `<link rel="apple-touch-icon" href="${escapeHtmlAttribute(metadataString(metadata.icons.apple, "icons.apple"))}">`,
    metadata.robots === undefined
      ? undefined
      : `<meta name="robots" content="${escapeHtmlAttribute(robotsContent(metadata.robots))}">`,
    metadata.themeColor === undefined ? undefined : themeColorTag(metadata.themeColor),
    metadata.viewport === undefined
      ? undefined
      : `<meta name="viewport" content="${escapeHtmlAttribute(viewportContent(metadata.viewport))}">`,
    ...headDescriptorTags(metadata.head, metadata.csp?.nonce),
  ]
    .filter((tag): tag is string => tag !== undefined)
    .join("");

  if (tags === "") {
    return nextHtml;
  }

  if (/<head(?:\s[^>]*)?>/i.test(nextHtml)) {
    return nextHtml.replace(/<head(\s[^>]*)?>/i, (match) => `${match}${tags}`);
  }

  if (/<html(?:\s[^>]*)?>/i.test(nextHtml)) {
    return nextHtml.replace(/<html(\s[^>]*)?>/i, (match) => `${match}<head>${tags}</head>`);
  }

  return `<head>${tags}</head>${nextHtml}`;
}

export function responseHeadersForMetadata(
  metadata: RouteMetadata | undefined,
  request: Request,
  extra?: Readonly<Record<string, string>>,
): HeadersInit {
  const csp = contentSecurityPolicy(metadata?.csp);
  const security = routeSecurityHeaders({
    request,
    security: metadata?.security,
  });

  if (csp === undefined && extra === undefined) {
    return {
      ...DEFAULT_HTML_RESPONSE_HEADERS,
      ...security,
    };
  }

  return {
    ...DEFAULT_HTML_RESPONSE_HEADERS,
    ...security,
    ...(csp === undefined ? undefined : { "content-security-policy": csp }),
    ...extra,
  };
}

export function serializeRobots(manifest: RobotsManifest): string {
  const lines: string[] = [];
  const rules =
    manifest.rules === undefined
      ? []
      : Array.isArray(manifest.rules)
        ? manifest.rules
        : [manifest.rules];

  for (const rule of rules) {
    for (const userAgent of arrayValue(rule.userAgent)) {
      lines.push(`User-agent: ${userAgent}`);
    }
    for (const allow of arrayValue(rule.allow)) {
      lines.push(`Allow: ${allow}`);
    }
    for (const disallow of arrayValue(rule.disallow)) {
      lines.push(`Disallow: ${disallow}`);
    }
  }

  for (const sitemap of arrayValue(manifest.sitemap)) {
    lines.push(`Sitemap: ${sitemap}`);
  }
  if (manifest.host !== undefined) {
    lines.push(`Host: ${manifest.host}`);
  }

  return `${lines.join("\n")}\n`;
}

export function serializeSitemap(entries: readonly SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const fields = [
        `<loc>${escapeXml(entry.url)}</loc>`,
        entry.lastModified === undefined
          ? undefined
          : `<lastmod>${escapeXml(sitemapDate(entry.lastModified))}</lastmod>`,
        entry.changeFrequency === undefined
          ? undefined
          : `<changefreq>${escapeXml(entry.changeFrequency)}</changefreq>`,
        entry.priority === undefined ? undefined : `<priority>${entry.priority}</priority>`,
      ].filter((field): field is string => field !== undefined);

      return `<url>${fields.join("")}</url>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

function fileConventionMetadataRoutePath(
  routes: readonly AppRoute[],
  filename: string,
  params: RouteParams,
  convention: AppFileConvention,
): string | undefined {
  const pageRoute = routes.find((route) => route.kind === "page" && route.file === filename);
  const candidateRoutes = routes.filter(
    (route) =>
      (route.kind === "asset" || route.kind === "metadata") &&
      route.convention === convention,
  );

  if (pageRoute !== undefined) {
    const expectedPath = pageRoute.path === "/" ? `/${convention}` : `${pageRoute.path}/${convention}`;
    const routeLocal = candidateRoutes.find((route) => route.path === expectedPath);
    const routeLocalPath =
      routeLocal === undefined ? undefined : concreteRoutePath(routeLocal.path, params);

    if (routeLocalPath !== undefined) {
      return routeLocalPath;
    }
  }

  return candidateRoutes.find((route) => route.path === `/${convention}`)?.path;
}

function concreteRoutePath(path: string, params: RouteParams): string | undefined {
  const segments = path === "/" ? [] : path.slice(1).split("/");
  const concrete: string[] = [];

  for (const segment of segments) {
    if (segment.startsWith(":...")) {
      const value = params[segment.slice(4)];
      const values = Array.isArray(value)
        ? value
        : typeof value === "string"
          ? value.split("/").filter((part) => part !== "")
          : undefined;

      if (values === undefined) {
        return undefined;
      }
      concrete.push(...values.map((part) => encodeURIComponent(part)));
      continue;
    }

    if (segment.startsWith(":")) {
      const value = params[segment.slice(1)];
      const stringValue = Array.isArray(value) ? value[0] : value;

      if (typeof stringValue !== "string") {
        return undefined;
      }
      concrete.push(encodeURIComponent(stringValue));
      continue;
    }

    concrete.push(segment);
  }

  return `/${concrete.join("/")}`;
}

function mergeObject<T extends object>(left: T | undefined, right: T | undefined): T | undefined {
  if (left === undefined) {
    return right;
  }

  if (right === undefined) {
    return left;
  }

  return { ...left, ...right };
}

function mergeReadonlyArrays<T>(
  left: readonly T[] | undefined,
  right: readonly T[] | undefined,
): readonly T[] | undefined {
  if (left === undefined || left.length === 0) {
    return right;
  }

  if (right === undefined || right.length === 0) {
    return left;
  }

  return [...left, ...right];
}

function mergeCspMetadata(
  left: RouteMetadata["csp"],
  right: RouteMetadata["csp"],
): RouteMetadata["csp"] | undefined {
  if (right?.disable === true) {
    return { disable: true };
  }

  if (left === undefined) {
    if (right === undefined) {
      return undefined;
    }

    const merged: NonNullable<RouteMetadata["csp"]> = { ...right };
    const directives = applyCspOverrides(undefined, right);

    if (directives !== undefined) {
      merged.directives = directives;
    } else {
      delete merged.directives;
    }

    return merged;
  }

  if (right === undefined) {
    return left;
  }

  const merged: NonNullable<RouteMetadata["csp"]> = {
    ...left,
    ...right,
  };
  const directives = applyCspOverrides(left.directives, right);

  if (directives !== undefined) {
    merged.directives = directives;
  } else {
    delete merged.directives;
  }

  return merged;
}

function applyCspOverrides(
  left: CspDirectiveMap | undefined,
  right: RouteMetadata["csp"] | undefined,
): CspDirectiveMap | undefined {
  if (right === undefined) {
    return left;
  }

  const merged = { ...left, ...right.directives };

  for (const [name, value] of Object.entries(right.replace ?? {})) {
    merged[name] = value;
  }

  for (const name of right.remove ?? []) {
    delete merged[name];
  }

  return Object.keys(merged).length === 0 ? undefined : merged;
}

function mergeOpenGraphMetadata(
  left: RouteMetadata["openGraph"],
  right: RouteMetadata["openGraph"],
): RouteMetadata["openGraph"] | undefined {
  if (left === undefined) {
    return right;
  }

  if (right === undefined) {
    return left;
  }

  const merged: NonNullable<RouteMetadata["openGraph"]> = {
    ...left,
    ...right,
  };
  const images = mergeReadonlyArrays(openGraphImages(left), openGraphImages(right));

  if (images !== undefined && images.length > 0) {
    merged.images = images;
  }

  return merged;
}

function injectHtmlLangAttribute(html: string, lang: string): string {
  const escapedLang = escapeHtmlAttribute(lang);

  if (!/<html(?:\s[^>]*)?>/i.test(html)) {
    return html;
  }

  return html.replace(/<html(\s[^>]*)?>/i, (_match, attrs = "") => {
    const strippedAttrs = String(attrs).replace(/\s+lang=(?:"[^"]*"|'[^']*'|[^\s>]+)/i, "");
    return `<html lang="${escapedLang}"${strippedAttrs}>`;
  });
}

function sitemapDate(value: Date | number | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return typeof value === "number" ? new Date(value).toISOString() : value;
}

function arrayValue<T>(value: T | readonly T[] | undefined): readonly T[] {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? (value as readonly T[]) : [value as T];
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function headDescriptorTags(
  descriptors: readonly RouteHeadDescriptor[] | undefined,
  nonce: string | undefined,
): string[] {
  return (descriptors ?? []).flatMap((descriptor) => {
    const descriptorNonce = descriptor.nonce === true ? nonce : descriptor.nonce || undefined;
    const attrs: Record<string, boolean | number | string | undefined> = {
      ...descriptor.attrs,
      ...(descriptorNonce === undefined ? {} : { nonce: descriptorNonce }),
    };
    const attrText = Object.entries(attrs)
      .flatMap(([name, value]) => {
        if (value === undefined || value === false) {
          return [];
        }

        return value === true
          ? [escapeHtmlAttribute(name)]
          : [`${escapeHtmlAttribute(name)}="${escapeHtmlAttribute(String(value))}"`];
      })
      .join(" ");
    const open = attrText === "" ? `<${descriptor.tag}>` : `<${descriptor.tag} ${attrText}>`;

    if (descriptor.tag === "meta" || descriptor.tag === "link" || descriptor.tag === "base") {
      return [open.slice(0, -1) + ">"];
    }

    return [`${open}${escapeHeadTextContent(descriptor.content ?? "")}</${descriptor.tag}>`];
  });
}

function escapeHeadTextContent(value: string): string {
  return value.replaceAll("<", "\\u003c");
}

function metadataString(value: MetadataScalar, path: string): string {
  if (isMetadataScalar(value)) {
    return String(value);
  }

  throw new Error(`Invalid metadata field ${path}: expected string, number, or boolean.`);
}

function metadataKebabName(name: string): string {
  return name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

function viewportContent(viewport: MetadataScalar | MetadataViewport): string {
  if (isMetadataScalar(viewport)) {
    return metadataString(viewport, "viewport");
  }

  return Object.entries(viewport)
    .flatMap(([key, value]) => {
      if (value === undefined || value === null || value === false) {
        return [];
      }

      return [`${metadataKebabName(key)}=${metadataString(value, `viewport.${key}`)}`];
    })
    .join(", ");
}

function themeColorTag(themeColor: MetadataScalar | MetadataThemeColor): string {
  if (isMetadataScalar(themeColor)) {
    return `<meta name="theme-color" content="${escapeHtmlAttribute(metadataString(themeColor, "themeColor"))}">`;
  }

  const content = themeColor.color;
  if (!isMetadataScalar(content)) {
    throw new Error(
      "Invalid metadata field themeColor.color: expected string, number, or boolean.",
    );
  }

  const media =
    themeColor.media === undefined
      ? ""
      : ` media="${escapeHtmlAttribute(metadataString(metadataScalarField(themeColor.media, "themeColor.media"), "themeColor.media"))}"`;

  return `<meta name="theme-color"${media} content="${escapeHtmlAttribute(metadataString(content, "themeColor.color"))}">`;
}

function metadataScalarField(value: unknown, path: string): MetadataScalar {
  if (isMetadataScalar(value)) {
    return value;
  }

  throw new Error(`Invalid metadata field ${path}: expected string, number, or boolean.`);
}

function isMetadataScalar(value: unknown): value is MetadataScalar {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function openGraphImages(openGraph: RouteMetadata["openGraph"]): readonly string[] {
  if (openGraph?.images !== undefined) {
    return openGraph.images.map((image, index) =>
      metadataImageUrl(image, `openGraph.images.${index}`),
    );
  }

  return openGraph?.image === undefined ? [] : [metadataImageUrl(openGraph.image, "openGraph.image")];
}

function metadataImageUrl(value: MetadataImage | MetadataScalar, path: string): string {
  if (isMetadataScalar(value)) {
    return metadataString(value, path);
  }

  if (typeof value === "object" && value !== null && "url" in value) {
    return metadataString(value.url, `${path}.url`);
  }

  throw new Error(`Invalid metadata field ${path}: expected string, number, boolean, or object with url.`);
}

function robotsContent(robots: NonNullable<RouteMetadata["robots"]>): string {
  if (typeof robots === "string") {
    return robots;
  }

  return [
    robots.index === false ? "noindex" : "index",
    robots.follow === false ? "nofollow" : "follow",
  ].join(",");
}
