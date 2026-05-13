import { describe, expect, test } from "vitest";
import { importAppRouterSourceModule } from "../src/module-runner.js";

describe("module-runner edge branches", () => {
  test("cached entry is returned on a second call without re-running the loader", async () => {
    const cacheKey = `cache-key-${Date.now()}-${Math.random()}`;
    const codeA = "export const value = 1;";
    const first = await importAppRouterSourceModule<{ value: number }>({
      cacheKey,
      code: codeA,
      label: "module-runner-cache-hit",
    });
    expect(first.value).toBe(1);

    // The cache key now memoizes the module. Changing the code should NOT
    // affect the cached result because the cache is keyed on cacheKey.
    const second = await importAppRouterSourceModule<{ value: number }>({
      cacheKey,
      code: "export const value = 999;",
      label: "module-runner-cache-hit",
    });
    expect(second.value).toBe(1);
  });

  test("a failed load removes the entry so the next attempt can retry", async () => {
    const cacheKey = `cache-key-fail-${Date.now()}-${Math.random()}`;

    // First call: deliberately broken module (`throw` at top level).
    await expect(
      importAppRouterSourceModule({
        cacheKey,
        code: `throw new Error("module-runner-test-throw");`,
        label: "module-runner-error",
      }),
    ).rejects.toThrow(/module-runner-test-throw/);

    // The failure must purge the cache entry so a recovered module loads.
    const recovered = await importAppRouterSourceModule<{ value: number }>({
      cacheKey,
      code: "export const value = 7;",
      label: "module-runner-error",
    });
    expect(recovered.value).toBe(7);
  });
});
