// Nested template. Composition order is layout → template → page, but
// the template remounts on every navigation while the layout persists
// DOM identity. Use templates for per-route shells that should reset
// (animations, focus traps), and layouts for shells that should be
// reused.
export default function DocsTemplate() {
  return (
    <article data-template="docs" class="docs-template">
      <Slot />
    </article>
  );
}
