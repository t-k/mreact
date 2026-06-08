import { notFound, type GenerateMetadataContext, type RouteMetadata } from "@reckona/mreact-router";
import { allSlugs, pageForSlug } from "../../content-registry.js";
import { DocPage } from "../../ui/DocPage.js";

export const prerender = true;

export function generateStaticParams(): Array<{ slug: string[] }> {
  return allSlugs().map((slug) => ({ slug: slug.split("/") }));
}

export function generateMetadata(
  context: GenerateMetadataContext<unknown, { slug: readonly string[] }>,
): RouteMetadata {
  const slug = context.params.slug.join("/");
  const page = pageForSlug(slug);

  if (page === undefined) {
    return {
      title: "Not Found | Mreact Docs",
      description: "The requested Mreact documentation page was not found.",
    };
  }

  return {
    title: `${page.title} | Mreact Docs`,
    description: page.description,
  };
}

export default function Page(props: { params: { slug: readonly string[] } }) {
  const slug = props.params.slug.join("/");
  const page = pageForSlug(slug);

  if (page === undefined) {
    notFound();
  }

  return <DocPage page={page} />;
}
