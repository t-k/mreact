import { FeedPage } from "../../hn/feed.mreact.js";

export const metadata = {
  title: "Ask HN",
};

export const stream = true;

export default function Page() {
  return (
    <FeedPage
      emptyMessage="No Ask HN stories are visible."
      errorMessage="Could not load Ask HN."
      feed="ask"
      title="Ask HN"
    />
  );
}
