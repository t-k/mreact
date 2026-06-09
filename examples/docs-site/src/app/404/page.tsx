import { sitePath } from "../../site-path.js";

export const prerender = true;

export const metadata = {
  title: "Not Found | Mreact Docs",
  description: "The requested Mreact documentation page was not found.",
};

export default function NotFoundPage() {
  return (
    <article class="doc-article">
      <p class="eyebrow">Not Found</p>
      <h1>Page not found</h1>
      <p>The page you requested does not exist. Use the navigation to return to the docs.</p>
      <p>
        <a href={sitePath()}>Go to overview</a>
      </p>
    </article>
  );
}
