import { notFound, type GenerateMetadataContext, type RouteMetadata } from "@reckona/mreact-router";
import { DocPage } from "../../ui/DocPage.js";

export const prerender = true;

export async function generateStaticParams(): Promise<Array<{ slug: string[] }>> {
  const { allSlugs } = await import("../../content-metadata.js");

  return allSlugs().map((slug) => ({ slug: slug.split("/") }));
}

export async function generateMetadata(
  context: GenerateMetadataContext<unknown, { slug: readonly string[] }>,
): Promise<RouteMetadata> {
  const { metadataForSlug } = await import("../../content-metadata.js");
  const slug = context.params.slug.join("/");
  const metadata = metadataForSlug(slug);

  if (metadata === undefined) {
    return {
      title: "Not Found | Mreact Docs",
      description: "The requested Mreact documentation page was not found.",
    };
  }

  return {
    title: `${metadata.title} | Mreact Docs`,
    description: metadata.description,
  };
}

export default async function Page(props: { params: { slug: readonly string[] } }) {
  const { pageForSlug } = await import("../../content-registry.js");
  const slug = props.params.slug.join("/");
  const page = await pageForSlug(slug);

  if (page === undefined) {
    notFound();
  }

  return <DocPage page={page} />;
}
