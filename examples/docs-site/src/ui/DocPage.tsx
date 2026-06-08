import type { DocsPage } from "../content-registry.js";
import { navSectionForSlug, nextNavItem, previousNavItem } from "../nav.config.js";
import { sitePath } from "../site-path.js";

export function DocPage(props: { page: DocsPage }) {
  const section = navSectionForSlug(props.page.slug);
  const previous = previousNavItem(props.page.slug);
  const next = nextNavItem(props.page.slug);

  return (
    <>
      <article class="doc-article">
        {section === undefined ? undefined : <p class="eyebrow">{section}</p>}
        <div dangerouslySetInnerHTML={{ __html: props.page.html }} />
      </article>
      <nav aria-label="Pagination" class="doc-footer">
        <span>
          {previous === undefined ? undefined : (
            <a href={sitePath(previous.slug)}>Previous: {previous.text}</a>
          )}
        </span>
        <span>
          {next === undefined ? undefined : <a href={sitePath(next.slug)}>Next: {next.text}</a>}
        </span>
      </nav>
    </>
  );
}
