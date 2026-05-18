import { hn } from "../../hn/client.js";
import { StoryList } from "../../hn/render.js";
import type { HnItem } from "../../hn/types.js";

type FeedData = { kind: "error"; message: string } | { kind: "loaded"; stories: HnItem[] };

export const metadata = {
  title: "Jobs",
};

export async function loader(): Promise<FeedData> {
  const result = await hn.getStories("job", 30);
  if (result.isErr()) return { kind: "error", message: "Could not load Jobs." };

  return { kind: "loaded", stories: result.value };
}

export default function Page(props: { data: FeedData }) {
  return (
    <main>
      <h1 class="mb-3 text-xl font-semibold text-stone-950">Jobs</h1>
      {props.data.kind === "error" ? (
        <p role="alert" class="text-sm text-red-700">
          {props.data.message}
        </p>
      ) : props.data.stories.length === 0 ? (
        <p role="alert" class="text-sm text-stone-600">
          No Jobs are visible.
        </p>
      ) : (
        <StoryList stories={props.data.stories} />
      )}
    </main>
  );
}
