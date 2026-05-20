export interface StoryIdBatch {
  ids: number[];
  startRank: number;
}

export function chunkStoryIds(ids: number[], batchSize: number): StoryIdBatch[] {
  const safeBatchSize = Math.max(1, Math.floor(batchSize));
  const batches: StoryIdBatch[] = [];

  for (let index = 0; index < ids.length; index += safeBatchSize) {
    batches.push({
      ids: ids.slice(index, index + safeBatchSize),
      startRank: index + 1,
    });
  }

  return batches;
}

export function storyPlaceholderRanks(startRank: number, count: number): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => startRank + index);
}
