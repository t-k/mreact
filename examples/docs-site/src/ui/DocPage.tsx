import { Link } from "@reckona/mreact-router/link";
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
            <Link href={sitePath(previous.slug)} prefetch="intent">
              Previous: {previous.text}
            </Link>
          )}
        </span>
        <span>
          {next === undefined ? undefined : (
            <Link href={sitePath(next.slug)} prefetch="viewport">Next: {next.text}</Link>
          )}
        </span>
      </nav>
    </>
  );
}
