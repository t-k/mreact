import type { StoryFeed } from "./client.js";
import { loadFeedPageData, storyLimit } from "./feed-data.js";
import { formatHost, formatRelativeTime, pluralize } from "./format.js";
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
  const feedData = loadFeedPageData(props.feed, props.errorMessage);

  return (
    <main>
      <h1 class="mb-3 text-xl font-semibold text-stone-950">{props.title}</h1>
      <Await
        value={feedData}
        placeholder={
          <ol class="space-y-2" start={1}>
            {storyPlaceholderRanks(1, storyLimit).map((rank) => (
              <li
                key={rank}
                aria-hidden="true"
                class="grid grid-cols-[2rem_1fr] gap-2 border-b border-orange-200/70 pb-2"
                value={rank}
              >
                <span class="pt-0.5 text-right text-xs tabular-nums text-stone-400">{rank}.</span>
                <article class="space-y-2 py-1">
                  <span class="block h-3.5 w-10/12 max-w-xl bg-orange-100" />
                  <span class="block h-2.5 w-7/12 max-w-md bg-orange-100/70" />
                </article>
              </li>
            ))}
          </ol>
        }
      >
        {(data) => (
          <>
            {data.kind === "error" ? (
              <p role="alert" class="text-sm text-red-700">
                {data.message}
              </p>
            ) : null}
            {data.kind === "empty" ? (
              <p role="alert" class="text-sm text-stone-600">
                {props.emptyMessage}
              </p>
            ) : null}
            <ol class="space-y-2" start={1}>
              {(data.kind === "loaded" ? data.rows : []).map((row) => (
                <li
                  key={row.story.id}
                  class="grid grid-cols-[2rem_1fr] gap-2 border-b border-orange-200/70 pb-2"
                  value={row.rank}
                >
                  <span class="pt-0.5 text-right text-xs tabular-nums text-stone-500">
                    {row.rank}.
                  </span>
                  <article>
                    <h2 class="inline text-[15px] font-medium leading-snug text-stone-950">
                      <a
                        data-testid="story-link"
                        href={`/item/${row.story.id}`}
                        class="hover:underline"
                      >
                        {row.story.title ?? "Untitled"}
                      </a>
                    </h2>
                    {storySourceUrl(row.story) === undefined ? null : (
                      <a
                        class="ml-1 align-baseline text-[11px] text-stone-500 hover:underline"
                        href={storySourceUrl(row.story)}
                        rel="noreferrer"
                        target="_blank"
                      >
                        ({formatHost(storySourceUrl(row.story) ?? "")})
                      </a>
                    )}
                    <p class="mt-0.5 text-xs leading-5 text-stone-500">
                      {row.story.score === undefined ? null : (
                        <>{pluralize(row.story.score, "point")} by </>
                      )}
                      {row.story.by === undefined ? (
                        "unknown"
                      ) : (
                        <a
                          data-testid="story-user-link"
                          href={`/user/${encodeURIComponent(row.story.by)}`}
                          class="hover:underline"
                        >
                          {row.story.by}
                        </a>
                      )}{" "}
                      {formatRelativeTime(row.story.time)}
                      {" | "}
                      <a href={`/item/${row.story.id}`} class="hover:underline">
                        {pluralize(storyCommentCount(row.story), "comment")}
                      </a>
                    </p>
                  </article>
                </li>
              ))}
            </ol>
          </>
        )}
      </Await>
    </main>
  );
}

function storyCommentCount(story: HnItem): number {
  return story.descendants ?? story.kids?.length ?? 0;
}

function storySourceUrl(story: HnItem): string | undefined {
  return safeHttpUrl(story.url);
}
