import { renderToString, type ReactElement } from "@reckona/mreact";

import overview, * as overviewMeta from "./content/overview.mdx";
import benchmarks, * as benchmarksMeta from "./content/benchmarks.mdx";
import gettingStarted, * as gettingStartedMeta from "./content/getting-started.mdx";
import guidesAppRouter, * as guidesAppRouterMeta from "./content/guides/app-router.mdx";
import guidesAuthentication, * as guidesAuthenticationMeta from "./content/guides/authentication.mdx";
import guidesCacheAndRevalidation, * as guidesCacheAndRevalidationMeta from "./content/guides/cache-and-revalidation.mdx";
import guidesClientBoundaries, * as guidesClientBoundariesMeta from "./content/guides/client-boundaries.mdx";
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
import guidesRouteHandlers, * as guidesRouteHandlersMeta from "./content/guides/route-handlers.mdx";
import guidesRouting, * as guidesRoutingMeta from "./content/guides/routing.mdx";
import guidesServerActions, * as guidesServerActionsMeta from "./content/guides/server-actions.mdx";
import guidesServerAndClientModel, * as guidesServerAndClientModelMeta from "./content/guides/server-and-client-model.mdx";
import guidesSsgAndStaticExport, * as guidesSsgAndStaticExportMeta from "./content/guides/ssg-and-static-export.mdx";
import guidesSsrAndStreaming, * as guidesSsrAndStreamingMeta from "./content/guides/ssr-and-streaming.mdx";
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
import deploymentsProductionChecklist, * as deploymentsProductionChecklistMeta from "./content/deployments/production-checklist.mdx";
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
): DocsPage {
  return {
    description: meta.description ?? "Mreact documentation.",
    html: enhanceCodeBlocks(renderToString(Content)),
    slug,
    title: meta.title ?? slug,
  };
}

function enhanceCodeBlocks(html: string): string {
  return html.replaceAll(/<pre>([\s\S]*?)<\/pre>/g, (_match, preBody: string) => {
    return `<div class="code-block"><button class="code-copy" type="button">Copy</button><pre>${preBody}</pre></div>`;
  });
}

export const docsPages = [
  page("", overview, overviewMeta),
  page("benchmarks", benchmarks, benchmarksMeta),
  page("getting-started", gettingStarted, gettingStartedMeta),
  page("guides/app-router", guidesAppRouter, guidesAppRouterMeta),
  page("guides/project-structure", guidesProjectStructure, guidesProjectStructureMeta),
  page("guides/environment-variables", guidesEnvironmentVariables, guidesEnvironmentVariablesMeta),
  page("guides/routing", guidesRouting, guidesRoutingMeta),
  page("guides/layouts-and-slots", guidesLayoutsAndSlots, guidesLayoutsAndSlotsMeta),
  page("guides/server-and-client-model", guidesServerAndClientModel, guidesServerAndClientModelMeta),
  page("guides/ssr-and-streaming", guidesSsrAndStreaming, guidesSsrAndStreamingMeta),
  page("guides/ssg-and-static-export", guidesSsgAndStaticExport, guidesSsgAndStaticExportMeta),
  page("guides/client-boundaries", guidesClientBoundaries, guidesClientBoundariesMeta),
  page("guides/link-and-navigation", guidesLinkAndNavigation, guidesLinkAndNavigationMeta),
  page("guides/data-loading", guidesDataLoading, guidesDataLoadingMeta),
  page("guides/http-apis", guidesHttpApis, guidesHttpApisMeta),
  page("guides/route-handlers", guidesRouteHandlers, guidesRouteHandlersMeta),
  page("guides/middleware", guidesMiddleware, guidesMiddlewareMeta),
  page("guides/server-actions", guidesServerActions, guidesServerActionsMeta),
  page("guides/cache-and-revalidation", guidesCacheAndRevalidation, guidesCacheAndRevalidationMeta),
  page("guides/cookies-and-sessions", guidesCookiesAndSessions, guidesCookiesAndSessionsMeta),
  page("guides/authentication", guidesAuthentication, guidesAuthenticationMeta),
  page("guides/forms-and-validation", guidesFormsAndValidation, guidesFormsAndValidationMeta),
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
  page("deployments/production-checklist", deploymentsProductionChecklist, deploymentsProductionChecklistMeta),
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
