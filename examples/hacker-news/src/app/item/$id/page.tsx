import { notFound } from "@reckona/mreact-router";
import { hn } from "../../../hn/client.js";
import { isDisplayableItem } from "../../../hn/format.js";
import { StoryDetail, type StoryDetailData } from "../../../hn/render.js";
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
