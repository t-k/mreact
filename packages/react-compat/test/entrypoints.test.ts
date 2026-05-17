import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  Activity,
  Component,
  Fragment,
  Profiler,
  PureComponent,
  cache,
  cacheSignal,
  captureOwnerStack,
  createElement,
  createRef,
  createRoot,
  render,
  useCallback,
  useDebugValue,
  useEffectEvent,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  use,
  useActionState,
  unstable_useCacheRefresh,
  version,
} from "../src/index.js";

describe("react-compat entrypoints", () => {
  test("exports the Phase 7 public API", () => {
    expect(Fragment).toBeDefined();
    expect(Activity).toBeDefined();
    expect(Profiler).toBeDefined();
    expect(Component).toBeTypeOf("function");
    expect(PureComponent).toBeTypeOf("function");
    expect(cache).toBeTypeOf("function");
    expect(cacheSignal).toBeTypeOf("function");
    expect(captureOwnerStack).toBeTypeOf("function");
    expect(createElement).toBeTypeOf("function");
    expect(createRef).toBeTypeOf("function");
    expect(createRoot).toBeTypeOf("function");
    expect(render).toBeTypeOf("function");
    expect(useState).toBeTypeOf("function");
    expect(use).toBeTypeOf("function");
    expect(useActionState).toBeTypeOf("function");
    expect(useRef).toBeTypeOf("function");
    expect(useMemo).toBeTypeOf("function");
    expect(useOptimistic).toBeTypeOf("function");
    expect(useCallback).toBeTypeOf("function");
    expect(useDebugValue).toBeTypeOf("function");
    expect(useEffectEvent).toBeTypeOf("function");
    expect(unstable_useCacheRefresh).toBeTypeOf("function");
    expect(version).toBe("19.2.6");
  });

  test("exposes stable workspace integration subpaths without using the internal export", async () => {
    const manifest = JSON.parse(
      await readFile(join(process.cwd(), "packages", "react-compat", "package.json"), "utf8"),
    ) as { exports?: Record<string, unknown> };

    expect(manifest.exports).toHaveProperty("./event-priority");
    expect(manifest.exports).toHaveProperty("./scheduler");
  });
});
