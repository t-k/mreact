import { FeedPage } from "../../hn/feed.mreact.js";

export const metadata = {
  title: "New Stories",
};

export const stream = true;

export default function Page() {
  return (
    <FeedPage
      emptyMessage="No New Stories are visible."
      errorMessage="Could not load New Stories."
      feed="new"
      title="New Stories"
    />
  );
}
