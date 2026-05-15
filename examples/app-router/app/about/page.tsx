// /about — prerendered static page with metadata.
//
// `export const prerender = true` runs this page once at build time and
// stores the resulting HTML as an artifact; production serves the
// artifact without running this code again. The metadata export
// populates <head> with title, description, OpenGraph, robots, icons,
// and viewport.

export const prerender = true;

export const metadata = {
  title: "About — mreact App Router",
  description:
    "A prerendered static page that demonstrates the metadata export.",
  openGraph: {
    title: "About — mreact App Router",
    description: "A prerendered page demonstrating the metadata API.",
    type: "website",
  },
  robots: { index: true, follow: true },
  viewport: { width: "device-width", initialScale: 1 },
};

export default function Page() {
  return (
    <main>
      <h1>About</h1>
      <p>
        This page is built once. The router records the rendered HTML in
        the <code>prerenderedRoutes</code> manifest and replays it for
        every request in production. View source — there is no client
        bundle reference for this URL.
      </p>
      <p>
        <code>@reckona/mreact-router</code> scans <code>app/</code> for
        the following conventions:
      </p>
      <ul>
        <li><code>page.tsx</code> — the page component for this URL.</li>
        <li><code>layout.tsx</code> — wraps every page in the same directory and below via <code>&lt;Slot /&gt;</code>.</li>
        <li><code>template.tsx</code> — wraps inside the layout but remounts on every navigation.</li>
        <li><code>loading.tsx</code> — fallback rendered while an async loader resolves under streaming.</li>
        <li><code>error.tsx</code> / <code>not-found.tsx</code> — 500 and 404 boundaries; the nearest one wins.</li>
        <li><code>route.ts</code> — HTTP handler with <code>GET</code> / <code>POST</code> / <code>ALL</code> named exports.</li>
        <li><code>$param</code> directory — dynamic segment (<code>params.param</code>).</li>
        <li><code>$...name</code> directory — catch-all segment (joined URL stored in <code>params.name</code>).</li>
        <li><code>(group)</code> directory — route group that does not appear in the URL.</li>
      </ul>
      <p class="muted">
        See <code>app/about/page.tsx</code> for the metadata export
        shape (Next-compatible).
      </p>
      <p>
        <a href="/">← Back to Home</a>
      </p>
    </main>
  );
}
