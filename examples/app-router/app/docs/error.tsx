// Nested error boundary. If render or loader throws under /docs/…,
// this boundary renders instead of the root `error.tsx` because it is
// the nearest matching error.tsx in the route tree. HTTP status is 500.
export default function DocsError(props: { error: Error }) {
  return (
    <article>
      <h1>Docs error</h1>
      <p>
        Render or loader code threw under <code>/docs/…</code>. The
        nearest <code>error.tsx</code> wins, so you are looking at{" "}
        <code>app/docs/error.tsx</code>, not the root one.
      </p>
      <pre class="code-block">{props.error.message}</pre>
      <p>
        <a href="/docs">← Back to Docs</a>
      </p>
    </article>
  );
}
