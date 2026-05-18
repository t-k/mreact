import { FeedPage } from "../../hn/feed.mreact.js";

export const metadata = {
  title: "Best Stories",
};

export const stream = true;

export default function Page() {
  return (
    <FeedPage
      emptyMessage="No Best Stories are visible."
      errorMessage="Could not load Best Stories."
      feed="best"
      title="Best Stories"
    />
  );
}
