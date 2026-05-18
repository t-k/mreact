import type { HnItem } from "./types.js";

export function formatHost(url: string | undefined): string {
  if (url === undefined || url.length === 0) return "news.ycombinator.com";

  try {
    const host = new URL(url).hostname;
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

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
