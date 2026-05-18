import { Link } from "@reckona/mreact-router/link";
import { formatHnText, formatHost, formatRelativeTime, pluralize } from "./format.js";
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
        <HnLink class="text-orange-950 hover:underline" href={feed.href}>
          {feed.label}
        </HnLink>
      ))}
    </nav>
  );
}

export function StoryList(props: { stories: HnItem[] }) {
  return (
    <ol class="space-y-2">
      {props.stories.map((story, index) => {
        const sourceUrl = safeHttpUrl(story.url);

        return (
          <li
            class="grid grid-cols-[2rem_1fr] gap-2 border-b border-orange-200/70 pb-2"
            value={index + 1}
          >
            <span class="pt-0.5 text-right text-xs tabular-nums text-stone-500">{index + 1}.</span>
            <article>
              <h2 class="inline text-[15px] font-medium leading-snug text-stone-950">
                <HnLink data-testid="story-link" href={`/item/${story.id}`} class="hover:underline">
                  {story.title ?? "Untitled"}
                </HnLink>
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
    </ol>
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
          <HnLink href={`/user/${encodeURIComponent(props.comment.by)}`} class="hover:underline">
            {props.comment.by}
          </HnLink>
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
        <HnLink
          data-testid="story-user-link"
          href={`/user/${encodeURIComponent(props.story.by)}`}
          class="hover:underline"
        >
          {props.story.by}
        </HnLink>
      )}{" "}
      {formatRelativeTime(props.story.time)}
      {" | "}
      <HnLink href={`/item/${props.story.id}`} class="hover:underline">
        {pluralize(comments, "comment")}
      </HnLink>
    </p>
  );
}

function HnLink(props: {
  children?: unknown;
  class?: string;
  href: string;
  "data-testid"?: string;
}) {
  const link = Link({ href: props.href });
  const href = typeof link.props.href === "string" ? link.props.href : props.href;

  return (
    <a href={href} class={props.class} data-testid={props["data-testid"]}>
      {props.children}
    </a>
  );
}
