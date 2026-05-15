import { describe, expect, it } from "vitest";
import { collectBenchmarkEnvironment, readPackageVersion } from "./env.js";

describe("readPackageVersion", () => {
  it("reads an installed package version", () => {
    expect(readPackageVersion("react")).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("reads a package version from package.json when root export is unavailable", () => {
    expect(readPackageVersion("@types/node")).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("returns unknown for a missing package", () => {
    expect(readPackageVersion("@missing/benchmark-package")).toBe("unknown");
  });
});

describe("collectBenchmarkEnvironment", () => {
  it("collects stable environment fields", async () => {
    const env = await collectBenchmarkEnvironment(["react", "solid-js"]);

    expect(env.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(env.nodeVersion).toBe(process.version);
    expect(env.cpuCount).toBeGreaterThan(0);
    expect(env.totalMemoryBytes).toBeGreaterThan(0);
    expect(env.packageVersions.react).toMatch(/^\d+\.\d+\.\d+/);
    expect(env.packageVersions["solid-js"]).toMatch(/^\d+\.\d+\.\d+/);
  });
});
