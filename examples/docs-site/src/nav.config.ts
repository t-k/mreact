export interface NavItem {
  slug: string;
  text: string;
}

export interface NavGroup {
  items: readonly NavItem[];
  text: string;
}

export const sidebar: readonly NavGroup[] = [
  {
    text: "Overview",
    items: [
      { text: "Overview", slug: "" },
      { text: "Getting Started", slug: "getting-started" },
      { text: "Basics", slug: "guides/basics" },
      { text: "Examples", slug: "examples" },
      { text: "Benchmarks", slug: "benchmarks" },
    ],
  },
  {
    text: "Guides",
    items: [
      { text: "Project Structure", slug: "guides/project-structure" },
      { text: "App Router", slug: "guides/app-router" },
      { text: "Routing", slug: "guides/routing" },
      { text: "Layouts and Slots", slug: "guides/layouts-and-slots" },
      { text: "Server and Client Model", slug: "guides/server-and-client-model" },
      { text: "React Compatibility", slug: "guides/react-compatibility" },
      { text: "SSR and Streaming", slug: "guides/ssr-and-streaming" },
      { text: "Link and Navigation", slug: "guides/link-and-navigation" },
      { text: "Data Loading", slug: "guides/data-loading" },
      { text: "SSG and Static Export", slug: "guides/ssg-and-static-export" },
      { text: "Environment Variables", slug: "guides/environment-variables" },
      { text: "HTTP APIs", slug: "guides/http-apis" },
      { text: "Middleware", slug: "guides/middleware" },
      { text: "Server Actions", slug: "guides/server-actions" },
      { text: "Cache and Revalidation", slug: "guides/cache-and-revalidation" },
      { text: "Cookies and Sessions", slug: "guides/cookies-and-sessions" },
      { text: "Authentication", slug: "guides/authentication" },
      { text: "Forms and Validation", slug: "guides/forms-and-validation" },
      { text: "Testing", slug: "guides/testing" },
      { text: "Metadata and Head", slug: "guides/metadata-and-head" },
      { text: "CSS and Assets", slug: "guides/css-and-assets" },
      { text: "CSP", slug: "guides/csp" },
      { text: "External Scripts", slug: "guides/external-scripts" },
      { text: "File Uploads and CSRF", slug: "guides/file-uploads-and-csrf" },
    ],
  },
  {
    text: "Advanced",
    items: [
      { text: "MDX", slug: "guides/advanced/mdx" },
      { text: "i18n", slug: "guides/advanced/i18n" },
      { text: "Vite Plugin Integration", slug: "guides/advanced/vite-plugin-integration" },
    ],
  },
  {
    text: "Utilities",
    items: [
      { text: "Virtualized Lists (@reckona/mreact-virtual)", slug: "utilities/virtualized-lists" },
      { text: "Store (@reckona/mreact-store)", slug: "utilities/store" },
      { text: "Server State (@reckona/mreact-query)", slug: "utilities/server-state" },
    ],
  },
  {
    text: "Deployments",
    items: [
      { text: "Host Policy and Proxies", slug: "deployments/host-policy-and-proxies" },
      { text: "Source Maps", slug: "deployments/source-maps" },
      { text: "Logging and Diagnostics", slug: "deployments/logging-and-diagnostics" },
      { text: "CDN Assets", slug: "deployments/cdn-assets" },
      { text: "Cache Policy", slug: "deployments/cache-policy" },
      { text: "Cloudflare", slug: "deployments/cloudflare" },
      { text: "AWS Lambda", slug: "deployments/aws-lambda" },
      { text: "Container and Cloud Run", slug: "deployments/container-and-cloud-run" },
      { text: "Static Hosting", slug: "deployments/static-hosting" },
    ],
  },
  {
    text: "Reference",
    items: [
      { text: "CLI", slug: "reference/cli" },
      { text: "Config", slug: "reference/config" },
      { text: "Environment Variables Reference", slug: "reference/environment-variables" },
      { text: "Route Module Exports", slug: "reference/route-module-exports" },
      { text: "Route Handler Context", slug: "reference/route-handler-context" },
      { text: "Response Helpers", slug: "reference/response-helpers" },
      { text: "Adapters", slug: "reference/adapters" },
      { text: "Metadata API", slug: "reference/metadata-api" },
      { text: "Auth API", slug: "reference/auth-api" },
      { text: "Cache API", slug: "reference/cache-api" },
      { text: "API Reference", slug: "reference/api" },
    ],
  },
] as const;

export const flatNav: readonly NavItem[] = sidebar.flatMap((group) => group.items);

export function navItemForSlug(slug: string): NavItem | undefined {
  return flatNav.find((item) => item.slug === slug);
}

export function navSectionForSlug(slug: string): string | undefined {
  return sidebar.find((group) => group.items.some((item) => item.slug === slug))?.text;
}

export function nextNavItem(slug: string): NavItem | undefined {
  const index = flatNav.findIndex((item) => item.slug === slug);
  return index < 0 ? undefined : flatNav[index + 1];
}

export function previousNavItem(slug: string): NavItem | undefined {
  const index = flatNav.findIndex((item) => item.slug === slug);
  return index <= 0 ? undefined : flatNav[index - 1];
}
