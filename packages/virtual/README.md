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

## Reactivity Contract

Cell reads inside the `items`, `scrollOffset`, `viewportSize`, and `getColumnCount` thunks (and the per-item callbacks) are tracked: when any of them changes, `entries`, `range`, `visibleRange`, and the spacer cells recompute automatically, so `items: () => messages.get()` behaves exactly like other cell reads in mreact. Outputs only notify subscribers when their value actually changed, so scroll updates that keep the rendered window identical do not re-render the list.

`refresh()` is only needed when the inputs are not cell-backed, for example a plain array captured by the thunk that you replace or mutate in place. The imperative helpers `scrollToIndex()` and `scrollToKey()` always observe the latest items, including non-reactive sources, and never subscribe their caller.

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

`getColumnCount()` is tracked like the other thunks, so a cell-backed column count recomputes the virtual range after container or breakpoint changes; call `refresh()` only when it reads non-reactive state. `visibleRange` can drive thumbnail prefetching for visible and near-visible media.

Pass `getItemSpan()` for quilt-style grids where selected items occupy multiple grid tracks. Span-aware grids place items with deterministic row-major auto-placement, expose `column`, `colSpan`, and `rowSpan` on rendered entries, and compute spacer sizes from the resulting row projection so the first SSR response can render without browser layout reads.

```ts
const quilt = createVirtualGrid({
  items: () => media.get(),
  getKey: (item) => item.id,
  estimateItemSize: () => 220,
  getColumnCount: () => columnCount.get(),
  getItemSpan: (item) => item.featured ? { colSpan: 2, rowSpan: 2 } : { colSpan: 1, rowSpan: 1 },
  scrollOffset: () => scrollTop.get(),
  viewportSize: () => viewportHeight.get(),
});
```

The supported span model intentionally covers row-major CSS grid placement for bounded `1x1`, `2x1`, `1x2`, and `2x2` style media cards. It does not emulate `grid-auto-flow: dense`, masonry packing, manually positioned CSS grid lines, or browser layout collision rules; use a layout-specific virtualizer for those cases.

## Infinite Append And Scroll Restoration

Keep fetched pages in application or query state and append new pages there. When the item list lives in a cell, appended pages flow into the virtual window automatically; call `refresh()` after changing a non-reactive item source. The virtualizer keeps stable keys for the rendered entries and exposes `scrollToIndex()` and `scrollToKey()` for restoration.

```ts
const nextOffset = virtual.scrollToKey(selectedId);
if (nextOffset !== undefined) {
  scroller.scrollTop = nextOffset;
}
```

## Measured Items

Use `measureItem()` when item height becomes known after images or metadata load. Measuring an item recomputes the range and notifies subscribers whose values changed.

```ts
virtual.measureItem(photo.id, element.offsetHeight);
```

For grids, a measured row uses the largest measured item in that row. Unmeasured rows use `estimateItemSize()`.
