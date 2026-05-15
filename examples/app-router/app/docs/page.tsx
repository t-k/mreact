// /docs — overview page wrapped by both the root layout and the docs
// layout. Demonstrates the named-slot mechanic: this page's `slots.aside`
// export fills the docs sidebar's `<Slot name="aside" />`. Pages that
// omit `slots.aside` leave the slot empty.
//
// This page has NO `metadata` export, so the rendered <head> uses the
// docs layout's `metadata` verbatim — view source to see the layout's
// "Docs — mreact App Router" title and description.

function DocsAside() {
  return (
    <div class="docs-aside-box">
      <h4>Tip</h4>
      <p>
        Every docs page can extend the sidebar via{" "}
        <code>export const slots</code> —{" "}
        <a href="/docs/routing">/docs/routing</a> fills the same slot
        with a different box.
      </p>
    </div>
  );
}

export const slots = {
  aside: DocsAside,
};

export default function Page() {
  return (
    <article>
      <h1>Docs Overview</h1>
      <p>
        This page is wrapped twice: the root <code>app/layout.tsx</code>{" "}
        supplies the HTML shell and top nav, and{" "}
        <code>app/docs/layout.tsx</code> supplies the sidebar around
        this article. The compiler walks up the tree, inserting each
        layout's children into the previous layout's <code>&lt;Slot /&gt;</code>.
      </p>
      <p>
        The "Tip" box in the sidebar is a <strong>named slot</strong>.
        The docs layout declares <code>&lt;Slot name="aside" /&gt;</code>,
        and this page fills it with <code>slots = {"{ aside: DocsAside }"}</code>.
      </p>
      <p>
        Boundary files at this level —{" "}
        <code>loading.tsx</code>, <code>error.tsx</code>,{" "}
        <code>not-found.tsx</code> — apply to every URL under{" "}
        <code>/docs/</code>. Visit <a href="/docs/unknown">/docs/unknown</a> to
        see the nested 404 boundary fire with the sidebar still intact.
      </p>
    </article>
  );
}
