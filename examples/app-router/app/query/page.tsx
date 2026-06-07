// /query — server prefetch + client hydration with @reckona/mreact-query.
//
// The loader calls `queryClient.fetchQuery(...)` against the per-request
// QueryClient the router supplies. After render the router dehydrates
// that client into a <script id="__mreact_query_state"> tag. On the
// client, `getQueryClient` constructs a singleton, hydrates from the
// script, and `createQuery` returns a reactive observer. This example passes
// `staleTime` so the observer keeps the server-fetched entry during the
// initial mount. Without `staleTime`, browser observers revalidate hydrated
// entries on mount.
import { createQuery, getQueryClient, type QueryKey } from "@reckona/mreact-query";
import type { LoaderContext } from "@reckona/mreact-router";

interface TimeData {
  value: string;
  randomId: number;
}

const TIME_KEY: QueryKey = ["time"];
const TIME_STALE_TIME_MS = 30_000;

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
    staleTime: TIME_STALE_TIME_MS,
    queryFn: fetchTime,
  });
}

export default function Page(props: { data: TimeData }) {
  const client = getQueryClient();
  const observer = createQuery<TimeData>(client, {
    queryKey: TIME_KEY,
    staleTime: TIME_STALE_TIME_MS,
    queryFn: fetchTime,
  });
  const live = observer.result.get();

  return (
    <main>
      <h1>Query</h1>
      <p>
        The loader called <code>queryClient.fetchQuery</code> against the per-request{" "}
        <code>QueryClient</code> the router supplies. After render the router dehydrated that cache
        into a <code>{'<script id="__mreact_query_state">'}</code> tag. On the client,{" "}
        <code>createQuery</code> reads the pre-populated cache because this example passes{" "}
        <code>staleTime</code>. Without that fresh window, browser observers revalidate hydrated
        entries on mount. The client refetch button exercises the same hydrated observer after the
        initial server render.
      </p>
      <dl class="kv">
        <dt>Loader value</dt>
        <dd>
          <code>{props.data.value}</code> · random id <code>{props.data.randomId}</code>
        </dd>
        <dt>Reactive value</dt>
        <dd>
          <code>{live.data?.value ?? "(pending)"}</code> · random id{" "}
          <code>{live.data?.randomId ?? "?"}</code>
        </dd>
        <dt>Status</dt>
        <dd>
          <code>{live.status}</code>
        </dd>
      </dl>
      <button type="button" onClick={() => void observer.refetch()}>
        Refetch on client
      </button>
      <form method="get" action="/query">
        <button type="submit">Refresh document</button>
      </form>
      <p class="muted">
        Initial load: both rows match while <code>staleTime</code> covers the server fetch time.
        Refetch on client updates the reactive row without a page reload. Refresh document re-runs
        the loader so the next render shows a fresh ISO timestamp and random id.
      </p>
    </main>
  );
}
