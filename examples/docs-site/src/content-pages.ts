export interface DocsPageEntry {
  readonly file: string;
  readonly load?: (() => Promise<DocsPageModule>) | undefined;
  readonly options?: {
    readonly replacements?: (() => Promise<readonly HtmlReplacement[]> | readonly HtmlReplacement[]) | undefined;
  } | undefined;
  readonly slug: string;
}

export interface HtmlReplacement {
  readonly html: string;
  readonly marker: string;
}

export interface DocsPageModule {
  readonly default: () => import("@reckona/mreact").ReactElement | null;
  readonly description?: string | undefined;
  readonly title?: string | undefined;
}

function page(
  slug: string,
  file: string,
  options?: DocsPageEntry["options"],
): DocsPageEntry {
  return { file, options, slug };
}

export const docsPageEntries = [
  page("", "overview.mdx"),
  page("benchmarks", "benchmarks.mdx", {
    replacements: async () => {
      const [{ renderToString }, { BenchmarkResults }] = await Promise.all([
        import("@reckona/mreact"),
        import("./ui/BenchmarkResults.js"),
      ]);

      return [
        {
          html: renderToString(BenchmarkResults),
          marker: "<p>BENCHMARK_RESULTS_PLACEHOLDER</p>",
        },
      ];
    },
  }),
  page("getting-started", "getting-started.mdx"),
  page("guides/basics", "guides/basics.mdx"),
  page("guides/app-router", "guides/app-router.mdx"),
  page("guides/project-structure", "guides/project-structure.mdx"),
  page("guides/environment-variables", "guides/environment-variables.mdx"),
  page("guides/routing", "guides/routing.mdx"),
  page("guides/layouts-and-slots", "guides/layouts-and-slots.mdx"),
  page("guides/server-and-client-model", "guides/server-and-client-model.mdx"),
  page("guides/react-compatibility", "guides/react-compatibility.mdx"),
  page("guides/ssr-and-streaming", "guides/ssr-and-streaming.mdx"),
  page("guides/ssg-and-static-export", "guides/ssg-and-static-export.mdx"),
  page("guides/link-and-navigation", "guides/link-and-navigation.mdx"),
  page("guides/data-loading", "guides/data-loading.mdx"),
  page("guides/http-apis", "guides/http-apis.mdx"),
  page("guides/middleware", "guides/middleware.mdx"),
  page("guides/server-actions", "guides/server-actions.mdx"),
  page("guides/cache-and-revalidation", "guides/cache-and-revalidation.mdx"),
  page("guides/cookies-and-sessions", "guides/cookies-and-sessions.mdx"),
  page("guides/authentication", "guides/authentication.mdx"),
  page("guides/forms-and-validation", "guides/forms-and-validation.mdx"),
  page("guides/testing", "guides/testing.mdx"),
  page("guides/metadata-and-head", "guides/metadata-and-head.mdx"),
  page("guides/css-and-assets", "guides/css-and-assets.mdx"),
  page("guides/csp", "guides/csp.mdx"),
  page("guides/external-scripts", "guides/external-scripts.mdx"),
  page("guides/file-uploads-and-csrf", "guides/file-uploads-and-csrf.mdx"),
  page("guides/advanced/mdx", "guides/advanced/mdx.mdx"),
  page("guides/advanced/i18n", "guides/advanced/i18n.mdx"),
  page("guides/advanced/vite-plugin-integration", "guides/advanced/vite-plugin-integration.mdx"),
  page("deployments/host-policy-and-proxies", "deployments/host-policy-and-proxies.mdx"),
  page("deployments/source-maps", "deployments/source-maps.mdx"),
  page("deployments/logging-and-diagnostics", "deployments/logging-and-diagnostics.mdx"),
  page("deployments/cdn-assets", "deployments/cdn-assets.mdx"),
  page("deployments/cache-policy", "deployments/cache-policy.mdx"),
  page("deployments/cloudflare", "deployments/cloudflare.mdx"),
  page("deployments/aws-lambda", "deployments/aws-lambda.mdx"),
  page("deployments/container-and-cloud-run", "deployments/container-and-cloud-run.mdx"),
  page("deployments/static-hosting", "deployments/static-hosting.mdx"),
  page("examples", "examples.mdx"),
  page("utilities/virtualized-lists", "utilities/virtualized-lists.mdx"),
  page("utilities/store", "utilities/store.mdx"),
  page("utilities/server-state", "utilities/server-state.mdx"),
  page("reference/cli", "reference/cli.mdx"),
  page("reference/config", "reference/config.mdx"),
  page("reference/environment-variables", "reference/environment-variables.mdx"),
  page("reference/route-module-exports", "reference/route-module-exports.mdx"),
  page("reference/route-handler-context", "reference/route-handler-context.mdx"),
  page("reference/response-helpers", "reference/response-helpers.mdx"),
  page("reference/adapters", "reference/adapters.mdx"),
  page("reference/metadata-api", "reference/metadata-api.mdx"),
  page("reference/auth-api", "reference/auth-api.mdx"),
  page("reference/cache-api", "reference/cache-api.mdx"),
  page("reference/api", "reference/api.mdx"),
] as const satisfies readonly DocsPageEntry[];
