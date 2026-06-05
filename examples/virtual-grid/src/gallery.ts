import { cell, type ReadonlyCell } from "@reckona/mreact-reactive-core";
import {
  createVirtualGrid,
  type VirtualEntry,
  type Virtualizer,
  type VisibleRange,
} from "@reckona/mreact-virtual";

export interface GalleryPhoto {
  color: string;
  id: string;
  title: string;
}

export interface VirtualGallery {
  readonly bottomSpacerPx: ReadonlyCell<number>;
  readonly entries: ReadonlyCell<readonly VirtualEntry<GalleryPhoto>[]>;
  readonly photos: readonly GalleryPhoto[];
  readonly scrollOffset: ReadonlyCell<number>;
  readonly topSpacerPx: ReadonlyCell<number>;
  readonly totalSizePx: ReadonlyCell<number>;
  readonly visibleRange: ReadonlyCell<VisibleRange>;
  pageDown(): void;
  pageUp(): void;
  scrollToIndex(index: number): void;
  scrollToOffset(offset: number): void;
  scrollToTop(): void;
}

export const PHOTO_COUNT = 10_000;
export const PHOTO_COUNT_LABEL = PHOTO_COUNT.toLocaleString("en-US");
export const PHOTO_ID_WIDTH = 5;
export const COLUMN_COUNT = 3;
export const ROW_HEIGHT_PX = 120;
export const VIEWPORT_HEIGHT_PX = 360;
export const OVERSCAN_ROWS = 2;

const titles = [
  "Harbor morning",
  "Cloud corridor",
  "Glass station",
  "Forest signal",
  "Copper ridge",
  "Winter arcade",
  "Tide archive",
  "Market lights",
  "Summit path",
  "Signal lantern",
] as const;

export const photos: readonly GalleryPhoto[] = Array.from(
  { length: PHOTO_COUNT },
  (_unused, index) => ({
    color: colorForIndex(index),
    id: `photo-${String(index).padStart(PHOTO_ID_WIDTH, "0")}`,
    title: titles[index % titles.length],
  }),
);

export function createVirtualGallery(): VirtualGallery {
  const scrollOffset = cell(0);
  const virtual = createVirtualGrid({
    estimateItemSize: () => ROW_HEIGHT_PX,
    getColumnCount: () => COLUMN_COUNT,
    getKey: (photo) => photo.id,
    items: () => photos,
    overscan: OVERSCAN_ROWS,
    scrollOffset: () => scrollOffset.get(),
    viewportSize: () => VIEWPORT_HEIGHT_PX,
  });

  const scrollToOffset = (offset: number) => {
    // scrollOffset is a cell read by the virtualizer's scrollOffset thunk, so
    // setting it recomputes the virtual window without an explicit refresh().
    scrollOffset.set(clampScrollOffset(offset, virtual));
  };

  return {
    bottomSpacerPx: virtual.bottomSpacerPx,
    entries: virtual.entries,
    photos,
    scrollOffset,
    topSpacerPx: virtual.topSpacerPx,
    totalSizePx: virtual.totalSizePx,
    visibleRange: virtual.visibleRange,
    pageDown() {
      scrollToOffset(scrollOffset.get() + VIEWPORT_HEIGHT_PX);
    },
    pageUp() {
      scrollToOffset(scrollOffset.get() - VIEWPORT_HEIGHT_PX);
    },
    scrollToIndex(index) {
      scrollToOffset(virtual.scrollToIndex(index));
    },
    scrollToOffset,
    scrollToTop() {
      scrollToOffset(0);
    },
  };
}

export function visiblePhotoIds(gallery: Pick<VirtualGallery, "entries">): string[] {
  return gallery.entries.get().map((entry) => entry.item.id);
}

export function photoAt(index: number): GalleryPhoto | undefined {
  return photos[index];
}

export function rangeLabel(range: VisibleRange): string {
  return `${range.startIndex}-${range.endIndex}`;
}

function clampScrollOffset(offset: number, virtual: Virtualizer<GalleryPhoto>): number {
  return Math.min(
    Math.max(0, virtual.totalSizePx.get() - VIEWPORT_HEIGHT_PX),
    Math.max(0, Math.floor(offset)),
  );
}

function colorForIndex(index: number): string {
  const hue = (index * 47) % 360;
  return `oklch(0.68 0.12 ${hue})`;
}
