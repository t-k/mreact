import { FeedPage } from "../../hn/feed.mreact.js";

export const metadata = {
  title: "Jobs",
};

export const stream = true;

export default function Page() {
  return (
    <FeedPage
      emptyMessage="No Jobs are visible."
      errorMessage="Could not load Jobs."
      feed="job"
      title="Jobs"
    />
  );
}
