import { notFound } from "@reckona/mreact-router";
import { hn } from "../../../hn/client.js";
import {
  formatHnText,
  formatHost,
  formatRelativeTime,
  isDisplayableItem,
  pluralize,
} from "../../../hn/format.js";
import type { StoryDetailData } from "../../../hn/render.js";
import type { HnItem } from "../../../hn/types.js";

interface LoaderContext {
  params: { id: string };
}

export async function loader(context: LoaderContext): Promise<StoryDetailData> {
  if (!/^\d+$/.test(context.params.id)) notFound();

  const itemResult = await hn.getItem(Number.parseInt(context.params.id, 10));
  if (itemResult.isErr() || !isDisplayableItem(itemResult.value)) notFound();

  const item = itemResult.value;
  const comments: HnItem[] = [];
  for (const id of item.kids?.slice(0, 12) ?? []) {
    const commentResult = await hn.getItem(id);
    if (
      commentResult.isOk() &&
      isDisplayableItem(commentResult.value) &&
      commentResult.value.type === "comment"
    ) {
      comments.push(commentResult.value);
    }
  }

  return { comments, item };
}

export default function Page(props: { data: StoryDetailData }) {
  return (
    <main>
      <StoryDetail comments={props.data.comments} item={props.data.item} />
    </main>
  );
}

function StoryDetail(props: StoryDetailData) {
  const text = formatHnText(props.item.text);

  return (
    <article data-testid="story-detail" class="space-y-4">
      <header class="border-b border-orange-200 pb-3">
        <h1 class="text-xl font-semibold leading-tight text-stone-950">
          {props.item.title ?? "Item"}
        </h1>
        <p class="mt-0.5 text-xs leading-5 text-stone-500">
          {props.item.score === undefined ? null : <>{pluralize(props.item.score, "point")} by </>}
          {props.item.by === undefined ? (
            "unknown"
          ) : (
            <a
              data-testid="story-user-link"
              href={`/user/${encodeURIComponent(props.item.by)}`}
              class="hover:underline"
            >
              {props.item.by}
            </a>
          )}{" "}
          {formatRelativeTime(props.item.time)}
          {" | "}
          {pluralize(props.item.descendants ?? props.item.kids?.length ?? 0, "comment")}
        </p>
        {props.item.url === undefined ? null : (
          <p class="mt-1 text-xs text-stone-600">
            <a class="hover:underline" href={props.item.url} rel="noreferrer" target="_blank">
              {formatHost(props.item.url)}
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

function Comment(props: { comment: HnItem }) {
  const text = formatHnText(props.comment.text);

  return (
    <article class="border-l-2 border-orange-300 bg-orange-50/50 py-2 pl-3">
      <p class="text-xs text-stone-500">
        {props.comment.by === undefined ? (
          "unknown user"
        ) : (
          <a href={`/user/${encodeURIComponent(props.comment.by)}`} class="hover:underline">
            {props.comment.by}
          </a>
        )}{" "}
        {formatRelativeTime(props.comment.time)}
      </p>
      <p class="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-800">
        {text.length === 0 ? "[no text]" : text}
      </p>
    </article>
  );
}
