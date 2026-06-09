/**
 * Describes the generated files associated with a client bundle manifest entry.
 */
export interface AssetManifestEntry {
  assets?: readonly string[];
  css?: readonly string[];
  file: string;
  imports?: readonly string[];
}

/**
 * Maps app-router entry keys to generated client asset metadata.
 */
export type AssetManifest = Readonly<Record<string, AssetManifestEntry>>;

/**
 * Configures URL generation for asset helper functions.
 */
export interface AssetHelperOptions {
  base?: string;
}

/**
 * Represents a preload or stylesheet link descriptor derived from an asset manifest.
 */
export interface AssetLinkDescriptor {
  attrs: Record<string, string>;
  tag: "link";
}

/**
 * Resolves a manifest entry key to its public asset URL.
 */
export function assetHref(
  manifest: AssetManifest,
  key: string,
  options: AssetHelperOptions = {},
): string {
  return assetPath(manifestEntry(manifest, key).file, options.base);
}

/**
 * Builds unique preload and stylesheet link descriptors for one or more manifest entries.
 */
export function assetPreloadLinks(
  manifest: AssetManifest,
  keys: readonly string[] | string,
  options: AssetHelperOptions = {},
): AssetLinkDescriptor[] {
  const seen = new Set<string>();
  const links: AssetLinkDescriptor[] = [];

  for (const key of Array.isArray(keys) ? keys : [keys]) {
    const entry = manifestEntry(manifest, key);

    pushUniqueLink(seen, links, {
      attrs: {
        href: assetPath(entry.file, options.base),
        rel: entry.file.endsWith(".js") ? "modulepreload" : "preload",
      },
      tag: "link",
    });

    for (const css of entry.css ?? []) {
      pushUniqueLink(seen, links, {
        attrs: {
          href: assetPath(css, options.base),
          rel: "stylesheet",
        },
        tag: "link",
      });
    }

    for (const asset of entry.assets ?? []) {
      pushUniqueLink(seen, links, {
        attrs: {
          as: preloadAs(asset),
          href: assetPath(asset, options.base),
          rel: "preload",
        },
        tag: "link",
      });
    }
  }

  return links;
}

function manifestEntry(manifest: AssetManifest, key: string): AssetManifestEntry {
  const entry = manifest[key];

  if (entry === undefined) {
    throw new Error(`Asset manifest entry not found: ${key}`);
  }

  return entry;
}

export function assetPath(file: string, base = "/"): string {
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const normalizedFile = file.startsWith("/") ? file.slice(1) : file;

  return `${normalizedBase}${normalizedFile}`;
}

function pushUniqueLink(
  seen: Set<string>,
  links: AssetLinkDescriptor[],
  link: AssetLinkDescriptor,
): void {
  const key = JSON.stringify(link);

  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  links.push(link);
}

function preloadAs(file: string): string {
  if (/\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(file)) {
    return "image";
  }

  if (/\.(?:woff2?|ttf|otf)$/i.test(file)) {
    return "font";
  }

  return "fetch";
}
