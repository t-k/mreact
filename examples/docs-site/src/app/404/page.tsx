export const prerender = true;

export const metadata = {
  title: "Not Found | mreact Docs",
  description: "The requested mreact documentation page was not found.",
};

export default function NotFoundPage() {
  return (
    <article class="doc-article">
      <p class="eyebrow">Not Found</p>
      <h1>Page not found</h1>
      <p>The page you requested does not exist. Use the navigation to return to the docs.</p>
      <p>
        <a href="/">Go to overview</a>
      </p>
    </article>
  );
}
