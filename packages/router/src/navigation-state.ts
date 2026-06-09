/**
 * Names the client navigation operation that produced the current router state.
 */
export type AppRouterNavigationType = "push" | "replace" | "pop" | "refresh";

/**
 * Describes the latest client-side app-router navigation state.
 */
export interface AppRouterNavigationState {
  pending: boolean;
  from: string | null;
  to: string | null;
  type: AppRouterNavigationType | null;
}

/**
 * Receives app-router client navigation state updates.
 */
export type AppRouterNavigationStateListener = (
  state: AppRouterNavigationState,
) => void;

const idleNavigationState: AppRouterNavigationState = {
  from: null,
  pending: false,
  to: null,
  type: null,
};

/**
 * Reads the current client navigation state snapshot.
 */
export function getNavigationState(): AppRouterNavigationState {
  const runtimeState = (globalThis as {
    __mreactNavigationState?: { current?: unknown };
  }).__mreactNavigationState?.current;
  const normalized = normalizeNavigationState(runtimeState);

  if (normalized !== undefined) {
    return normalized;
  }

  return navigationStateFromDocument();
}

/**
 * Subscribes to app-router client navigation state changes.
 */
export function subscribeNavigationState(
  listener: AppRouterNavigationStateListener,
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleNavigationStateChange = (event: Event) => {
    const state = normalizeNavigationState((event as CustomEvent<unknown>).detail);

    if (state !== undefined) {
      listener(state);
    }
  };

  window.addEventListener("mreact:navigation-state-change", handleNavigationStateChange);

  return () => {
    window.removeEventListener("mreact:navigation-state-change", handleNavigationStateChange);
  };
}

function navigationStateFromDocument(): AppRouterNavigationState {
  if (typeof document === "undefined") {
    return { ...idleNavigationState };
  }

  const root = document.documentElement;

  if (root.getAttribute("data-mreact-navigation-pending") !== "true") {
    return { ...idleNavigationState };
  }

  return {
    from: root.getAttribute("data-mreact-navigation-from"),
    pending: true,
    to: root.getAttribute("data-mreact-navigation-to"),
    type: navigationType(root.getAttribute("data-mreact-navigation-type")),
  };
}

function normalizeNavigationState(value: unknown): AppRouterNavigationState | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }

  const state = value as Partial<AppRouterNavigationState>;

  if (typeof state.pending !== "boolean") {
    return undefined;
  }

  return {
    from: typeof state.from === "string" ? state.from : null,
    pending: state.pending,
    to: typeof state.to === "string" ? state.to : null,
    type: navigationType(state.type),
  };
}

function navigationType(value: unknown): AppRouterNavigationType | null {
  return value === "push" || value === "replace" || value === "pop" || value === "refresh"
    ? value
    : null;
}
