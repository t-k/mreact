import { notFound } from "@reckona/mreact-router";
import { Link } from "@reckona/mreact-router/link";
import { hn } from "../../../hn/client.js";
import {
  formatAwaitError,
  formatHnText,
  formatHost,
  formatRelativeTime,
  isDisplayableItem,
  pluralize,
} from "../../../hn/format.js";
import type { HnItem } from "../../../hn/types.js";
import { safeHttpUrl } from "../../../hn/url.js";

export const stream = true;

const COMMENT_DISPLAY_LIMIT = 12;

interface LoaderContext {
  params: { id: string };
}

interface StoryDetailRouteData {
  item: HnItem;
}

export async function loader(context: LoaderContext): Promise<StoryDetailRouteData> {
  if (!/^\d+$/.test(context.params.id)) notFound();

  const itemResult = await hn.getItem(Number.parseInt(context.params.id, 10));
  if (itemResult.isErr() || !isDisplayableItem(itemResult.value)) notFound();

  return { item: itemResult.value };
}

async function loadComment(id: number): Promise<HnItem | undefined> {
  const commentResult = await hn.getItem(id);
  if (
    commentResult.isOk() &&
    isDisplayableItem(commentResult.value) &&
    commentResult.value.type === "comment"
  ) {
    return commentResult.value;
  }

  return undefined;
}

async function loadComments(item: HnItem): Promise<HnItem[]> {
  const comments = await Promise.all(
    (item.kids ?? []).slice(0, COMMENT_DISPLAY_LIMIT).map(loadComment),
  );

  return comments.filter((comment): comment is HnItem => comment !== undefined);
}

export default function Page(props: { data: StoryDetailRouteData }) {
  const comments = loadComments(props.data.item);
  const sourceUrl = safeHttpUrl(props.data.item.url);
  const text = formatHnText(props.data.item.text);

  return (
    <main>
      <article data-testid="story-detail" class="space-y-4">
        <header class="border-b border-orange-200 pb-3">
          <h1 class="text-xl font-semibold leading-tight text-stone-950">
            {props.data.item.title ?? "Item"}
          </h1>
          <StoryMeta story={props.data.item} />
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
          <Await
            value={comments}
            placeholder={
              <div aria-hidden="true" class="space-y-3">
                <span class="block h-3 w-24 bg-orange-100" />
                <div class="border-l-2 border-orange-200 bg-orange-50/50 py-2 pl-3">
                  <span class="block h-3 w-28 bg-orange-100" />
                  <span class="mt-2 block h-3 w-10/12 bg-orange-100/70" />
                </div>
              </div>
            }
            catch={(error) => (
              <p role="alert" class="text-sm text-red-700">
                Could not load comments: {formatAwaitError(error)}
              </p>
            )}
          >
            {(resolvedComments) => (
              <div class="contents">
                <h2
                  id="comments-heading"
                  class="text-sm font-semibold uppercase tracking-wide text-stone-600"
                >
                  {pluralize(resolvedComments.length, "comment")}
                </h2>
                {resolvedComments.length === 0 ? (
                  <p class="text-sm text-stone-600">No visible comments.</p>
                ) : (
                  <ol class="space-y-3">
                    {resolvedComments.map((comment) => (
                      <li key={comment.id}>
                        <article class="border-l-2 border-orange-300 bg-orange-50/50 py-2 pl-3">
                          <p class="text-xs text-stone-500">
                            {comment.by === undefined ? (
                              "unknown user"
                            ) : (
                              <a
                                href={`/user/${encodeURIComponent(comment.by)}`}
                                class="hover:underline"
                              >
                                {comment.by}
                              </a>
                            )}{" "}
                            {formatRelativeTime(comment.time)}
                          </p>
                          <p class="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-800">
                            {commentText(comment)}
                          </p>
                        </article>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </Await>
        </section>
      </article>
    </main>
  );
}

function commentText(comment: HnItem): string {
  const text = formatHnText(comment.text);

  return text.length === 0 ? "[no text]" : text;
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
        >
          {props.story.by}
        </Link>
      )}{" "}
      {formatRelativeTime(props.story.time)}
      {" | "}
      <Link href={`/item/${props.story.id}`} class="hover:underline">
        {pluralize(comments, "comment")}
      </Link>
    </p>
  );
}
