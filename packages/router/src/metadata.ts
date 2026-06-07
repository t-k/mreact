import {
  escapeHtmlAttribute,
  escapeHtmlText as escapeHtml,
} from "@reckona/mreact-shared/html-escape";
import {
  isDangerousHtmlAttribute,
  isUnsafeUrlAttribute,
} from "@reckona/mreact-shared/url-safety";
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
  validateRouteMetadata(metadata);

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

export function validateRouteMetadata(
  metadata: RouteMetadata | undefined,
  path = "metadata",
): RouteMetadata | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  assertPlainMetadataObject(metadata, path);
  validateOptionalMetadataObject(metadata.alternates, `${path}.alternates`, {
    canonical: validateMetadataScalar,
  });
  validateOptionalCspMetadata(metadata.csp, `${path}.csp`);
  validateOptionalMetadataScalar(metadata.description, `${path}.description`);
  validateOptionalHeadMetadata(metadata.head, `${path}.head`);
  validateOptionalMetadataObject(metadata.icons, `${path}.icons`, {
    apple: validateMetadataScalar,
    icon: validateMetadataScalar,
  });
  validateOptionalOpenGraphMetadata(metadata.openGraph, `${path}.openGraph`);
  validateOptionalMetadataScalar(metadata.lang, `${path}.lang`);
  validateOptionalRobotsMetadata(metadata.robots, `${path}.robots`);
  validateOptionalSecurityMetadata(metadata.security, `${path}.security`);
  validateOptionalThemeColorMetadata(metadata.themeColor, `${path}.themeColor`);
  validateOptionalMetadataScalar(metadata.title, `${path}.title`);
  validateOptionalViewportMetadata(metadata.viewport, `${path}.viewport`);
  validateUnknownMetadataFields(metadata, path);

  return metadata;
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
  return (
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "boolean"
  );
}

function validateOptionalMetadataScalar(value: unknown, path: string): void {
  if (value !== undefined) {
    validateMetadataScalar(value, path);
  }
}

function validateMetadataScalar(value: unknown, path: string): void {
  if (!isMetadataScalar(value)) {
    throw new Error(`Invalid metadata field ${path}: expected string, number, or boolean.`);
  }
}

function validateOptionalMetadataObject<T extends Record<string, unknown>>(
  value: unknown,
  path: string,
  validators: Record<string, (value: unknown, path: string) => void>,
): void {
  if (value === undefined) {
    return;
  }

  assertPlainMetadataObject(value, path);
  for (const [key, validator] of Object.entries(validators)) {
    const fieldValue = (value as T)[key];
    if (fieldValue !== undefined) {
      validator(fieldValue, `${path}.${key}`);
    }
  }
  validateUnknownJsonMetadataFields(
    value as Record<string, unknown>,
    path,
    new Set(Object.keys(validators)),
  );
}

function validateOptionalCspMetadata(value: unknown, path: string): void {
  if (value === undefined) {
    return;
  }

  assertPlainMetadataObject(value, path);
  const csp = value as NonNullable<RouteMetadata["csp"]>;
  if (csp.disable !== undefined && typeof csp.disable !== "boolean") {
    throw new Error(`Invalid metadata field ${path}.disable: expected boolean.`);
  }
  if (csp.nonce !== undefined && typeof csp.nonce !== "string") {
    throw new Error(`Invalid metadata field ${path}.nonce: expected string.`);
  }
  validateOptionalDirectiveMap(csp.directives, `${path}.directives`);
  validateOptionalDirectiveMap(csp.replace, `${path}.replace`);
  if (csp.remove !== undefined) {
    validateStringArray(csp.remove, `${path}.remove`);
  }
  validateUnknownJsonMetadataFields(
    csp as Record<string, unknown>,
    path,
    new Set(["directives", "disable", "nonce", "remove", "replace"]),
  );
}

function validateOptionalDirectiveMap(value: unknown, path: string): void {
  if (value === undefined) {
    return;
  }

  assertPlainMetadataObject(value, path);
  for (const [name, directive] of Object.entries(value)) {
    if (typeof directive === "string") {
      continue;
    }
    validateStringArray(directive, `${path}.${name}`);
  }
}

