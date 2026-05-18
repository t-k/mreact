import { describe, expect, test } from "vitest";
import {
  formatHost,
  formatHnText,
  formatRelativeTime,
  isDisplayableItem,
  pluralize,
} from "./format.js";

describe("HN formatting", () => {
  test("extracts a readable host from an absolute URL", () => {
    expect(formatHost("https://www.example.com/articles/42?from=hn")).toBe("example.com");
    expect(formatHost("https://sub.domain.example.org/path")).toBe("sub.domain.example.org");
  });

  test("returns Hacker News for missing or invalid story URLs", () => {
    expect(formatHost(undefined)).toBe("news.ycombinator.com");
    expect(formatHost("not a url")).toBe("news.ycombinator.com");
  });

  test("formats relative time using whole units", () => {
    const now = 1_700_000_000;
    expect(formatRelativeTime(now - 45, now)).toBe("45 seconds ago");
    expect(formatRelativeTime(now - 120, now)).toBe("2 minutes ago");
    expect(formatRelativeTime(now - 7_200, now)).toBe("2 hours ago");
    expect(formatRelativeTime(now - 172_800, now)).toBe("2 days ago");
  });

  test("pluralizes count labels", () => {
    expect(pluralize(1, "point")).toBe("1 point");
    expect(pluralize(2, "point")).toBe("2 points");
  });

  test("converts Hacker News HTML text into readable plain text", () => {
    expect(formatHnText("Hello<p>World&#x27;s link: <a href=\"https://example.com\">example</a>")).toBe(
      "Hello\n\nWorld's link: example",
    );
    expect(formatHnText(undefined)).toBe("");
  });

  test("filters deleted and dead items", () => {
    expect(isDisplayableItem({ id: 1, type: "story", deleted: true })).toBe(false);
    expect(isDisplayableItem({ id: 2, type: "story", dead: true })).toBe(false);
    expect(isDisplayableItem({ id: 3, type: "story", title: "Visible" })).toBe(true);
  });
});
