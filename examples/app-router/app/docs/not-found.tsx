// Nested 404 boundary. An unmatched path under /docs/… renders this
// instead of the root `not-found.tsx`, again because nearest wins.
// HTTP status is 404.
export default function DocsNotFound() {
  return (
    <article>
      <h1>Docs page not found</h1>
      <p>
        That URL is not registered under <code>/docs/</code>. The
        nearest <code>not-found.tsx</code> wins — this 404 is rendered
        with the docs sidebar still wrapping it, because it lives at{" "}
        <code>app/docs/not-found.tsx</code>.
      </p>
      <ul>
        <li><a href="/docs">Overview</a></li>
        <li><a href="/docs/routing">Routing</a></li>
      </ul>
    </article>
  );
}
