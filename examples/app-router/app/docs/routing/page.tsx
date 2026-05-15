// /docs/routing — second docs page. Demonstrates that named slots are
// per-page: this file's `slots.aside` overrides the docs overview's
// `slots.aside` and a "See also" box appears in the sidebar instead of
// the "Tip" box.

function RoutingAside() {
  return (
    <div class="docs-aside-box">
      <h4>See also</h4>
      <ul>
        <li><a href="/users/ada">/users/ada</a> (dynamic param)</li>
        <li><a href="/files/readme.md">/files/readme.md</a> (catch-all)</li>
        <li><a href="/contact">/contact</a> (route group)</li>
      </ul>
    </div>
  );
}

export const slots = {
  aside: RoutingAside,
};

export default function Page() {
  return (
    <article>
      <h1>Routing</h1>
      <p>
        <code>scanAppRoutes</code> builds the route table from{" "}
        <code>app/</code> like this:
      </p>
      <table class="route-table">
        <thead>
          <tr><th>file path</th><th>route path</th></tr>
        </thead>
        <tbody>
          <tr><td><code>app/page.tsx</code></td><td><code>/</code></td></tr>
          <tr><td><code>app/about/page.tsx</code></td><td><code>/about</code></td></tr>
          <tr><td><code>app/users/$id/page.tsx</code></td><td><code>/users/:id</code> (dynamic)</td></tr>
          <tr><td><code>app/files/$...path/page.tsx</code></td><td><code>/files/*</code> (catch-all)</td></tr>
          <tr><td><code>app/(marketing)/contact/page.tsx</code></td><td><code>/contact</code> (route group)</td></tr>
          <tr><td><code>app/api/time/route.ts</code></td><td><code>/api/time</code> (route handler)</td></tr>
        </tbody>
      </table>
      <p>
        Compare the sidebar with <a href="/docs">/docs</a> — same layout,
        but the "See also" box replaces the "Tip" box because each page
        supplies its own <code>slots.aside</code>.
      </p>
    </article>
  );
}
