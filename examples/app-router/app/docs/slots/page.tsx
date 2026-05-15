// /docs/slots — the named-slot demo with the most narrative.
//
// All three pages under /docs reuse the same `app/docs/layout.tsx`,
// which renders <Slot name="aside" /> at the bottom of the sidebar.
// Each page exports its own `slots = { aside: <Component> }`. Compare
// the sidebars side-by-side:
//
//   /docs           → Tip box     (slots.aside = TipAside)
//   /docs/routing   → See also    (slots.aside = SeeAlsoAside)
//   /docs/slots     → Hint box    (slots.aside = HintAside, defined here)
//
// A page that omits `slots.aside` leaves the slot empty.
//
// This page also overrides the layout's `metadata.title` but leaves
// `description` to be inherited from `app/docs/layout.tsx` — view
// source to see the merged <head>:
//   <title>Named slots — mreact App Router</title>
//   <meta name="description" content="Tour of nested layouts, …">
export const metadata = {
  title: "Named slots — mreact App Router",
};

function HintAside() {
  return (
    <div class="docs-aside-box">
      <h4>Hint</h4>
      <p>
        Each page picks its own <code>aside</code> by exporting{" "}
        <code>slots</code>. The layout never knows about the specific
        components.
      </p>
    </div>
  );
}

export const slots = {
  aside: HintAside,
};

export default function Page() {
  return (
    <article>
      <h1>Named slots</h1>
      <p>
        The sidebar on the left is rendered by{" "}
        <code>app/docs/layout.tsx</code>. The layout ends its sidebar
        with <code>&lt;Slot name="aside" /&gt;</code> — a placeholder
        that any child page can fill via{" "}
        <code>export const slots = {"{ aside: Component }"}</code>.
      </p>
      <h2>How it works</h2>
      <pre class="code-block">{`// app/docs/layout.tsx
<aside class="docs-sidebar">
  <h3>On this section</h3>
  <ul>…</ul>
  <Slot name="aside" />          // ← named slot, sits at the sidebar's bottom
</aside>

// app/docs/slots/page.tsx (this page)
function HintAside() { return <div class="docs-aside-box">…</div>; }
export const slots = { aside: HintAside };  // ← fills the slot`}</pre>
      <h2>Try it</h2>
      <ul>
        <li>
          <a href="/docs">/docs</a> — same layout, but the aside is a "Tip" box.
        </li>
        <li>
          <a href="/docs/routing">/docs/routing</a> — same layout again, the aside is a "See also" box.
        </li>
        <li>
          <a href="/docs/slots">/docs/slots</a> — you are here. The aside is a "Hint" box.
        </li>
      </ul>
      <p class="muted">
        Open the three pages in turn and watch the sidebar's bottom box
        change. The rest of the layout (header, sidebar links) stays
        identical — only the named slot's contents differ per page.
      </p>
      <h2>What you can put in a slot</h2>
      <p>
        Anything renderable. The <code>slots</code> export is a record
        of <code>name → Component</code>; the layout renders the matched
        component wherever it places <code>&lt;Slot name="…" /&gt;</code>.
        A page that does not export <code>slots.&lt;name&gt;</code>
        leaves the slot empty — no default content is invented.
      </p>
    </article>
  );
}
