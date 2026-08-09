import { describe, expect, test } from "vitest";
import { isCurrentPrerenderedRoute } from "../src/prerender-entry.js";

describe("prerender entry validation", () => {
  test.each([
    ["Set-Cookie", "session=visitor-a"],
    ["Vary", "Cookie"],
    ["Cache-Control", "private, max-age=60"],
    ["Cache-Control", "no-cache"],
    ["Cache-Control", "no-store"],
    ["X-Mreact-Cache", "DYNAMIC"],
  ])("rejects a current-schema entry with visitor-dependent %s", (name, value) => {
    expect(
      isCurrentPrerenderedRoute({
        headers: { [name]: value },
        html: "<main>visitor A</main>",
        schemaVersion: 1,
        status: 200,
      }),
    ).toBe(false);
  });

  test("accepts a current-schema entry with shareable response headers", () => {
    expect(
      isCurrentPrerenderedRoute({
        headers: {
          "cache-control": "public, max-age=60",
          "content-type": "text/html; charset=utf-8",
        },
        html: "<main>shared</main>",
        schemaVersion: 1,
        status: 200,
      }),
    ).toBe(true);
  });
});
