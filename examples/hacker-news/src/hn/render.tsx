import { Link } from "@reckona/mreact-router/link";
import type { ReactCompatNode } from "@reckona/mreact";
import { formatHnText, formatHost, formatRelativeTime, pluralize } from "./format.js";
import { storyPlaceholderRanks } from "./story-batches.js";
import type { HnItem, HnUser } from "./types.js";
import { safeHttpUrl } from "./url.js";

export interface StoryDetailData {
  comments: HnItem[];
  item: HnItem;
}

export interface UserProfileData {
  stories: HnItem[];
  user: HnUser;
}

const feeds = [
  { href: "/", label: "Top" },
  { href: "/newest", label: "New" },
  { href: "/best", label: "Best" },
  { href: "/ask", label: "Ask" },
  { href: "/show", label: "Show" },
  { href: "/jobs", label: "Jobs" },
] as const;

export function FeedNav() {
  return (
    <nav aria-label="Story feeds" class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
      {feeds.map((feed) => (
        <Link class="text-orange-950 hover:underline" href={feed.href} reload={true}>
          {feed.label}
        </Link>
      ))}
    </nav>
  );
}

export function StoryList(props: { stories: HnItem[] }) {
  return (
    <StoryListFrame>
      <StoryListRows startRank={1} stories={props.stories} />
    </StoryListFrame>
  );
}

export function StoryListFrame(props: { children: ReactCompatNode }) {
  return <ol class="space-y-2">{props.children}</ol>;
}

export function StoryListRows(props: { startRank: number; stories: HnItem[] }) {
  return (
    <>
      {props.stories.map((story, index) => {
        const sourceUrl = safeHttpUrl(story.url);
        const rank = props.startRank + index;

        return (
          <li
            key={story.id}
            class="grid grid-cols-[2rem_1fr] gap-2 border-b border-orange-200/70 pb-2"
            value={rank}
          >
            <span class="pt-0.5 text-right text-xs tabular-nums text-stone-500">{rank}.</span>
            <article>
              <h2 class="inline text-[15px] font-medium leading-snug text-stone-950">
                <Link
                  data-testid="story-link"
                  href={`/item/${story.id}`}
                  class="hover:underline"
                  reload={true}
                >
                  {story.title ?? "Untitled"}
                </Link>
              </h2>
              {sourceUrl === undefined ? null : (
                <a
                  class="ml-1 align-baseline text-[11px] text-stone-500 hover:underline"
                  href={sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  ({formatHost(sourceUrl)})
                </a>
              )}
              <StoryMeta story={story} />
            </article>
          </li>
        );
      })}
    </>
  );
}

export function StoryListPlaceholderRows(props: { count: number; startRank: number }) {
  return (
    <>
      {storyPlaceholderRanks(props.startRank, props.count).map((rank) => (
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
    </>
  );
}

export function StoryDetail(props: StoryDetailData) {
  const text = formatHnText(props.item.text);
  const sourceUrl = safeHttpUrl(props.item.url);

  return (
    <article data-testid="story-detail" class="space-y-4">
      <header class="border-b border-orange-200 pb-3">
        <h1 class="text-xl font-semibold leading-tight text-stone-950">
          {props.item.title ?? "Item"}
        </h1>
        <StoryMeta story={props.item} />
        {sourceUrl === undefined ? null : (
          <p class="mt-1 text-xs text-stone-600">
            <a class="hover:underline" href={sourceUrl} rel="noreferrer" target="_blank">
              {formatHost(sourceUrl)}
            </a>
          </p>
        )}
      </header>
      {text.length === 0 ? null : (
        <p class="whitespace-pre-wrap text-sm leading-6 text-stone-800">{text}</p>
      )}
      <section aria-labelledby="comments-heading" class="space-y-3">
        <h2
          id="comments-heading"
          class="text-sm font-semibold uppercase tracking-wide text-stone-600"
        >
          {pluralize(props.comments.length, "comment")}
        </h2>
        {props.comments.length === 0 ? (
          <p class="text-sm text-stone-600">No visible comments.</p>
        ) : (
          <ol class="space-y-3">
            {props.comments.map((comment) => (
              <li>
                <Comment comment={comment} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </article>
  );
}

export function Comment(props: { comment: HnItem }) {
  const text = formatHnText(props.comment.text);

  return (
    <article class="border-l-2 border-orange-300 bg-orange-50/50 py-2 pl-3">
      <p class="text-xs text-stone-500">
        {props.comment.by === undefined ? (
          "unknown user"
        ) : (
          <Link
            href={`/user/${encodeURIComponent(props.comment.by)}`}
            class="hover:underline"
            reload={true}
          >
            {props.comment.by}
          </Link>
        )}{" "}
        {formatRelativeTime(props.comment.time)}
      </p>
      <p class="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-800">
        {text.length === 0 ? "[no text]" : text}
      </p>
    </article>
  );
}

export function UserProfile(props: UserProfileData) {
  const about = formatHnText(props.user.about);

  return (
    <article data-testid="user-profile" class="space-y-5">
      <header class="border-b border-orange-200 pb-3">
        <h1 class="text-xl font-semibold text-stone-950">User: {props.user.id}</h1>
        <dl class="mt-2 grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1 text-sm">
          <dt class="text-stone-500">karma</dt>
          <dd class="text-stone-900">{props.user.karma ?? 0}</dd>
          <dt class="text-stone-500">created</dt>
          <dd class="text-stone-900">{formatRelativeTime(props.user.created)}</dd>
        </dl>
      </header>
      {about.length === 0 ? null : (
        <p class="whitespace-pre-wrap text-sm leading-6 text-stone-800">{about}</p>
      )}
      <section aria-labelledby="submissions-heading">
        <h2
          id="submissions-heading"
          class="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-600"
        >
          Recent stories
        </h2>
        {props.stories.length === 0 ? (
          <p class="text-sm text-stone-600">No visible story submissions.</p>
        ) : (
          <StoryList stories={props.stories} />
        )}
      </section>
    </article>
  );
}

function StoryMeta(props: { story: HnItem }) {
  const comments = props.story.descendants ?? props.story.kids?.length ?? 0;

  return (
    <p class="mt-0.5 text-xs leading-5 text-stone-500">
      {props.story.score === undefined ? null : <>{pluralize(props.story.score, "point")} by </>}
      {props.story.by === undefined ? (
        "unknown"
      ) : (
        <Link
          data-testid="story-user-link"
          href={`/user/${encodeURIComponent(props.story.by)}`}
          class="hover:underline"
          reload={true}
        >
          {props.story.by}
        </Link>
      )}{" "}
      {formatRelativeTime(props.story.time)}
      {" | "}
      <Link href={`/item/${props.story.id}`} class="hover:underline" reload={true}>
        {pluralize(comments, "comment")}
      </Link>
    </p>
  );
}
