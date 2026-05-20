import { FeedPage } from "../../hn/feed.mreact.js";

export const metadata = {
  title: "Show HN",
};

export const stream = true;

export default function Page() {
  return (
    <FeedPage
      emptyMessage="No Show HN stories are visible."
      errorMessage="Could not load Show HN."
      feed="show"
      title="Show HN"
    />
  );
}
