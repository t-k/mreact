import {
  createVirtualGallery,
  PHOTO_COUNT,
  PHOTO_COUNT_LABEL,
  rangeLabel,
} from "./gallery.ts";

const gallery = createVirtualGallery();

function syncViewportToGallery(): void {
  const viewport = document.querySelector<HTMLElement>('[data-testid="photo-viewport"]');
  if (viewport !== null) {
    viewport.scrollTop = gallery.scrollOffset.get();
  }
}

function pageUp(): void {
  gallery.pageUp();
  syncViewportToGallery();
}

function pageDown(): void {
  gallery.pageDown();
  syncViewportToGallery();
}

function jumpToEnd(): void {
  gallery.scrollToIndex(PHOTO_COUNT - 1);
  syncViewportToGallery();
}

function backToTop(): void {
  gallery.scrollToTop();
  syncViewportToGallery();
}

export function App() {
  return (
    <main class="shell">
      <h1>virtual-grid</h1>
      <p>
        A standalone example for <code>@reckona/mreact-virtual</code>. It keeps a{" "}
        <strong>{PHOTO_COUNT_LABEL} photos</strong> gallery in memory while rendering only the visible
        rows plus overscan.
      </p>
      <p class="toolbar">
        <button type="button" onClick={pageUp}>
          Page up
        </button>{" "}
        <button type="button" onClick={pageDown}>
          Page down
        </button>{" "}
        <button type="button" onClick={jumpToEnd}>
          Jump to end
        </button>{" "}
        <button type="button" onClick={backToTop}>
          Back to top
        </button>
      </p>
      <dl class="telemetry">
        <div>
          <dt>Visible range</dt>
          <dd data-testid="visible-range">{rangeLabel(gallery.visibleRange.get())}</dd>
        </div>
        <div>
          <dt>Rendered cards</dt>
          <dd>{gallery.entries.get().length}</dd>
        </div>
        <div>
          <dt>Top spacer</dt>
          <dd data-testid="top-spacer">{gallery.topSpacerPx.get()} px</dd>
        </div>
        <div>
          <dt>Bottom spacer</dt>
          <dd data-testid="bottom-spacer">{gallery.bottomSpacerPx.get()} px</dd>
        </div>
        <div>
          <dt>First rendered</dt>
          <dd data-testid="first-rendered">{gallery.entries.get()[0]?.key ?? "(none)"}</dd>
        </div>
        <div>
          <dt>Last rendered</dt>
          <dd data-testid="last-rendered">{gallery.entries.get().at(-1)?.key ?? "(none)"}</dd>
        </div>
      </dl>
      <section
        class="viewport"
        aria-label="Virtual photo grid"
        data-testid="photo-viewport"
        onScroll={(event) => gallery.scrollToOffset(event.currentTarget.scrollTop)}
      >
        <div class="grid" data-total-size={gallery.totalSizePx.get()}>
          <div class="spacer" style={{ height: `${gallery.topSpacerPx.get()}px` }} />
          {gallery.entries.get().map((entry) => (
            <article
              class="photo-card"
              data-testid="photo-card"
              data-index={entry.index}
              key={entry.key}
              style={{ "--swatch": entry.item.color }}
            >
              <h2>{entry.item.title}</h2>
              <p>
                <code>{entry.item.id}</code> · row <code>{entry.row}</code>
              </p>
            </article>
          ))}
          <div class="spacer" style={{ height: `${gallery.bottomSpacerPx.get()}px` }} />
        </div>
      </section>
    </main>
  );
}
