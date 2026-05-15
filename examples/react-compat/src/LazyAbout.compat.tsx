// Loaded on demand via lazy import. The compat runtime captures the
// pending thenable at the nearest <Suspense> boundary and renders the
// fallback until the chunk resolves.
export default function LazyAbout() {
  return (
    <section>
      <h2>About this demo</h2>
      <p>
        The component you just rendered was dynamically imported. Open
        DevTools → Network and reload to confirm{" "}
        <code>LazyAbout.compat.tsx</code> is fetched on demand.
      </p>
    </section>
  );
}
