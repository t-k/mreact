import { afterEach, describe, expect, test, vi } from "vitest";
import { createQuery, createQueryClient } from "../src/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("query refetch interval during server rendering", () => {
  test("does not schedule a polling timer without a browser window", () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    const observer = createQuery(createQueryClient(), {
      queryFn: async () => 1,
      queryKey: ["ssr-poll"],
      refetchInterval: 100,
    });

    expect(setTimeoutSpy).not.toHaveBeenCalled();
    observer.dispose();
  });
});
