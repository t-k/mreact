// Rendered while the route's async work resolves. Collocated boundary
// files are auto-picked up by the router; no registration required.
export default function Loading() {
  return (
    <main>
      <h1>Streaming…</h1>
      <p class="muted">Shell is flushed; waiting for the async data.</p>
    </main>
  );
}