function validateStringArray(value: unknown, path: string): void {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid metadata field ${path}: expected string or string array.`);
  }

  value.forEach((entry, index) => {
    if (typeof entry !== "string") {
      throw new Error(`Invalid metadata field ${path}.${index}: expected string.`);
    }
  });
}

function validateOptionalHeadMetadata(value: unknown, path: string): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    throw new Error(`Invalid metadata field ${path}: expected array.`);
  }

  value.forEach((descriptor, index) => {
    const descriptorPath = `${path}.${index}`;
    assertPlainMetadataObject(descriptor, descriptorPath);
    const head = descriptor as unknown as RouteHeadDescriptor;
    if (!["base", "link", "meta", "script", "style"].includes(String(head.tag))) {
      throw new Error(`Invalid metadata field ${descriptorPath}.tag: expected supported head tag.`);
    }
    if (head.content !== undefined && typeof head.content !== "string") {
      throw new Error(`Invalid metadata field ${descriptorPath}.content: expected string.`);
    }
    if (
      head.nonce !== undefined &&
      typeof head.nonce !== "boolean" &&
      typeof head.nonce !== "string"
    ) {
      throw new Error(`Invalid metadata field ${descriptorPath}.nonce: expected string or boolean.`);
    }
    if (head.attrs !== undefined) {
      assertPlainMetadataObject(head.attrs, `${descriptorPath}.attrs`);
      for (const [name, attr] of Object.entries(head.attrs)) {
        validateHeadAttribute(name, attr, `${descriptorPath}.attrs.${name}`);
        if (
          attr !== undefined &&
          typeof attr !== "boolean" &&
          typeof attr !== "number" &&
          typeof attr !== "string"
        ) {
          throw new Error(
            `Invalid metadata field ${descriptorPath}.attrs.${name}: expected string, number, boolean, or undefined.`,
          );
        }
      }
    }
    validateUnknownJsonMetadataFields(
      descriptor as Record<string, unknown>,
      descriptorPath,
      new Set(["attrs", "content", "nonce", "tag"]),
    );
  });
}

function validateHeadAttribute(name: string, value: unknown, path: string): void {
  if (!isSafeHeadAttributeName(name)) {
    throw new Error(`Invalid metadata field ${path}: expected safe HTML attribute name.`);
  }

  const canonicalName = name.toLowerCase();
  if (canonicalName.startsWith("on") || isDangerousHtmlAttribute(canonicalName)) {
    throw new Error(`Invalid metadata field ${path}: event and dangerous attributes are not allowed.`);
  }

  if (typeof value === "string" && isUnsafeUrlAttribute(canonicalName, value)) {
    throw new Error(`Invalid metadata field ${path}: unsafe URL value.`);
  }
}

function isSafeHeadAttributeName(name: string): boolean {
  if (name.length === 0) {
    return false;
  }

  for (let index = 0; index < name.length; index += 1) {
    const code = name.charCodeAt(index);

    if (
      code <= 0x20 ||
      code === 0x22 ||
      code === 0x27 ||
      code === 0x2f ||
      code === 0x3c ||
      code === 0x3d ||
      code === 0x3e ||
      code === 0x60 ||
      code === 0x7f
    ) {
      return false;
    }
  }

  return true;
}

function validateOptionalOpenGraphMetadata(value: unknown, path: string): void {
  if (value === undefined) {
    return;
  }

  assertPlainMetadataObject(value, path);
  const openGraph = value as NonNullable<RouteMetadata["openGraph"]>;
  validateOptionalMetadataScalar(openGraph.description, `${path}.description`);
  validateOptionalMetadataImage(openGraph.image, `${path}.image`);
  if (openGraph.images !== undefined) {
    if (!Array.isArray(openGraph.images)) {
      throw new Error(`Invalid metadata field ${path}.images: expected array.`);
    }
    openGraph.images.forEach((image, index) =>
      validateOptionalMetadataImage(image, `${path}.images.${index}`),
    );
  }
  validateOptionalMetadataScalar(openGraph.title, `${path}.title`);
  validateUnknownJsonMetadataFields(
    openGraph as Record<string, unknown>,
    path,
    new Set(["description", "image", "images", "title"]),
  );
}

function validateOptionalMetadataImage(value: unknown, path: string): void {
  if (value === undefined) {
    return;
  }

  if (isMetadataScalar(value)) {
    return;
  }

  assertPlainMetadataObject(value, path);
  const image = value as unknown as MetadataImage;
  validateMetadataScalar(image.url, `${path}.url`);
  validateOptionalMetadataScalar(image.alt, `${path}.alt`);
  validateOptionalMetadataScalar(image.height, `${path}.height`);
  validateOptionalMetadataScalar(image.type, `${path}.type`);
  validateOptionalMetadataScalar(image.width, `${path}.width`);
  validateUnknownJsonMetadataFields(
    image as unknown as Record<string, unknown>,
    path,
    new Set(["alt", "height", "type", "url", "width"]),
  );
}

function validateOptionalRobotsMetadata(value: unknown, path: string): void {
  if (value === undefined || typeof value === "string") {
    return;
  }

  assertPlainMetadataObject(value, path);
  const robots = value as Extract<NonNullable<RouteMetadata["robots"]>, object>;
  if (robots.follow !== undefined && typeof robots.follow !== "boolean") {
    throw new Error(`Invalid metadata field ${path}.follow: expected boolean.`);
  }
  if (robots.index !== undefined && typeof robots.index !== "boolean") {
    throw new Error(`Invalid metadata field ${path}.index: expected boolean.`);
  }
  validateUnknownJsonMetadataFields(
    robots as Record<string, unknown>,
    path,
    new Set(["follow", "index"]),
  );
}

function validateOptionalSecurityMetadata(value: unknown, path: string): void {
  if (value === undefined) {
    return;
  }

  assertPlainMetadataObject(value, path);
  validateJsonSerializableMetadata(value, path);
}

function validateOptionalThemeColorMetadata(value: unknown, path: string): void {
  if (value === undefined || isMetadataScalar(value)) {
    return;
  }

  validateOptionalMetadataObject(value, path, {
    color: validateMetadataScalar,
    media: validateMetadataScalar,
  });
}

function validateOptionalViewportMetadata(value: unknown, path: string): void {
  if (value === undefined || isMetadataScalar(value)) {
    return;
  }

  assertPlainMetadataObject(value, path);
  for (const [key, viewportValue] of Object.entries(value)) {
    if (viewportValue !== undefined && viewportValue !== null && !isMetadataScalar(viewportValue)) {
      throw new Error(
        `Invalid metadata field ${path}.${key}: expected string, number, boolean, null, or undefined.`,
      );
    }
  }
}

function validateUnknownMetadataFields(metadata: RouteMetadata, path: string): void {
  validateUnknownJsonMetadataFields(metadata as Record<string, unknown>, path, new Set([
    "alternates",
    "csp",
    "description",
    "head",
    "icons",
    "lang",
    "openGraph",
    "robots",
    "security",
    "themeColor",
    "title",
    "viewport",
  ]));
}

function validateUnknownJsonMetadataFields(
  value: Record<string, unknown>,
  path: string,
  knownFields: ReadonlySet<string>,
): void {
  for (const [key, entry] of Object.entries(value)) {
    if (!knownFields.has(key)) {
      validateJsonSerializableMetadata(entry, `${path}.${key}`);
    }
  }
}

function validateJsonSerializableMetadata(value: unknown, path: string): void {
  if (value === undefined || value === null || isMetadataScalar(value)) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateJsonSerializableMetadata(entry, `${path}.${index}`));
    return;
  }

  if (isPlainMetadataObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      validateJsonSerializableMetadata(entry, `${path}.${key}`);
    }
    return;
  }

  throw new Error(
    `Invalid metadata field ${path}: expected a JSON-serializable value.`,
  );
}

function assertPlainMetadataObject(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!isPlainMetadataObject(value)) {
    throw new Error(`Invalid metadata field ${path}: expected object.`);
  }
}

function isPlainMetadataObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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
