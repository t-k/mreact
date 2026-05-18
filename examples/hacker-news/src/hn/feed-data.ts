import { hn, type StoryFeed } from "./client.js";
import { chunkStoryIds } from "./story-batches.js";
import type { HnItem } from "./types.js";

export const storyLimit = 30;
export const storyBatchSize = 5;

type StoryIdsResult = Awaited<ReturnType<typeof hn.getStoryIds>>;

type FeedBatchData =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; stories: HnItem[] };

export interface FeedStoryRow {
  rank: number;
  story: HnItem;
}

export type FeedPageData =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; rows: FeedStoryRow[] };

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

export async function loadFeedPageData(
  feed: StoryFeed,
  errorMessage: string,
): Promise<FeedPageData> {
  const storyIds = loadFeedStoryIds(feed);
  const batchCount = Math.ceil(storyLimit / storyBatchSize);
  const batches = await Promise.all(
    Array.from({ length: batchCount }, (_, batchIndex) =>
      loadFeedBatch(storyIds, batchIndex, errorMessage),
    ),
  );
  const firstBatch = batches[0];
  if (firstBatch?.kind === "error") {
    return firstBatch;
  }

  const rows = batches.flatMap((batch, batchIndex) =>
    batch.kind === "loaded"
      ? batch.stories.map((story, storyIndex) => ({
          rank: batchStartRank(batchIndex) + storyIndex,
          story,
        }))
      : [],
  );

  return rows.length === 0 ? { kind: "empty" } : { kind: "loaded", rows };
}
