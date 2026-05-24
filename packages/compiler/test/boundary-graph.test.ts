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
});
