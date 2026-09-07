import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildClientRouteOutput } from "../src/client.js";
import { reactiveDevtoolsStubSource } from "../src/reactive-devtools-stub.js";
import * as reactiveDevtools from "../../reactive-core/src/devtools.js";

type StubModule = typeof reactiveDevtools;

async function loadStub(): Promise<StubModule> {
  return (await import(
    /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(reactiveDevtoolsStubSource)}`
  )) as StubModule;
}

afterEach(() => {
  delete (globalThis as { __mreactDevtools?: unknown }).__mreactDevtools;
});

describe("disabled client devtools stub", () => {
  test("shares one resource handle instead of allocating one per registration", async () => {
    const stub = await loadStub();

    const computedHandle = stub.registerReactiveDevtoolsResource("computed");
    const effectHandle = stub.registerReactiveDevtoolsResource("effect", { name: "sync" });
    const scopeHandle = stub.registerReactiveDevtoolsResource("scope");

    // Nothing observes the handle in a disabled client bundle, so every reactive resource can hold
    // the same one instead of retaining an object and two closures for its whole lifetime.
    expect(computedHandle).toBe(effectHandle);
    expect(effectHandle).toBe(scopeHandle);
  });

  test("keeps repeated update and disposal on the shared handle safe", async () => {
    const stub = await loadStub();

    const handle = stub.registerReactiveDevtoolsResource("effect");
    const other = stub.registerReactiveDevtoolsResource("computed");

    expect(handle.update({ label: "first" })).toBeUndefined();
    expect(handle.dispose()).toBeUndefined();
    expect(handle.dispose()).toBeUndefined();
    // Disposing one resource must not make the handle unusable for every other resource.
    expect(other.update({ label: "second" })).toBeUndefined();
    expect(other.dispose()).toBeUndefined();
  });

  test("reports no emitter or inspector so a shared handle can never leak diagnostics", async () => {
    const stub = await loadStub();

    (globalThis as { __mreactDevtools?: unknown }).__mreactDevtools = {
      emit: () => undefined,
      resources: () => ({ register: () => ({ dispose: () => undefined, update: () => undefined }) }),
    };

    expect(stub.hasReactiveDevtoolsEmitter()).toBe(false);
    expect(stub.currentDevtoolsEmitter()).toBeUndefined();
    expect(stub.currentReactiveDevtools()).toBeUndefined();
    expect(stub.prepareReactiveEffectRunDevtoolsEvent()).toBeUndefined();
    expect(stub.emitReactiveDevtoolsEvent({ type: "ignored" })).toBeUndefined();
    expect(stub.invalidateReactiveDevtoolsCache()).toBeUndefined();
  });

  test("exports exactly the reactive-core devtools module surface", async () => {
    const stub = await loadStub();

    expect(Object.keys(stub).sort()).toEqual(Object.keys(reactiveDevtools).sort());
  });

  test("hoists the handle out of the registration function in a minified route bundle", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-devtools-stub-emit-"));
    const filename = join(appDir, "page.mreact.tsx");
    const code = `import { cell, computed, effect } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  const doubled = computed(() => count.get() * 2);
  effect(() => { document.title = String(doubled.get()); });
  return <button type="button" onClick={() => count.set((value) => value + 1)}>count: {doubled.get()}</button>;
}`;
    await writeFile(filename, code);

    const output = await buildClientRouteOutput({
      code,
      filename,
      minify: true,
      routePath: "/",
    });
    const handlePattern = /dispose\(\)\s*\{\s*\}\s*,\s*update\(\)\s*\{\s*\}/gu;

    // One literal for the whole bundle, and it must not sit in a return position: computed, effect
    // and cleanup scopes each retain their handle, so a returned literal is retained per resource.
    expect([...output.code.matchAll(handlePattern)]).toHaveLength(1);
    expect(output.code).not.toMatch(/return\s*\{\s*dispose\(\)\s*\{\s*\}/u);
    expect(output.code).toMatch(/=\s*Object\.freeze\(\{\s*dispose\(\)\s*\{\s*\}/u);
  }, 60_000);
});

describe("enabled reactive devtools", () => {
  test("still gives every registered resource its own handle from the inspector registry", () => {
    const registered: Array<Record<string, unknown>> = [];
    (globalThis as { __mreactDevtools?: unknown }).__mreactDevtools = {
      resources: () => ({
        register: (input: Record<string, unknown>) => {
          registered.push(input);
          return { dispose: () => undefined, update: () => undefined };
        },
      }),
    };
    reactiveDevtools.invalidateReactiveDevtoolsCache();

    const first = reactiveDevtools.registerReactiveDevtoolsResource("computed");
    const second = reactiveDevtools.registerReactiveDevtoolsResource("effect", { name: "sync" });

    expect(first).not.toBe(second);
    expect(registered).toEqual([
      { kind: "computed" },
      { kind: "effect", name: "sync" },
    ]);
  });
});
