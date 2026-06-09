import { renderToString, type ReactElement } from "@reckona/mreact";

import overview, * as overviewMeta from "./content/overview.mdx";
import benchmarks, * as benchmarksMeta from "./content/benchmarks.mdx";
import gettingStarted, * as gettingStartedMeta from "./content/getting-started.mdx";
import guidesAppRouter, * as guidesAppRouterMeta from "./content/guides/app-router.mdx";
import guidesAuthentication, * as guidesAuthenticationMeta from "./content/guides/authentication.mdx";
import guidesCacheAndRevalidation, * as guidesCacheAndRevalidationMeta from "./content/guides/cache-and-revalidation.mdx";
import guidesCookiesAndSessions, * as guidesCookiesAndSessionsMeta from "./content/guides/cookies-and-sessions.mdx";
import guidesCsp, * as guidesCspMeta from "./content/guides/csp.mdx";
import guidesCssAndAssets, * as guidesCssAndAssetsMeta from "./content/guides/css-and-assets.mdx";
import guidesDataLoading, * as guidesDataLoadingMeta from "./content/guides/data-loading.mdx";
import guidesEnvironmentVariables, * as guidesEnvironmentVariablesMeta from "./content/guides/environment-variables.mdx";
import guidesExternalScripts, * as guidesExternalScriptsMeta from "./content/guides/external-scripts.mdx";
import guidesFileUploadsAndCsrf, * as guidesFileUploadsAndCsrfMeta from "./content/guides/file-uploads-and-csrf.mdx";
import guidesFormsAndValidation, * as guidesFormsAndValidationMeta from "./content/guides/forms-and-validation.mdx";
import guidesHttpApis, * as guidesHttpApisMeta from "./content/guides/http-apis.mdx";
import guidesLayoutsAndSlots, * as guidesLayoutsAndSlotsMeta from "./content/guides/layouts-and-slots.mdx";
import guidesLinkAndNavigation, * as guidesLinkAndNavigationMeta from "./content/guides/link-and-navigation.mdx";
import guidesMetadataAndHead, * as guidesMetadataAndHeadMeta from "./content/guides/metadata-and-head.mdx";
import guidesMiddleware, * as guidesMiddlewareMeta from "./content/guides/middleware.mdx";
import guidesProjectStructure, * as guidesProjectStructureMeta from "./content/guides/project-structure.mdx";
import guidesReactCompatibility, * as guidesReactCompatibilityMeta from "./content/guides/react-compatibility.mdx";
import guidesRouting, * as guidesRoutingMeta from "./content/guides/routing.mdx";
import guidesServerActions, * as guidesServerActionsMeta from "./content/guides/server-actions.mdx";
import guidesServerAndClientModel, * as guidesServerAndClientModelMeta from "./content/guides/server-and-client-model.mdx";
import guidesSsgAndStaticExport, * as guidesSsgAndStaticExportMeta from "./content/guides/ssg-and-static-export.mdx";
import guidesSsrAndStreaming, * as guidesSsrAndStreamingMeta from "./content/guides/ssr-and-streaming.mdx";
import guidesTesting, * as guidesTestingMeta from "./content/guides/testing.mdx";
import guidesAdvancedI18n, * as guidesAdvancedI18nMeta from "./content/guides/advanced/i18n.mdx";
import guidesAdvancedMdx, * as guidesAdvancedMdxMeta from "./content/guides/advanced/mdx.mdx";
import guidesAdvancedVitePluginIntegration, * as guidesAdvancedVitePluginIntegrationMeta from "./content/guides/advanced/vite-plugin-integration.mdx";
import deploymentsAwsLambda, * as deploymentsAwsLambdaMeta from "./content/deployments/aws-lambda.mdx";
import deploymentsCachePolicy, * as deploymentsCachePolicyMeta from "./content/deployments/cache-policy.mdx";
import deploymentsCdnAssets, * as deploymentsCdnAssetsMeta from "./content/deployments/cdn-assets.mdx";
import deploymentsCloudflare, * as deploymentsCloudflareMeta from "./content/deployments/cloudflare.mdx";
import deploymentsContainerAndCloudRun, * as deploymentsContainerAndCloudRunMeta from "./content/deployments/container-and-cloud-run.mdx";
import deploymentsHostPolicyAndProxies, * as deploymentsHostPolicyAndProxiesMeta from "./content/deployments/host-policy-and-proxies.mdx";
import deploymentsLoggingAndDiagnostics, * as deploymentsLoggingAndDiagnosticsMeta from "./content/deployments/logging-and-diagnostics.mdx";
import deploymentsSourceMaps, * as deploymentsSourceMapsMeta from "./content/deployments/source-maps.mdx";
import deploymentsStaticHosting, * as deploymentsStaticHostingMeta from "./content/deployments/static-hosting.mdx";
import examples, * as examplesMeta from "./content/examples.mdx";
import referenceAdapters, * as referenceAdaptersMeta from "./content/reference/adapters.mdx";
import referenceAuthApi, * as referenceAuthApiMeta from "./content/reference/auth-api.mdx";
import referenceCacheApi, * as referenceCacheApiMeta from "./content/reference/cache-api.mdx";
import referenceCli, * as referenceCliMeta from "./content/reference/cli.mdx";
import referenceConfig, * as referenceConfigMeta from "./content/reference/config.mdx";
import referenceEnvironmentVariables, * as referenceEnvironmentVariablesMeta from "./content/reference/environment-variables.mdx";
import referenceGeneratedApi, * as referenceGeneratedApiMeta from "./content/reference/generated-api.mdx";
import referenceMetadataApi, * as referenceMetadataApiMeta from "./content/reference/metadata-api.mdx";
import referenceResponseHelpers, * as referenceResponseHelpersMeta from "./content/reference/response-helpers.mdx";
import referenceRouteHandlerContext, * as referenceRouteHandlerContextMeta from "./content/reference/route-handler-context.mdx";
import referenceRouteModuleExports, * as referenceRouteModuleExportsMeta from "./content/reference/route-module-exports.mdx";
import utilitiesServerState, * as utilitiesServerStateMeta from "./content/utilities/server-state.mdx";
import utilitiesStore, * as utilitiesStoreMeta from "./content/utilities/store.mdx";
import utilitiesVirtualizedLists, * as utilitiesVirtualizedListsMeta from "./content/utilities/virtualized-lists.mdx";
import { BenchmarkResults } from "./ui/BenchmarkResults.js";

