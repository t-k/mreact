export type AppFileConvention =
  | "apple-icon"
  | "icon"
  | "manifest"
  | "opengraph-image"
  | "robots"
  | "sitemap";

export type AppFileConventionRouteKind = "asset" | "metadata";

export interface AppFileConventionRouteInfo {
  convention: AppFileConvention;
  kind: AppFileConventionRouteKind;
  path: string;
}

const conventionByFilename = new Map<string, AppFileConventionRouteInfo>([
  ["robots.ts", { convention: "robots", kind: "metadata", path: "/robots.txt" }],
  ["robots.txt", { convention: "robots", kind: "asset", path: "/robots.txt" }],
  ["sitemap.ts", { convention: "sitemap", kind: "metadata", path: "/sitemap.xml" }],
  ["sitemap.xml", { convention: "sitemap", kind: "asset", path: "/sitemap.xml" }],
  ["manifest.ts", { convention: "manifest", kind: "metadata", path: "/manifest.webmanifest" }],
  [
    "manifest.webmanifest",
    { convention: "manifest", kind: "asset", path: "/manifest.webmanifest" },
  ],
  ["favicon.ico", { convention: "icon", kind: "asset", path: "/favicon.ico" }],
  ["icon.ico", { convention: "icon", kind: "asset", path: "/icon" }],
  ["icon.png", { convention: "icon", kind: "asset", path: "/icon" }],
  ["icon.jpg", { convention: "icon", kind: "asset", path: "/icon" }],
  ["icon.jpeg", { convention: "icon", kind: "asset", path: "/icon" }],
  ["icon.svg", { convention: "icon", kind: "asset", path: "/icon" }],
  ["apple-icon.png", { convention: "apple-icon", kind: "asset", path: "/apple-icon" }],
  ["apple-icon.jpg", { convention: "apple-icon", kind: "asset", path: "/apple-icon" }],
  ["apple-icon.jpeg", { convention: "apple-icon", kind: "asset", path: "/apple-icon" }],
  ["apple-icon.svg", { convention: "apple-icon", kind: "asset", path: "/apple-icon" }],
  [
    "opengraph-image.png",
    { convention: "opengraph-image", kind: "asset", path: "/opengraph-image" },
  ],
  [
    "opengraph-image.jpg",
    { convention: "opengraph-image", kind: "asset", path: "/opengraph-image" },
  ],
  [
    "opengraph-image.jpeg",
    { convention: "opengraph-image", kind: "asset", path: "/opengraph-image" },
  ],
  [
    "opengraph-image.svg",
    { convention: "opengraph-image", kind: "asset", path: "/opengraph-image" },
  ],
]);

export function appFileConventionForRootFilename(
  filename: string,
): AppFileConventionRouteInfo | undefined {
  return conventionByFilename.get(filename);
}

export function appFileConventionContentType(filename: string): string {
  if (filename.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (filename.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (filename.endsWith(".webmanifest")) return "application/manifest+json; charset=utf-8";
  if (filename.endsWith(".json")) return "application/json; charset=utf-8";
  if (filename.endsWith(".svg")) return "image/svg+xml";
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) return "image/jpeg";
  if (filename.endsWith(".ico")) return "image/x-icon";

  return "application/octet-stream";
}
