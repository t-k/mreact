import { FeedPage } from "../hn/feed.mreact.js";

export const metadata = {
  title: "Top Stories",
};

export const stream = true;

export default function Page() {
  return (
    <FeedPage
      emptyMessage="No Top Stories are visible."
      errorMessage="Could not load Top Stories."
      feed="top"
      title="Top Stories"
    />
  );
}
