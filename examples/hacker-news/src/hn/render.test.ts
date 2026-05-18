import { describe, expect, test } from "vitest";
import { safeHttpUrl } from "./render.js";

describe("HN render helpers", () => {
  test("allows only http and https story URLs", () => {
    expect(safeHttpUrl("https://example.com/story")).toBe("https://example.com/story");
    expect(safeHttpUrl("http://example.com/story")).toBe("http://example.com/story");
    expect(safeHttpUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeHttpUrl("data:text/html,<script>alert(1)</script>")).toBeUndefined();
    expect(safeHttpUrl("java\nscript:alert(1)")).toBeUndefined();
    expect(safeHttpUrl(undefined)).toBeUndefined();
  });
});
