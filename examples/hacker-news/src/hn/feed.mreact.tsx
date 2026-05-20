import { Link } from "@reckona/mreact-router/link";
import { streamList } from "@reckona/mreact-router/stream-list";
import type { StoryFeed } from "./client.js";
import {
  batchStartRank,
  loadFeedBatch,
  loadFeedStoryIds,
  storyBatchSize,
  type FeedBatchData,
} from "./feed-data.js";
import { formatAwaitError, formatHost, formatRelativeTime, pluralize } from "./format.js";
import { storyPlaceholderRanks } from "./story-batches.js";
import type { HnItem } from "./types.js";
import { safeHttpUrl } from "./url.js";

export interface FeedPageProps {
  emptyMessage: string;
  errorMessage: string;
  feed: StoryFeed;
  title: string;
}

export function FeedPage(props: FeedPageProps) {
  const storyIds = loadFeedStoryIds(props.feed);
  const batches = streamList([0, 1, 2, 3, 4, 5], {
    batchSize: 1,
    loadBatch: async ([batchIndex]) => [
      await loadFeedBatch(storyIds, batchIndex ?? 0, props.errorMessage),
    ],
  });

  return (
    <main>
      <h1 class="mb-3 text-xl font-semibold text-stone-950">{props.title}</h1>
      <div class="space-y-2">
        {batches.map((batch) => (
          <Await
            key={batch.index}
            value={batch.value}
            placeholderAs="div"
            placeholder={
              <ol aria-hidden="true" class="space-y-2" start={batchStartRank(batch.start)}>
                {storyPlaceholderRanks(batchStartRank(batch.start), storyBatchSize).map((rank) => (
                  <li
                    key={rank}
                    class="grid grid-cols-[2rem_1fr] gap-2 border-b border-orange-200/70 pb-2"
                    value={rank}
                  >
                    <span class="pt-0.5 text-right text-xs tabular-nums text-stone-400">
                      {rank}.
                    </span>
                    <article class="space-y-2 py-1">
                      <span class="block h-3.5 w-10/12 max-w-xl bg-orange-100" />
                      <span class="block h-2.5 w-7/12 max-w-md bg-orange-100/70" />
                    </article>
                  </li>
                ))}
              </ol>
            }
            catch={(error) => (
              <p role="alert" class="text-sm text-red-700">
                Could not load stories: {formatAwaitError(error)}
              </p>
            )}
          >
            {(resolved) => <FeedBatchResolved batch={resolved} emptyMessage={props.emptyMessage} />}
          </Await>
        ))}
      </div>
    </main>
  );
}

function storyCommentCount(story: HnItem): number {
  return story.descendants ?? story.kids?.length ?? 0;
}

function storySourceUrl(story: HnItem): string | undefined {
  return safeHttpUrl(story.url);
}

function FeedBatchResolved(props: {
  batch: { items: FeedBatchData[]; start: number };
  emptyMessage?: string;
}) {
  const data = props.batch.items[0];
  return data === undefined ? null : (
    <FeedBatchRows
      batch={data}
      emptyMessage={props.emptyMessage}
      startRank={batchStartRank(props.batch.start)}
    />
  );
}

function FeedBatchRows(props: {
  batch: FeedBatchData;
  emptyMessage?: string;
  startRank: number;
}) {
  return (
    <>
      {props.batch.kind === "error" ? (
        <p role="alert" class="text-sm text-red-700">
          {props.batch.message}
        </p>
      ) : props.batch.kind === "empty" && props.emptyMessage !== undefined ? (
        <p role="alert" class="text-sm text-stone-600">
          {props.emptyMessage}
        </p>
      ) : props.batch.kind === "loaded" && props.batch.stories.length > 0 ? (
        <ol class="space-y-2" start={props.startRank}>
          {props.batch.stories.map((story, index) => (
            <li
              key={story.id}
              class="grid grid-cols-[2rem_1fr] gap-2 border-b border-orange-200/70 pb-2"
              value={props.startRank + index}
            >
              <span class="pt-0.5 text-right text-xs tabular-nums text-stone-500">
                {props.startRank + index}.
              </span>
              <article>
                <h2 class="inline text-[15px] font-medium leading-snug text-stone-950">
                  <Link data-testid="story-link" href={`/item/${story.id}`} class="hover:underline">
                    {story.title ?? "Untitled"}
                  </Link>
                </h2>
                {storySourceUrl(story) === undefined ? null : (
                  <a
                    class="ml-1 align-baseline text-[11px] text-stone-500 hover:underline"
                    href={storySourceUrl(story)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    ({formatHost(storySourceUrl(story) ?? "")})
                  </a>
                )}
                <p class="mt-0.5 text-xs leading-5 text-stone-500">
                  {story.score === undefined ? null : <>{pluralize(story.score, "point")} by </>}
                  {story.by === undefined ? (
                    "unknown"
                  ) : (
                    <Link
                      data-testid="story-user-link"
                      href={`/user/${encodeURIComponent(story.by)}`}
                      class="hover:underline"
                    >
                      {story.by}
                    </Link>
                  )}{" "}
                  {formatRelativeTime(story.time)}
                  {" | "}
                  <Link href={`/item/${story.id}`} class="hover:underline">
                    {pluralize(storyCommentCount(story), "comment")}
                  </Link>
                </p>
              </article>
            </li>
          ))}
        </ol>
      ) : null}
    </>
  );
}
