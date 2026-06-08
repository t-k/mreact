const basePath = normalizeBasePath(import.meta.env.BASE_URL);

export function sitePath(slug = ""): string {
  const normalizedSlug = slug.replace(/^\/+|\/+$/g, "");
  if (normalizedSlug === "") {
    return `${basePath}/`;
  }
  return `${basePath}/${normalizedSlug}`;
}

function normalizeBasePath(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (trimmed === "" || trimmed === "/") {
    return "";
  }
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/g, "");
}
