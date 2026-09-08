// @vitest-environment happy-dom
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { createRoot } from "@reckona/mreact-reactive-dom";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { transform } from "../src/index.js";

interface CounterModule {
  Counter: () => Node;
  count: { setValue(value: number): void };
}

// Kept outside node_modules so vitest transforms the generated modules and
// resolves the runtime package aliases from the workspace config. `.cache/`
// is ignored by git.
const outputDir = join(dirname(fileURLToPath(import.meta.url)), ".cache", "exported-cell-multi-module");

function compileClient(filename: string, code: string): string {
  const output = transform({ code, filename, target: "client", dev: false });

  expect(output.diagnostics).toEqual([]);
  return output.code;
}

async function mountCounterWithPatchedGetter(counterSource: string): Promise<{
  dispose: () => void;
  host: HTMLElement;
  module: CounterModule;
}> {
  rmSync(outputDir, { force: true, recursive: true });
  mkdirSync(outputDir, { recursive: true });

  const stamp = `?case=${Date.now()}-${Math.random()}`;
  const counterCode = compileClient("counter.tsx", counterSource);
  writeFileSync(join(outputDir, "counter.js"), counterCode);
  // A second module that only sees the public export and rewires its getter.
  writeFileSync(
    join(outputDir, "consumer.js"),
    [
      `import { count } from "./counter.js${stamp}";`,
      "const originalGet = count.get;",
      "count.get = () => originalGet() * 10;",
      "export { count };",
    ].join("\n"),
  );

  // Import the consumer first so the patch is in place before mounting. The
  // query string keeps each case from reusing a cached module instance.
  await import(/* @vite-ignore */ `${pathToFileURL(join(outputDir, "consumer.js")).href}${stamp}`);
  const module = (await import(
    /* @vite-ignore */ `${pathToFileURL(join(outputDir, "counter.js")).href}${stamp}`
  )) as CounterModule;
  const host = document.createElement("div");
  const dispose = createRoot(host, module.Counter);

  return { dispose, host, module };
}

afterEach(() => {
  rmSync(outputDir, { force: true, recursive: true });
});

describe("exported cell across modules", () => {
  test.each([
    ["export const", "export const count = cell(1);"],
    ["export specifier", "const count = cell(1);\nexport { count };"],
  ])(
    "renders through the patched getter after an update when the cell is exported via %s",
    async (_label, declaration) => {
      const source = `import { cell } from "@reckona/mreact-reactive-core";
${declaration}
export function Counter() {
  return <span>{count.get()}</span>;
}`;
      const { dispose, host, module } = await mountCounterWithPatchedGetter(source);

      try {
        expect(host.querySelector("span")?.textContent).toBe("10");
        module.count.setValue(2);
        await flushEffects();
        // The direct binding would bypass the patched getter and print "2".
        expect(host.querySelector("span")?.textContent).toBe("20");
      } finally {
        dispose();
      }

      expect(compileClient("counter.tsx", source)).not.toContain("bindCellText(_text_0, count)");
    },
  );

  test("a module-private cell keeps the direct binding and renders its raw value", async () => {
    const source = `import { cell } from "@reckona/mreact-reactive-core";
const count = cell(1);
export function Counter() {
  globalThis.__exportedCellSet = (next) => count.setValue(next);
  return <span>{count.get()}</span>;
}`;
    const code = compileClient("counter.tsx", source);
    expect(code).toContain("bindCellText(_text_0, count)");

    rmSync(outputDir, { force: true, recursive: true });
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(join(outputDir, "counter.js"), code);
    const module = (await import(
      /* @vite-ignore */ `${pathToFileURL(join(outputDir, "counter.js")).href}?private`
    )) as CounterModule;
    const host = document.createElement("div");
    const dispose = createRoot(host, module.Counter);
    const set = (globalThis as typeof globalThis & { __exportedCellSet?: (next: number) => void })
      .__exportedCellSet;

    try {
      expect(host.querySelector("span")?.textContent).toBe("1");
      set?.(2);
      await flushEffects();
      expect(host.querySelector("span")?.textContent).toBe("2");
    } finally {
      dispose();
      delete (globalThis as { __exportedCellSet?: unknown }).__exportedCellSet;
    }
  });
});
