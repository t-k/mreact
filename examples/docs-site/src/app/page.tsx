import { pageForSlug } from "../content-registry.js";
import { DocPage } from "../ui/DocPage.js";

export const prerender = true;

export const metadata = {
  title: "Overview | Mreact Docs",
  description: "Start here for Mreact's purpose, status, and documentation map.",
};

export default function HomePage() {
  const page = pageForSlug("overview");

  if (page === undefined) {
    return <main>Missing overview.</main>;
  }

  return <DocPage page={page} />;
}
