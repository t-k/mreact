// /query — server prefetch + client hydration with @reckona/mreact-query.
//
// The loader calls `queryClient.fetchQuery(...)` against the per-request
// QueryClient the router supplies. After render the router dehydrates
// that client into a <script id="__mreact_query_state"> tag. On the
// client, `getQueryClient` constructs a singleton, hydrates from the
// script, and `createQuery` returns a reactive observer that reads the
// cached entry — no second fetch on initial render.
import {
  createQuery,
  getQueryClient,
  type QueryKey,
} from "@reckona/mreact-query";
import type { LoaderContext } from "@reckona/mreact-router";

interface TimeData {
  value: string;
  randomId: number;
}

const TIME_KEY: QueryKey = ["time"];

async function fetchTime(): Promise<TimeData> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return {
    value: new Date().toISOString(),
    randomId: Math.floor(Math.random() * 1000),
  };
}

export async function loader(context: LoaderContext): Promise<TimeData> {
  return context.queryClient.fetchQuery({
    queryKey: TIME_KEY,
    queryFn: fetchTime,
  });
}

export default function Page(props: { data: TimeData }) {
  const client = getQueryClient();
  const observer = createQuery<TimeData>(client, {
    queryKey: TIME_KEY,
    queryFn: fetchTime,
  });
  const live = observer.result.get();

  return (
    <main>
      <h1>Query</h1>
      <p>
        The loader called <code>queryClient.fetchQuery</code> against
        the per-request <code>QueryClient</code> the router supplies.
        After render the router dehydrated that cache into a{" "}
        <code>{'<script id="__mreact_query_state">'}</code> tag. On the
        client, <code>createQuery</code> reads the pre-populated cache
        instead of re-fetching.
      </p>
      <dl class="kv">
        <dt>Loader value</dt>
        <dd>
          <code>{props.data.value}</code> · random id{" "}
          <code>{props.data.randomId}</code>
        </dd>
        <dt>Reactive value</dt>
        <dd>
          <code>{live.data?.value ?? "(pending)"}</code> · random id{" "}
          <code>{live.data?.randomId ?? "?"}</code>
        </dd>
        <dt>Status</dt>
        <dd><code>{live.status}</code></dd>
      </dl>
      <form method="get" action="/query">
        <button type="submit">Refresh</button>
      </form>
      <p class="muted">
        Initial load: both rows match (SSR cache hit, no client fetch).
        Refresh re-runs the loader so the next render shows a fresh
        ISO timestamp and random id — the "reactive value" row picks
        up the new entry through the hydrated client. (A client-only{" "}
        <code>observer.refetch()</code> would also do this without a
        page reload; we use a plain form here so the route stays a
        pure server-render with no JS bundle.)
      </p>
    </main>
  );
}
