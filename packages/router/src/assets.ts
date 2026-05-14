export interface AssetManifestEntry {
  assets?: readonly string[];
  css?: readonly string[];
  file: string;
  imports?: readonly string[];
}

export type AssetManifest = Readonly<Record<string, AssetManifestEntry>>;

export interface AssetHelperOptions {
  base?: string;
}

export interface AssetLinkDescriptor {
  attrs: Record<string, string>;
  tag: "link";
}

export function assetHref(
  manifest: AssetManifest,
  key: string,
  options: AssetHelperOptions = {},
): string {
  return publicAssetPath(manifestEntry(manifest, key).file, options.base);
}

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
        href: publicAssetPath(entry.file, options.base),
        rel: entry.file.endsWith(".js") ? "modulepreload" : "preload",
      },
      tag: "link",
    });

    for (const css of entry.css ?? []) {
      pushUniqueLink(seen, links, {
        attrs: {
          href: publicAssetPath(css, options.base),
          rel: "stylesheet",
        },
        tag: "link",
      });
    }

    for (const asset of entry.assets ?? []) {
      pushUniqueLink(seen, links, {
        attrs: {
          as: preloadAs(asset),
          href: publicAssetPath(asset, options.base),
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

function publicAssetPath(file: string, base = "/"): string {
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
