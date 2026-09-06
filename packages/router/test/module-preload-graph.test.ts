import { describe, expect, test } from "vitest";
import { collectStaticModulePreloadDependencies } from "../src/module-preload-graph.js";

describe("collectStaticModulePreloadDependencies", () => {
  test("collects a deterministic transitive JavaScript closure", () => {
    const chunks = new Map([
      [
        "assets/routes/route.js",
        {
          file: "assets/routes/route.js",
          imports: ["assets/chunks/c.js", "assets/chunks/a.js"],
          dynamicImports: ["assets/chunks/lazy.js"],
        },
      ],
      [
        "assets/chunks/a.js",
        {
          file: "assets/chunks/a.js",
          imports: ["assets/chunks/b.js", "assets/chunks/shared.css"],
        },
      ],
      [
        "assets/chunks/b.js",
        {
          file: "assets/chunks/b.js",
          imports: ["assets/chunks/c.js"],
        },
      ],
      [
        "assets/chunks/c.js",
        {
          file: "assets/chunks/c.js",
          imports: ["assets/chunks/b.js", "assets/routes/route.js", "assets/chunks/shared.js.map"],
        },
      ],
      ["assets/chunks/lazy.js", { file: "assets/chunks/lazy.js", imports: [] }],
      ["assets/routes/unrelated.js", { file: "assets/routes/unrelated.js", imports: [] }],
    ]);

    expect(collectStaticModulePreloadDependencies("assets/routes/route.js", chunks)).toEqual([
      "assets/chunks/a.js",
      "assets/chunks/b.js",
      "assets/chunks/c.js",
    ]);
  });

  test("ignores external and non-JavaScript imports without prefixing them", () => {
    const chunks = new Map([
      [
        "assets/routes/route.js",
        {
          file: "assets/routes/route.js",
          imports: [
            "https://cdn.example.test/shared.js",
            "/external/shared.js",
            "assets/chunks/shared.css",
            "assets/chunks/shared.js.map",
          ],
        },
      ],
    ]);

    expect(collectStaticModulePreloadDependencies("assets/routes/route.js", chunks)).toEqual([]);
  });

  test("fails with the missing local JavaScript chunk", () => {
    const chunks = new Map([
      [
        "assets/routes/route.js",
        {
          file: "assets/routes/route.js",
          imports: ["assets/chunks/missing.js"],
        },
      ],
    ]);

    expect(() => collectStaticModulePreloadDependencies("assets/routes/route.js", chunks)).toThrow(
      /missing static JavaScript chunk.*assets\/chunks\/missing\.js/i,
    );
  });
});
