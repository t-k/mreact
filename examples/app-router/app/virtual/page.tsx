import { cell } from "@reckona/mreact-reactive-core";
import { createVirtualGrid } from "@reckona/mreact-virtual";

interface Photo {
  id: string;
  title: string;
}

const photos: Photo[] = Array.from({ length: 500 }, (_unused, index) => ({
  id: `photo-${index}`,
  title: `Photo ${index + 1}`,
}));

const scrollTop = cell(0);
const viewportSize = 360;
const virtual = createVirtualGrid({
  estimateItemSize: () => 120,
  getColumnCount: () => 3,
  getKey: (photo) => photo.id,
  items: () => photos,
  overscan: 2,
  scrollOffset: () => scrollTop.get(),
  viewportSize: () => viewportSize,
});

function scrollByRows(rows: number) {
  const maxScrollTop = Math.max(0, virtual.totalSizePx.get() - viewportSize);
  scrollTop.set(Math.min(maxScrollTop, Math.max(0, scrollTop.get() + rows * 120)));
  virtual.refresh();
}

export default function Page() {
  const entries = virtual.entries.get();
  const visibleRange = virtual.visibleRange.get();

  return (
    <main>
      <h1>Virtual Grid</h1>
      <p>
        This route renders a bounded projection of 500 media items through{" "}
        <code>@reckona/mreact-virtual</code>.
      </p>
      <dl class="kv">
        <dt>Rendered cards</dt>
        <dd>
          <code>{entries.length}</code>
        </dd>
        <dt>Visible range</dt>
        <dd>
          <code>
            {visibleRange.startIndex}-{visibleRange.endIndex}
          </code>
        </dd>
        <dt>Spacer pixels</dt>
        <dd>
          <code>
            {virtual.topSpacerPx.get()} / {virtual.bottomSpacerPx.get()}
          </code>
        </dd>
      </dl>
      <p>
        <button type="button" onClick={() => scrollByRows(-3)}>
          Scroll up
        </button>{" "}
        <button type="button" onClick={() => scrollByRows(3)}>
          Scroll down
        </button>
      </p>
      <section class="cards" data-total-size={virtual.totalSizePx.get()}>
        {entries.map((entry) => (
          <article key={entry.key} data-index={entry.index}>
            <h2>{entry.item.title}</h2>
            <p>
              Row <code>{entry.row}</code>
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}
