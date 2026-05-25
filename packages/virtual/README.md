# @reckona/mreact-virtual

`@reckona/mreact-virtual` provides reactive list and grid virtualization primitives for mreact applications. It keeps large timelines and media grids centered around stable keys while exposing bounded render entries, spacer heights, visible ranges, and scroll offsets.

## Fixed List

```ts
import { createVirtualList } from "@reckona/mreact-virtual";

const virtual = createVirtualList({
  items: () => messages.get(),
  getKey: (message) => message.id,
  estimateItemSize: () => 48,
  scrollOffset: () => scrollTop.get(),
  viewportSize: () => viewportHeight.get(),
  overscan: 2,
});

virtual.entries.get();
virtual.topSpacerPx.get();
virtual.bottomSpacerPx.get();
```

Render `topSpacerPx`, the keyed `entries`, and `bottomSpacerPx` in order. The entries include overscan rows while `visibleRange` reports only the viewport rows.

## Responsive Media Grid

```ts
import { createVirtualGrid } from "@reckona/mreact-virtual";

const virtual = createVirtualGrid({
  items: () => media.get(),
  getKey: (item) => item.id,
  estimateItemSize: () => 220,
  getColumnCount: () => columnCount.get(),
  scrollOffset: () => scrollTop.get(),
  viewportSize: () => viewportHeight.get(),
  overscan: 2,
});
```

`getColumnCount()` is read when `refresh()` runs, so apps can recompute the virtual range after container or breakpoint changes. `visibleRange` can drive thumbnail prefetching for visible and near-visible media.

## Infinite Append And Scroll Restoration

Keep fetched pages in application or query state, append new pages there, and call `refresh()` after the item list changes. The virtualizer keeps stable keys for the rendered entries and exposes `scrollToIndex()` and `scrollToKey()` for restoration.

```ts
const nextOffset = virtual.scrollToKey(selectedId);
if (nextOffset !== undefined) {
  scroller.scrollTop = nextOffset;
}
```

## Measured Items

Use `measureItem()` when item height becomes known after images or metadata load. Measuring an item refreshes the range immediately.

```ts
virtual.measureItem(photo.id, element.offsetHeight);
```

For grids, a measured row uses the largest measured item in that row. Unmeasured rows use `estimateItemSize()`.
