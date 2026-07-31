import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("reactive-core tracking hot path", () => {
  test("checks the ordered dependency fast path before same-pass duplicate tracking", async () => {
    const source = await readFile(new URL("../src/tracking.ts", import.meta.url), "utf8");

    const orderedFastPath = source.indexOf("orderedDeps[orderedIndex] === source");
    const duplicateCheck = source.indexOf(
      "source.trackedBy === computation && source.trackedVersion === trackingVersion",
    );

    expect(orderedFastPath).toBeGreaterThanOrEqual(0);
    expect(duplicateCheck).toBeGreaterThanOrEqual(0);
    expect(orderedFastPath).toBeLessThan(duplicateCheck);
  });

  test("uses the module dispatcher instead of per-computation tracking forwarders", async () => {
    const [state, computed, effect, tracking] = await Promise.all([
      readFile(new URL("../src/state.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/computed.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/effect.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/tracking.ts", import.meta.url), "utf8"),
    ]);

    expect(state).not.toContain("trackSource?(source: Source): void");
    expect(computed).not.toMatch(/\btrackSource\(source\)\s*\{/);
    expect(effect).not.toMatch(/\btrackSource\(source\)\s*\{/);
    expect(tracking).toContain("trackIncrementalSource(source, tracker)");
  });

  test("shares effect computation methods across instances", async () => {
    const source = await readFile(new URL("../src/effect.ts", import.meta.url), "utf8");

    expect(source).toContain("const EFFECT_COMPUTATION_METHODS");
    expect(source).not.toContain("markDirty() {");
    expect(source).not.toContain("run() {");
    expect(source).not.toContain("dispose() {");
  });

  test("uses a direct teardown path for one tracked dependency", async () => {
    const source = await readFile(new URL("../src/tracking.ts", import.meta.url), "utf8");

    const singletonBranch = source.indexOf("if (computation.deps.size === 1)");
    const genericLoop = source.indexOf("for (const dep of computation.deps)");

    expect(singletonBranch).toBeGreaterThanOrEqual(0);
    expect(genericLoop).toBeGreaterThan(singletonBranch);
  });
});
