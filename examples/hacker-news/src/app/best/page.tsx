import { hn } from "../../hn/client.js";
import { formatHost, formatRelativeTime, pluralize } from "../../hn/format.js";
import type { HnItem } from "../../hn/types.js";

type FeedData = { kind: "error"; message: string } | { kind: "loaded"; stories: HnItem[] };

export const metadata = {
  title: "Best Stories",
};

export async function loader(): Promise<FeedData> {
  const result = await hn.getStories("best", 30);
  if (result.isErr()) return { kind: "error", message: "Could not load Best Stories." };

  return { kind: "loaded", stories: result.value };
}

export default function Page(props: { data: FeedData }) {
  return (
    <main>
      <h1 class="mb-3 text-xl font-semibold text-stone-950">Best Stories</h1>
      {props.data.kind === "error" ? (
        <p role="alert" class="text-sm text-red-700">
          {props.data.message}
        </p>
      ) : props.data.stories.length === 0 ? (
        <p role="alert" class="text-sm text-stone-600">
          No Best Stories are visible.
        </p>
      ) : (
        <StoryList stories={props.data.stories} />
      )}
    </main>
  );
}

function StoryList(props: { stories: HnItem[] }) {
  return (
    <ol class="space-y-2">
      {props.stories.map((story, index) => (
        <li
          class="grid grid-cols-[2rem_1fr] gap-2 border-b border-orange-200/70 pb-2"
          value={index + 1}
        >
          <span class="pt-0.5 text-right text-xs tabular-nums text-stone-500">{index + 1}.</span>
          <article>
            <h2 class="inline text-[15px] font-medium leading-snug text-stone-950">
              <a data-testid="story-link" href={`/item/${story.id}`} class="hover:underline">
                {story.title ?? "Untitled"}
              </a>
            </h2>
            {story.url === undefined ? null : (
              <a
                class="ml-1 align-baseline text-[11px] text-stone-500 hover:underline"
                href={story.url}
                rel="noreferrer"
                target="_blank"
              >
                ({formatHost(story.url)})
              </a>
            )}
            <p class="mt-0.5 text-xs leading-5 text-stone-500">
              {story.score === undefined ? null : <>{pluralize(story.score, "point")} by </>}
              {story.by === undefined ? (
                "unknown"
              ) : (
                <a
                  data-testid="story-user-link"
                  href={`/user/${encodeURIComponent(story.by)}`}
                  class="hover:underline"
                >
                  {story.by}
                </a>
              )}{" "}
              {formatRelativeTime(story.time)}
              {" | "}
              <a href={`/item/${story.id}`} class="hover:underline">
                {pluralize(story.descendants ?? story.kids?.length ?? 0, "comment")}
              </a>
            </p>
          </article>
        </li>
      ))}
    </ol>
  );
}
