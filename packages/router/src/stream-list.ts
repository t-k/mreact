/**
 * Represents one resolved batch emitted by `streamList()`.
 */
export interface StreamListBatch<TItem> {
  index: number;
  items: TItem[];
  size: number;
  start: number;
}

/**
 * Represents one pending batch and its eventual loaded items.
 */
export interface StreamListPendingBatch<TItem> {
  index: number;
  size: number;
  start: number;
  value: Promise<StreamListBatch<TItem>>;
}

/**
 * Configures how a list is divided into asynchronous batches.
 */
export interface StreamListOptions<TInput, TItem> {
  batchSize: number;
  loadBatch: (
    items: readonly TInput[],
    batch: { index: number; size: number; start: number },
  ) => PromiseLike<readonly TItem[]> | readonly TItem[];
}

/**
 * Splits an input list into pending batches that load their items asynchronously.
 */
export function streamList<TInput, TItem = TInput>(
  items: readonly TInput[],
  options: StreamListOptions<TInput, TItem>,
): Array<StreamListPendingBatch<TItem>> {
  const requestedBatchSize = Math.floor(options.batchSize);
  const batchSize = Number.isFinite(requestedBatchSize) ? Math.max(1, requestedBatchSize) : 1;
  const batches: Array<StreamListPendingBatch<TItem>> = [];

  for (let start = 0; start < items.length; start += batchSize) {
    const batchItems = items.slice(start, start + batchSize);
    const index = batches.length;
    const meta = { index, size: batchItems.length, start };
    batches.push({
      ...meta,
      value: Promise.resolve(options.loadBatch(batchItems, meta)).then((loaded) => ({
        ...meta,
        items: [...loaded],
      })),
    });
  }

  return batches;
}