export interface DocsPage {
  description: string;
  html: string;
  slug: string;
  title: string;
}

function page(
  slug: string,
  Content: () => ReactElement | null,
  meta: { description?: string | undefined; title?: string | undefined },
  options?: { readonly replacements?: readonly HtmlReplacement[] | undefined },
): DocsPage {
  const renderedHtml = applyHtmlReplacements(renderToString(Content), options?.replacements ?? []);

  return {
    description: meta.description ?? "Mreact documentation.",
    html: enhanceCodeBlocks(renderedHtml),
    slug,
    title: meta.title ?? slug,
  };
}

interface HtmlReplacement {
  readonly html: string;
  readonly marker: string;
}

function applyHtmlReplacements(html: string, replacements: readonly HtmlReplacement[]): string {
  return replacements.reduce((currentHtml, replacement) => {
    return currentHtml.replace(replacement.marker, replacement.html);
  }, html);
}

function enhanceCodeBlocks(html: string): string {
  return html.replaceAll(/<pre\b([^>]*)>([\s\S]*?)<\/pre>/g, (_match, preAttributes: string, preBody: string) => {
    const highlightedPreBody = highlightFileTreeCodeBlock(preBody);
    const fileTreeBlockClass = "code-block is-file-tree";
    const blockClass = highlightedPreBody === preBody ? "code-block" : fileTreeBlockClass;

    return `<div class="${blockClass}"><button class="code-copy" type="button">Copy</button><pre${preAttributes}>${highlightedPreBody}</pre></div>`;
  });
}

