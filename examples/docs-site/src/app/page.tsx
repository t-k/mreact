import { DocPage } from "../ui/DocPage.js";

export const prerender = true;

export const metadata = {
  title: "Overview | Mreact Docs",
  description: "Why Mreact exists, what it optimizes for, and how experimental it is today.",
};

export default async function HomePage() {
  const { pageForSlug } = await import("../content-registry.js");
  const page = await pageForSlug("");

  if (page === undefined) {
    return <p>Missing overview.</p>;
  }

  return <DocPage page={page} />;
}
