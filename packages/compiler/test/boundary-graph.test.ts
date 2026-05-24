import { describe, expect, test } from "vitest";
import { analyzeBoundaryGraph } from "../src/index.js";

describe("analyzeBoundaryGraph", () => {
  test("classifies an entry render export as server-render when no client capability is reachable", async () => {
    const files = new Map([
      [
        "/app/page.tsx",
        `export default function Page() {
  return <main>Dashboard</main>;
}`,
      ],
    ]);

    const result = await analyzeBoundaryGraph({
      entries: [{ file: "/app/page.tsx", kind: "route-page" }],
      readModule: async (file) => files.get(file),
      resolveModule: async () => undefined,
    });

    expect(result.modules).toMatchObject([
      {
        file: "/app/page.tsx",
        classification: "server-render",
        exports: [{ name: "default", classification: "server-render" }],
      },
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  test("classifies an imported JSX component with reachable client capability as a client boundary", async () => {
    const files = new Map([
      [
        "/app/page.tsx",
        `import { Counter } from "./Counter";

export default function Page() {
  return <main><Counter /></main>;
}`,
      ],
      [
        "/app/Counter.tsx",
        `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>{count.get()}</button>;
}`,
      ],
    ]);

    const result = await analyzeBoundaryGraph({
      entries: [{ file: "/app/page.tsx", kind: "route-page" }],
      readModule: async (file) => files.get(file),
      resolveModule: async ({ importer, source }) =>
        importer === "/app/page.tsx" && source === "./Counter"
          ? "/app/Counter.tsx"
          : undefined,
    });

    expect(result.modules).toMatchObject([
      {
        file: "/app/page.tsx",
        classification: "server-render",
        exports: [{ name: "default", classification: "server-render" }],
      },
      {
        file: "/app/Counter.tsx",
        classification: "client-boundary",
        exports: [{ name: "Counter", classification: "client-boundary" }],
      },
    ]);
    expect(result.diagnostics).toEqual([]);
  });
});
