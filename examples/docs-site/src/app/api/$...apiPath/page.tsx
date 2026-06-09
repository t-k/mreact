import { notFound, type GenerateMetadataContext, type RouteMetadata } from "@reckona/mreact-router";
import { allApiPagePaths, apiPageForPath, ApiReferencePage } from "../../../api-reference-data.js";

export const prerender = true;

export function generateStaticParams(): Array<{ apiPath: string[] }> {
  return allApiPagePaths();
}

export function generateMetadata(
  context: GenerateMetadataContext<unknown, { apiPath: readonly string[] }>,
): RouteMetadata {
  const page = apiPageForPath(context.params.apiPath);

  if (page === undefined) {
    return {
      title: "API Reference | Mreact Docs",
      description: "Generated Mreact API reference.",
    };
  }

  return {
    title: `${page.title} | Mreact Docs`,
    description: "Generated Mreact API reference rendered from TypeDoc JSON.",
  };
}

export default function ApiDetailPage(props: { readonly params: { readonly apiPath: readonly string[] } }) {
  const page = apiPageForPath(props.params.apiPath);

  if (page === undefined) {
    notFound();
  }

  return <ApiReferencePage page={page} />;
}
