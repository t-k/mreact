import {
  createDevtools,
  getInstalledDevtools,
  installDevtools,
  type Devtools,
  type DevtoolsEvent,
} from "./index.js";

/** Re-exports the devtools event bus used by the overlay. */
export type { Devtools } from "./index.js";

/** Re-exports the devtools event shape rendered by the overlay. */
export type { DevtoolsEvent } from "./index.js";

/** Re-exports the devtools listener callback used by overlay subscriptions. */
export type { DevtoolsListener } from "./index.js";

/** Names the event category tabs displayed by the devtools overlay. */
export type DevtoolsOverlayTab = "query" | "reactive" | "router";

/** Configures document ownership, event source, and event retention for the devtools overlay. */
export interface DevtoolsOverlayOptions {
  devtools?: Devtools | undefined;
  document?: Document | undefined;
  maxEvents?: number | undefined;
}

/** Represents a mounted devtools overlay and its disposal handle. */
export interface MountedDevtoolsOverlay {
  devtools: Devtools;
  dispose(): void;
  element: HTMLElement;
}

interface TabDefinition {
  label: string;
  tab: DevtoolsOverlayTab;
}

const tabs: readonly TabDefinition[] = [
  { label: "Reactive", tab: "reactive" },
  { label: "Query", tab: "query" },
  { label: "Router", tab: "router" },
];

const defaultMaxEvents = 200;

/** Mounts a browser devtools overlay that groups recent mreact events by category. */
export function mountDevtoolsOverlay(
  options: DevtoolsOverlayOptions = {},
): MountedDevtoolsOverlay {
  const ownerDocument = options.document ?? documentFromGlobal();
  const maxEvents = normalizeMaxEvents(options.maxEvents);
  const devtools = options.devtools ?? getInstalledDevtools() ?? installDevtools(createDevtools());
  const events = devtools.events().slice(-maxEvents);
  const element = ownerDocument.createElement("section");
  const tabList = ownerDocument.createElement("nav");
  const eventList = ownerDocument.createElement("ol");
  let activeTab: DevtoolsOverlayTab = "reactive";
  let disposed = false;
  let renderScheduled = false;

  element.dataset.mreactDevtoolsOverlay = "";
  element.setAttribute("aria-label", "mreact devtools");
  Object.assign(element.style, {
    background: "#10151f",
    border: "1px solid #3b4350",
    borderRadius: "8px",
    bottom: "16px",
    boxShadow: "0 18px 50px rgb(0 0 0 / 0.35)",
    color: "#eef2f8",
    display: "grid",
    font: "12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    gap: "8px",
    maxHeight: "min(420px, calc(100vh - 32px))",
    overflow: "hidden",
    padding: "10px",
    position: "fixed",
    right: "16px",
    width: "min(520px, calc(100vw - 32px))",
    zIndex: "2147483647",
  });
  Object.assign(tabList.style, {
    display: "grid",
    gap: "6px",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  });
  Object.assign(eventList.style, {
    display: "grid",
    gap: "6px",
    listStyle: "none",
    margin: "0",
    overflow: "auto",
    padding: "0",
  });

  element.append(tabList, eventList);
  ownerDocument.body.append(element);

  const unsubscribe = devtools.subscribe((event) => {
    events.push(event);
    if (events.length > maxEvents) {
      events.splice(0, events.length - maxEvents);
    }
    scheduleRender();
  });

  render();

  return {
    devtools,
    dispose() {
      disposed = true;
      unsubscribe();
      element.remove();
    },
    element,
  };

  function render(): void {
    if (disposed) {
      return;
    }

    tabList.replaceChildren(...tabs.map((tab) => renderTab(ownerDocument, tab)));
    const visibleEvents = [...events].filter((event) => eventTab(event) === activeTab).reverse();

    if (visibleEvents.length === 0) {
      const empty = ownerDocument.createElement("li");
      empty.textContent = "No events";
      Object.assign(empty.style, {
        color: "#9aa8bc",
        padding: "12px 4px",
      });
      eventList.replaceChildren(empty);
      return;
    }

    eventList.replaceChildren(...visibleEvents.map((event) => renderEvent(ownerDocument, event)));
  }

  function scheduleRender(): void {
    if (renderScheduled || disposed) {
      return;
    }

    renderScheduled = true;
    queueMicrotask(() => {
      renderScheduled = false;
      render();
    });
  }

  function renderTab(doc: Document, definition: TabDefinition): HTMLButtonElement {
    const button = doc.createElement("button");
    const count = events.filter((event) => eventTab(event) === definition.tab).length;
    button.type = "button";
    button.textContent = `${definition.label} ${count}`;
    button.setAttribute("aria-pressed", String(definition.tab === activeTab));
    Object.assign(button.style, {
      background: definition.tab === activeTab ? "#d8e7ff" : "#1b2330",
      border: "1px solid #3b4350",
      borderRadius: "6px",
      color: definition.tab === activeTab ? "#111827" : "#d8e7ff",
      cursor: "pointer",
      font: "inherit",
      minHeight: "32px",
      overflow: "hidden",
      padding: "6px 8px",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    button.addEventListener("click", () => {
      activeTab = definition.tab;
      render();
    });

    return button;
  }
}

function renderEvent(doc: Document, event: DevtoolsEvent): HTMLLIElement {
  const item = doc.createElement("li");
  const title = doc.createElement("div");
  const meta = doc.createElement("div");
  const details = doc.createElement("pre");

  title.textContent = event.type;
  meta.textContent = [event.package, formatTimestamp(event.timestamp)].filter(Boolean).join(" | ");
  details.textContent = eventDetails(event);

  Object.assign(item.style, {
    background: "#161d28",
    border: "1px solid #303846",
    borderRadius: "6px",
    display: "grid",
    gap: "3px",
    padding: "8px",
  });
  Object.assign(title.style, {
    color: "#ffffff",
    fontWeight: "700",
    overflowWrap: "anywhere",
  });
  Object.assign(meta.style, {
    color: "#9aa8bc",
    overflowWrap: "anywhere",
  });
  Object.assign(details.style, {
    color: "#c8d7ec",
    margin: "0",
    overflow: "auto",
    whiteSpace: "pre-wrap",
  });

  item.append(title, meta, details);

  return item;
}

function eventDetails(event: DevtoolsEvent): string {
  const { package: _packageName, timestamp: _timestamp, type: _type, ...details } = event;

  return Object.keys(details).length === 0 ? "{}" : JSON.stringify(details);
}

function eventTab(event: DevtoolsEvent): DevtoolsOverlayTab {
  const search = `${event.package} ${event.type}`.toLowerCase();

  if (search.includes("router") || search.includes("route") || search.includes("navigation")) {
    return "router";
  }

  if (search.includes("query") || search.includes("mutation")) {
    return "query";
  }

  return "reactive";
}

function formatTimestamp(timestamp: number | undefined): string {
  return typeof timestamp === "number" ? new Date(timestamp).toISOString() : "";
}

function normalizeMaxEvents(value: number | undefined): number {
  return Number.isFinite(value) && value !== undefined && value > 0
    ? Math.floor(value)
    : defaultMaxEvents;
}

function documentFromGlobal(): Document {
  if (typeof document === "undefined") {
    throw new Error("mountDevtoolsOverlay requires a browser document.");
  }

  return document;
}
