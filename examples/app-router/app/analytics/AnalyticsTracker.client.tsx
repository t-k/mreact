// AnalyticsTracker.client.tsx — SPA page_view bridge.
//
// A `.client.tsx` island: it uses `cell` + an effect-like subscription, so the
// compiler infers it as a client boundary and the server page hydrates only
// this island. It turns mreact's public navigation-state API into GTM/GA
// `page_view` events on `window.dataLayer`.
//
// Timing: `subscribeNavigationState` fires with `pending:false` AFTER the new
// route HTML has been applied (see __mreactNavigate's finally block), so
// `location.pathname` is already current when we read it.
import { cell } from "@reckona/mreact-reactive-core";
import { subscribeNavigationState } from "@reckona/mreact-router/navigation-state";

interface AnalyticsTrackerProps {
  measurementId: string;
}

function currentPath(): string {
  if (typeof location === "undefined") {
    return "/analytics";
  }
  return location.pathname + location.search;
}

function pushPageView(path: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const w = window as typeof window & { dataLayer?: unknown[] };
  w.dataLayer = w.dataLayer ?? [];
  // page_path only — never user input or PII.
  w.dataLayer.push({ event: "page_view", page_path: path });
}

export function AnalyticsTracker(props: AnalyticsTrackerProps) {
  const lastPath = cell<string>(currentPath());
  const count = cell<number>(0);

  const track = (path: string) => {
    if (path === lastPath.get()) {
      return;
    }
    lastPath.set(path);
    count.set((value) => value + 1);
    pushPageView(path);
  };

  // Initial page_view for the path the island hydrates on.
  pushPageView(lastPath.get());
  count.set((value) => value + 1);

  // Every completed client navigation (pending → false) is a page_view.
  subscribeNavigationState((state) => {
    if (state.pending === false) {
      track(currentPath());
    }
  });

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