function highlightFileTreeCodeBlock(preBody: string): string {
  const codeMatch = preBody.match(/^<code([^>]*)>([\s\S]*?)<\/code>$/);
  if (codeMatch === null) {
    return preBody;
  }

  const attributes = codeMatch[1];
  const codeBody = codeMatch[2];
  if (attributes === undefined || codeBody === undefined) {
    return preBody;
  }

  if (!attributes.includes("language-text")) {
    return preBody;
  }

  const highlightedShikiCodeBody = highlightShikiFileTreeCodeBlock(codeBody);
  if (highlightedShikiCodeBody !== undefined) {
    return `<code${attributes}>${highlightedShikiCodeBody}</code>`;
  }

  if (!isFileTree(codeBody)) {
    return preBody;
  }

  return `<code${attributes}>${codeBody
    .split("\n")
    .map((line) => highlightFileTreeLine(line))
    .join("\n")}</code>`;
}

function highlightShikiFileTreeCodeBlock(codeBody: string): string | undefined {
  const lineMatches = [...codeBody.matchAll(/<span class="line"><span>(.*?)<\/span><\/span>/g)];
  if (lineMatches.length === 0) {
    return undefined;
  }

  const lines = lineMatches.map((match) => match[1] ?? "");
  if (!isFileTree(lines.join("\n"))) {
    return undefined;
  }

  return codeBody.replaceAll(/<span class="line"><span>(.*?)<\/span><\/span>/g, (_match, line: string) => {
    return `<span class="line">${highlightFileTreeLine(line)}</span>`;
  });
}

function isFileTree(codeBody: string): boolean {
  const lines = codeBody.split("\n").filter((line) => line.trim() !== "");
  if (lines.length < 3) {
    return false;
  }

  const [rootLine] = lines;
  if (rootLine === undefined) {
    return false;
  }

  return rootLine.endsWith("/") && lines.some((line) => /^ {2,}\S/.test(line));
}

function highlightFileTreeLine(line: string): string {
  const lineMatch = line.match(/^(\s*)(\S.*)$/);
  if (lineMatch === null) {
    return line;
  }

  const indent = lineMatch[1];
  const path = lineMatch[2];
  if (indent === undefined || path === undefined) {
    return line;
  }

  return `${indent}<span class="${fileTreePathClass(path)}">${path}</span>`;
}

function fileTreePathClass(path: string): string {
  if (path.startsWith("$")) {
    return "tree-path is-param";
  }

  if (path.endsWith("/")) {
    return "tree-path is-dir";
  }

  return "tree-path is-file";
}

