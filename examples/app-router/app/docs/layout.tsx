// Nested layout. The root layout supplies the HTML shell; this one
// wraps every /docs/... page in a sidebar + content split. The sidebar
// includes a named slot: pages that export `slots = { aside: ... }`
// fill the `<Slot name="aside" />` at the bottom of the sidebar.
//
// `metadata` exported from a layout is merged with the page's own
// metadata, with the page winning on overlapping keys. Pages under
// /docs that omit a `description` therefore inherit the docs default
// below; pages that supply their own `title` override the layout's.

export const metadata = {
  title: "Docs — mreact App Router",
  description:
    "Tour of nested layouts, templates, named slots, and boundary files.",
};

export default function DocsLayout() {
  return (
    <section class="docs-layout">
      <aside class="docs-sidebar">
        <h3>On this section</h3>
        <ul>
          <li><a href="/docs">Overview</a></li>
          <li><a href="/docs/routing">Routing</a></li>
          <li><a href="/docs/slots">Named slots</a></li>
        </ul>
        <Slot name="aside" />
      </aside>
      <div>
        <Slot />
      </div>
    </section>
  );
}
