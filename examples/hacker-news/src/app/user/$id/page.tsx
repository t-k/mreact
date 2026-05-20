import { defer, notFound } from "@reckona/mreact-router";
import { hn } from "../../../hn/client.js";
import { isDisplayableItem } from "../../../hn/format.js";
import { UserProfileShell, UserStorySubmissions } from "../../../hn/render.js";
import type { HnItem, HnUser } from "../../../hn/types.js";

const RECENT_SUBMISSION_SCAN_LIMIT = 80;
const USER_STORY_DISPLAY_LIMIT = 20;

interface LoaderContext {
  params: { id: string };
}

interface UserProfileRouteData {
  stories: Promise<HnItem[]>;
  user: HnUser;
}

export const stream = true;

export async function loader(context: LoaderContext) {
  const userResult = await hn.getUser(context.params.id);
  if (userResult.isErr() || userResult.value === null) notFound();

  return defer({
    stories: loadUserStories(userResult.value.submitted ?? []),
    user: userResult.value,
  });
}

async function loadUserStories(submitted: number[]): Promise<HnItem[]> {
  const stories: HnItem[] = [];
  for (const id of submitted.slice(0, RECENT_SUBMISSION_SCAN_LIMIT)) {
    if (stories.length >= USER_STORY_DISPLAY_LIMIT) break;

    const itemResult = await hn.getItem(id);
    if (
      itemResult.isOk() &&
      isDisplayableItem(itemResult.value) &&
      itemResult.value.type === "story"
    ) {
      stories.push(itemResult.value);
    }
  }

  return stories;
}

export default function Page(props: { data: UserProfileRouteData }) {
  return (
    <main>
      <UserProfileShell user={props.data.user}>
        <Await
          value={props.data.stories}
          placeholderAs="section"
          placeholder={
            <>
              <h2
                id="submissions-heading"
                class="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-600"
              >
                Recent stories
              </h2>
              <p class="text-sm text-stone-600">Loading submissions...</p>
            </>
          }
        >
          {(stories) => <UserStorySubmissions stories={stories} />}
        </Await>
      </UserProfileShell>
    </main>
  );
}
