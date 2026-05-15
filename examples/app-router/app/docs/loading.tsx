// Nested loading boundary. Flushed before the loader resolves when the
// page exports both `stream = true` and an async `loader()`. The router
// swaps it for the real content via an OOB fragment once the loader
// completes.
export default function Loading() {
  return (
    <p class="docs-loading">
      <em>Loading…</em>{" "}
      <span class="muted">(sent as an OOB placeholder while the loader runs)</span>
    </p>
  );
}
