// AnalyticsTracker.client.tsx — SPA page_view bridge.
//
// `.client.tsx` marks this component as a client boundary. The server page
// (app/analytics/page.tsx) renders it as JSX, so only this island ships
// JavaScript and hydrates on the client; the surrounding page stays static
// server HTML. Its interactive capability — a `cell` readout plus a
// `subscribeNavigationState` listener — is what makes it a client island.
//
// What it does: it turns mreact's public navigation-state API into GTM/GA
// `page_view` events on `window.dataLayer`.
//
// Timing: `subscribeNavigationState` fires with `pending:false` AFTER the new
// route HTML has been applied (see __mreactNavigate's finally block), so
// `location.pathname` is already current when we read it.
//
// Lifecycle note (why everything below is idempotent): a native `.client.tsx`
// island is hydrated by a bare `component(props)` call that is NOT wrapped in a
// cleanup scope, and it is NOT disposed on SPA navigation. So when the user
// navigates away from /analytics and back, this component re-runs from scratch
// — a fresh `cell` and a fresh function body. If we naively re-subscribed and
// re-pushed on every mount we would leak a navigation listener per visit (the
// unsubscribe return value would be discarded) and emit duplicate page_views.
//
// `effect()` does NOT solve this: it registers its disposer into the *current*
// cleanup scope, but this island mounts outside any cleanup scope, so the
// disposer would never run — same leak.
//
// The fix mirrors how a real analytics tag behaves: the listener is installed
// exactly ONCE per page load (guarded by a flag on `window`), and
// `window.dataLayer` itself is the persistent source of truth for "what has
// already been tracked". Pushes are de-duped against the last page_view entry,
// and the visible readout is derived from `dataLayer` so it stays accurate
// across re-mounts instead of resetting with each new `cell`.
import { cell } from "@reckona/mreact-reactive-core";
import { subscribeNavigationState } from "@reckona/mreact-router/navigation-state";

interface AnalyticsTrackerProps {
  measurementId: string;
}

interface PageViewEvent {
  event: "page_view";
  page_path: string;
}

// The persistent globals this island reads from / writes to. `dataLayer` is the
// real GTM queue; `__mreactAnalyticsTrackerInstalled` is our once-per-page-load
// install guard so the navigation listener is never registered twice.
type AnalyticsWindow = typeof window & {
  dataLayer?: unknown[];
  __mreactAnalyticsTrackerInstalled?: boolean;
};

function analyticsWindow(): AnalyticsWindow | undefined {
  return typeof window === "undefined" ? undefined : (window as AnalyticsWindow);
}

function currentPath(): string {
  if (typeof location === "undefined") {
    return "/analytics";
  }
  return location.pathname + location.search;
}

function isPageViewEvent(value: unknown): value is PageViewEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { event?: unknown }).event === "page_view" &&
    typeof (value as { page_path?: unknown }).page_path === "string"
  );
}

// All `page_view` entries currently in the dataLayer. This is the persistent
// source of truth: it survives re-mounts (the per-mount `cell` does not), and
// reflects exactly what has been tracked this page load.
function pageViews(): PageViewEvent[] {
  const w = analyticsWindow();
  if (w === undefined) {
    return [];
  }
  return (w.dataLayer ?? []).filter(isPageViewEvent);
}

// Push a page_view only if `path` differs from the most recent one already in
// the dataLayer. Doing the de-dupe against the persistent queue (not a
// per-mount cell) is what makes both the initial push and every navigation push
// idempotent across re-mounts: the same completed navigation is counted once.
// Returns true when a new event was actually pushed.
function pushPageViewIfNew(path: string): boolean {
  const w = analyticsWindow();
  if (w === undefined) {
    return false;
  }
  w.dataLayer = w.dataLayer ?? [];

  const tracked = pageViews();
  const last = tracked[tracked.length - 1];
  if (last !== undefined && last.page_path === path) {
    return false;
  }

  // page_path only — never user input or PII. Payload shape is exactly
  // `{ event: "page_view", page_path }`.
  w.dataLayer.push({ event: "page_view", page_path: path });
  return true;
}

export function AnalyticsTracker(props: AnalyticsTrackerProps) {
  // Record the initial page load exactly once. On a re-mount (SPA back-nav to
  // /analytics) the navigation-complete listener has already pushed this path,
  // so `pushPageViewIfNew` is a no-op here and the path is never double-counted.
  pushPageViewIfNew(currentPath());

  // Derive the readout from the persistent dataLayer so it stays accurate
  // across re-mounts rather than resetting with each fresh `cell`.
  const tracked = pageViews();
  const count = cell<number>(tracked.length);
  const lastPath = cell<string>(
    tracked.length > 0 ? tracked[tracked.length - 1].page_path : currentPath(),
  );

  // Re-read the dataLayer and sync the (current mount's) cells. Called from the
  // single persistent listener; if this mount has since been replaced, the
  // stale cells simply go unread — harmless.
  const syncReadoutFromDataLayer = () => {
    const events = pageViews();
    count.set(events.length);
    if (events.length > 0) {
      lastPath.set(events[events.length - 1].page_path);
    }
  };

  // Install the navigation listener EXACTLY ONCE per page load. The guard lives
  // on `window` (not on a cell/closure) because this island can re-mount but is
  // never disposed: a second subscription would leak and emit duplicate events.
  // The unsubscribe handle is intentionally discarded — the listener is meant
  // to live for the whole page load, just like a real analytics tag.
  const w = analyticsWindow();
  if (w !== undefined && w.__mreactAnalyticsTrackerInstalled !== true) {
    w.__mreactAnalyticsTrackerInstalled = true;

    // Every completed client navigation (pending → false) is a page_view.
    subscribeNavigationState((state) => {
      if (state.pending === false) {
        if (pushPageViewIfNew(currentPath())) {
          syncReadoutFromDataLayer();
        }
      }
    });
  }

  return (
    <aside class="analytics-tracker" data-testid="analytics-tracker">
      <h3>SPA page_view tracker</h3>
      <p>
        Measurement ID: <code>{props.measurementId}</code>
      </p>
      <p>
        Last <code>page_view</code> path:{" "}
        <strong data-testid="analytics-last-path">{lastPath.get()}</strong>
      </p>
      <p>
        page_view count this session:{" "}
        <strong data-testid="analytics-count">{count.get()}</strong>
      </p>
      <p class="muted">
        Each event is pushed to <code>window.dataLayer</code> as{" "}
        <code>{`{ event: "page_view", page_path }`}</code>. Navigate away and
        back via the nav above to see the count rise.
      </p>
    </aside>
  );
}
