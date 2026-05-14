import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { generateMreactComponents } from "../src/index.js";

describe("@reckona/mreact-next component generation", () => {
  test("turns .mreact.tsx components into ordinary client JSX components", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-next-"));
    const source = join(rootDir, "Counter.mreact.tsx");

    await writeFile(
      source,
      `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <button onClick={() => count.set((value) => value + 1)}>count: {count.get()}</button>;
}
`,
    );

    const generated = await generateMreactComponents({ rootDir });
    const output = join(rootDir, "Counter.tsx");
    const domOutput = join(rootDir, "Counter.mreact-dom.ts");
    const code = await readFile(output, "utf8");
    const domCode = await readFile(domOutput, "utf8");

    expect(generated).toEqual([{ source, output, domOutput }]);
    expect(code).toContain("// @ts-nocheck");
    expect(code).toContain('"use client";');
    expect(code).toContain("export function Counter(props: Record<string, unknown>): never");
    expect(code).toContain('data-mreact-component="Counter"');
    expect(code).toContain("ref={(node: Element | null)");
    expect(code).toContain('import("./Counter.mreact-dom")');
    expect(code).toContain("<span");
    expect(code).not.toContain("@reckona/mreact-compat");
    expect(code).not.toContain("@reckona/mreact-reactive-dom");
    expect(domCode).toContain("// @ts-nocheck");
    expect(domCode).toContain("export function Counter()");
    expect(domCode).toContain("bindEvent(");
    expect(domCode).toContain("bindText(");
  });

  test("turns default exported .mreact.tsx page modules into Next page modules", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-next-page-"));
    const source = join(rootDir, "page.mreact.tsx");

    await writeFile(
      source,
      `function Counter() {
  return <button>count</button>;
}

export default function Page() {
  return <main><h1>Hello mreact page</h1><Counter /></main>;
}
`,
    );

    const generated = await generateMreactComponents({ rootDir });
    const output = join(rootDir, "page.tsx");
    const domOutput = join(rootDir, "page.mreact-dom.ts");
    const code = await readFile(output, "utf8");
    const domCode = await readFile(domOutput, "utf8");

    expect(generated).toEqual([{ source, output, domOutput }]);
    expect(code).toContain("// @ts-nocheck");
    expect(code).toContain('"use client";');
    expect(code).toContain("export default function Page(props: Record<string, unknown>): never");
    expect(code).toContain('data-mreact-component="Page"');
    expect(code).toContain('import("./page.mreact-dom")');
    expect(code).toContain("<span");
    expect(code).not.toContain("@reckona/mreact-compat");
    expect(code).not.toContain("@reckona/mreact-reactive-dom");
    expect(code).not.toContain("export function Counter(props: Record<string, unknown>): never");
    expect(code).not.toContain("Counter$mreactDom");
    expect(domCode).toContain("// @ts-nocheck");
    expect(domCode).toContain("function Counter()");
    expect(domCode).toContain("export default function Page()");
  });
});
