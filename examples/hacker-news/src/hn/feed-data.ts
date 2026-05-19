import { hn, type StoryFeed } from "./client.js";
import { chunkStoryIds } from "./story-batches.js";
import type { HnItem } from "./types.js";

export const storyLimit = 30;
export const storyBatchSize = 5;

type StoryIdsResult = Awaited<ReturnType<typeof hn.getStoryIds>>;

export type FeedBatchData =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; stories: HnItem[] };

export function batchStartRank(batchIndex: number): number {
  return batchIndex * storyBatchSize + 1;
}

export function loadFeedStoryIds(feed: StoryFeed): Promise<StoryIdsResult> {
  return hn.getStoryIds(feed, storyLimit);
}

export async function loadFeedBatch(
  storyIds: Promise<StoryIdsResult>,
  batchIndex: number,
  errorMessage: string,
): Promise<FeedBatchData> {
  const idsResult = await storyIds;
  if (idsResult.isErr()) {
    return batchIndex === 0 ? { kind: "error", message: errorMessage } : { kind: "empty" };
  }

  const batch = chunkStoryIds(idsResult.value, storyBatchSize)[batchIndex];
  if (batch === undefined) {
    return batchIndex === 0 ? { kind: "empty" } : { kind: "loaded", stories: [] };
  }

  const storiesResult = await hn.getItems(batch.ids);

  return { kind: "loaded", stories: storiesResult.isOk() ? storiesResult.value : [] };
}