export const docsPages = [
  page("", overview, overviewMeta),
  page("benchmarks", benchmarks, benchmarksMeta, {
    replacements: [
      {
        html: renderToString(BenchmarkResults),
        marker: "<p>BENCHMARK_RESULTS_PLACEHOLDER</p>",
      },
    ],
  }),
  page("getting-started", gettingStarted, gettingStartedMeta),
  page("guides/app-router", guidesAppRouter, guidesAppRouterMeta),
  page("guides/project-structure", guidesProjectStructure, guidesProjectStructureMeta),
  page("guides/environment-variables", guidesEnvironmentVariables, guidesEnvironmentVariablesMeta),
  page("guides/routing", guidesRouting, guidesRoutingMeta),
  page("guides/layouts-and-slots", guidesLayoutsAndSlots, guidesLayoutsAndSlotsMeta),
  page("guides/server-and-client-model", guidesServerAndClientModel, guidesServerAndClientModelMeta),
  page("guides/react-compatibility", guidesReactCompatibility, guidesReactCompatibilityMeta),
  page("guides/ssr-and-streaming", guidesSsrAndStreaming, guidesSsrAndStreamingMeta),
  page("guides/ssg-and-static-export", guidesSsgAndStaticExport, guidesSsgAndStaticExportMeta),
  page("guides/link-and-navigation", guidesLinkAndNavigation, guidesLinkAndNavigationMeta),
  page("guides/data-loading", guidesDataLoading, guidesDataLoadingMeta),
  page("guides/http-apis", guidesHttpApis, guidesHttpApisMeta),
  page("guides/middleware", guidesMiddleware, guidesMiddlewareMeta),
  page("guides/server-actions", guidesServerActions, guidesServerActionsMeta),
  page("guides/cache-and-revalidation", guidesCacheAndRevalidation, guidesCacheAndRevalidationMeta),
  page("guides/cookies-and-sessions", guidesCookiesAndSessions, guidesCookiesAndSessionsMeta),
  page("guides/authentication", guidesAuthentication, guidesAuthenticationMeta),
  page("guides/forms-and-validation", guidesFormsAndValidation, guidesFormsAndValidationMeta),
  page("guides/testing", guidesTesting, guidesTestingMeta),
  page("guides/metadata-and-head", guidesMetadataAndHead, guidesMetadataAndHeadMeta),
  page("guides/css-and-assets", guidesCssAndAssets, guidesCssAndAssetsMeta),
  page("guides/csp", guidesCsp, guidesCspMeta),
  page("guides/external-scripts", guidesExternalScripts, guidesExternalScriptsMeta),
  page("guides/file-uploads-and-csrf", guidesFileUploadsAndCsrf, guidesFileUploadsAndCsrfMeta),
  page("guides/advanced/mdx", guidesAdvancedMdx, guidesAdvancedMdxMeta),
  page("guides/advanced/i18n", guidesAdvancedI18n, guidesAdvancedI18nMeta),
  page(
    "guides/advanced/vite-plugin-integration",
    guidesAdvancedVitePluginIntegration,
    guidesAdvancedVitePluginIntegrationMeta,
  ),
  page("deployments/host-policy-and-proxies", deploymentsHostPolicyAndProxies, deploymentsHostPolicyAndProxiesMeta),
  page("deployments/source-maps", deploymentsSourceMaps, deploymentsSourceMapsMeta),
  page("deployments/logging-and-diagnostics", deploymentsLoggingAndDiagnostics, deploymentsLoggingAndDiagnosticsMeta),
  page("deployments/cdn-assets", deploymentsCdnAssets, deploymentsCdnAssetsMeta),
  page("deployments/cache-policy", deploymentsCachePolicy, deploymentsCachePolicyMeta),
  page("deployments/cloudflare", deploymentsCloudflare, deploymentsCloudflareMeta),
  page("deployments/aws-lambda", deploymentsAwsLambda, deploymentsAwsLambdaMeta),
  page("deployments/container-and-cloud-run", deploymentsContainerAndCloudRun, deploymentsContainerAndCloudRunMeta),
  page("deployments/static-hosting", deploymentsStaticHosting, deploymentsStaticHostingMeta),
  page("examples", examples, examplesMeta),
  page("utilities/virtualized-lists", utilitiesVirtualizedLists, utilitiesVirtualizedListsMeta),
  page("utilities/store", utilitiesStore, utilitiesStoreMeta),
  page("utilities/server-state", utilitiesServerState, utilitiesServerStateMeta),
  page("reference/cli", referenceCli, referenceCliMeta),
  page("reference/config", referenceConfig, referenceConfigMeta),
  page("reference/environment-variables", referenceEnvironmentVariables, referenceEnvironmentVariablesMeta),
  page("reference/route-module-exports", referenceRouteModuleExports, referenceRouteModuleExportsMeta),
  page("reference/route-handler-context", referenceRouteHandlerContext, referenceRouteHandlerContextMeta),
  page("reference/response-helpers", referenceResponseHelpers, referenceResponseHelpersMeta),
  page("reference/adapters", referenceAdapters, referenceAdaptersMeta),
  page("reference/metadata-api", referenceMetadataApi, referenceMetadataApiMeta),
  page("reference/auth-api", referenceAuthApi, referenceAuthApiMeta),
  page("reference/cache-api", referenceCacheApi, referenceCacheApiMeta),
  page("reference/generated-api", referenceGeneratedApi, referenceGeneratedApiMeta),
] as const satisfies readonly DocsPage[];

export function pageForSlug(slug: string): DocsPage | undefined {
  return docsPages.find((page) => page.slug === slug);
}

export function allSlugs(): readonly string[] {
  return docsPages.map((page) => page.slug).filter((slug) => slug !== "");
}
