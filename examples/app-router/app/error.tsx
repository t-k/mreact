// Root error boundary. Catches any error thrown during render or by a
// loader / action, unless a nearer error.tsx is collocated with the
// failing route. HTTP status is 500.
export default function ErrorPage(props: { error: Error }) {
  return (
    <main>
      <h1>Something went wrong.</h1>
      <p>An error was raised while rendering this page.</p>
      <pre class="code-block">{props.error.message}</pre>
      <p>
        <a href="/">← Back to Home</a>
      </p>
      <p class="muted">HTTP 500 — see <code>app/error.tsx</code>.</p>
    </main>
  );
}
