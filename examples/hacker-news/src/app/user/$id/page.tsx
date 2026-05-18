import { notFound } from "@reckona/mreact-router";
import { hn } from "../../../hn/client.js";
import {
  formatHnText,
  formatHost,
  formatRelativeTime,
  isDisplayableItem,
  pluralize,
} from "../../../hn/format.js";
import type { UserProfileData } from "../../../hn/render.js";
import type { HnItem } from "../../../hn/types.js";

interface LoaderContext {
  params: { id: string };
}

export async function loader(context: LoaderContext): Promise<UserProfileData> {
  const userResult = await hn.getUser(context.params.id);
  if (userResult.isErr() || userResult.value === null) notFound();

  const stories: HnItem[] = [];
  for (const id of userResult.value.submitted?.slice(0, 20) ?? []) {
    const itemResult = await hn.getItem(id);
    if (
      itemResult.isOk() &&
      isDisplayableItem(itemResult.value) &&
      itemResult.value.type === "story"
    ) {
      stories.push(itemResult.value);
    }
  }

  return { stories, user: userResult.value };
}

export default function Page(props: { data: UserProfileData }) {
  return (
    <main>
      <UserProfile stories={props.data.stories} user={props.data.user} />
    </main>
  );
}

function UserProfile(props: UserProfileData) {
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
