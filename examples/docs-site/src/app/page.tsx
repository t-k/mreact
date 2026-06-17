import { pageForSlug } from "../content-registry.js";
import { DocPage } from "../ui/DocPage.js";

export const prerender = true;

export const metadata = {
  title: "Overview | Mreact Docs",
  description: "Why Mreact exists, what it optimizes for, and how experimental it is today.",
};

export default function HomePage() {
  const page = pageForSlug("");

  if (page === undefined) {
    return <p>Missing overview.</p>;
  }

  return <DocPage page={page} />;
}
