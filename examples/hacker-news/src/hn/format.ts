import type { HnItem } from "./types.js";

const namedHtmlEntities: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: "\u00a0",
  quot: "\"",
};

export function formatHost(url: string | undefined): string {
  if (url === undefined || url.length === 0) return "news.ycombinator.com";

  try {
    const host = new URL(url).hostname;
    if (host.length === 0) return "news.ycombinator.com";

    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return "news.ycombinator.com";
  }
}

export function formatRelativeTime(time: number | undefined, now = Math.floor(Date.now() / 1000)): string {
  if (time === undefined) return "unknown time";

  const seconds = Math.max(0, now - time);
  if (seconds < 60) return pluralize(seconds, "second") + " ago";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return pluralize(minutes, "minute") + " ago";

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return pluralize(hours, "hour") + " ago";

  return pluralize(Math.floor(hours / 24), "day") + " ago";
}

export function pluralize(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

export function formatAwaitError(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : "Unknown error";
}

// Returns plain text for JSX text rendering; do not pass the result to raw HTML sinks.
export function formatHnText(value: string | undefined): string {
  if (value === undefined) return "";

  return decodeHtmlEntities(
    value
      .replace(/<p>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

export function isDisplayableItem(item: HnItem | null): item is HnItem {
  return item !== null && item.deleted !== true && item.dead !== true;
}

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (entity, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return decodeNumericEntity(entity, Number.parseInt(body.slice(2), 16));
    }

    if (body.startsWith("#")) {
      return decodeNumericEntity(entity, Number.parseInt(body.slice(1), 10));
    }

    return namedHtmlEntities[body.toLowerCase()] ?? entity;
  });
}

function decodeNumericEntity(entity: string, codePoint: number): string {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return entity;

  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return entity;
  }
}
