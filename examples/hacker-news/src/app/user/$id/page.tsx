import { notFound } from "@reckona/mreact-router";
import { hn } from "../../../hn/client.js";
import { isDisplayableItem } from "../../../hn/format.js";
import { UserProfile, type UserProfileData } from "../../../hn/render.js";
import type { HnItem } from "../../../hn/types.js";

interface LoaderContext {
  params: { id: string };
}

export async function loader(context: LoaderContext): Promise<UserProfileData> {
  const userResult = await hn.getUser(context.params.id);
  if (userResult.isErr() || userResult.value === null) notFound();

  const stories: HnItem[] = [];
  for (const id of userResult.value.submitted ?? []) {
    if (stories.length >= 20) break;

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
