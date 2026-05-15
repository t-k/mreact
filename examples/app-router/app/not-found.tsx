// Root 404 boundary. Triggered when a request does not match any
// page.tsx, or when a loader calls notFound(). HTTP status is 404.
export default function NotFound() {
  return (
    <main>
      <h1>Not found.</h1>
      <p>That URL is not registered with this app router.</p>
      <ul>
        <li><a href="/">/ — Home</a></li>
        <li><a href="/docs">/docs — nested layout tour</a></li>
        <li><a href="/counter">/counter — client interactivity</a></li>
        <li><a href="/files/example.txt">/files/example.txt — catch-all example</a></li>
      </ul>
      <p class="muted">HTTP 404 — see <code>app/not-found.tsx</code>.</p>
    </main>
  );
}
