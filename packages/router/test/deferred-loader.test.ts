import { describe, expect, test } from "vitest";
import { defer, isDeferredLoaderData, unwrapDeferredLoaderData } from "../src/deferred.js";

describe("deferred loader data", () => {
  test("marks deferred loader data without awaiting nested promises", () => {
    const stories = Promise.resolve([{ id: 1 }]);
    const data = defer({ stories, user: { id: "ada" } });

    expect(isDeferredLoaderData(data)).toBe(true);
    expect(unwrapDeferredLoaderData(data)).toEqual({
      stories,
      user: { id: "ada" },
    });
  });

  test("does not treat plain objects as deferred data", () => {
    expect(isDeferredLoaderData({ user: { id: "ada" } })).toBe(false);
  });
});
