import { describe, expect, it } from "vitest";
import { formatBenchmarkMarkdown } from "./report.js";
import type { BenchmarkEnvironment, BenchmarkRow } from "./types.js";

const env: BenchmarkEnvironment = {
  date: "2026-05-15",
  gitCommit: "abc123",
  nodeVersion: "v20.19.0",
  nodeEnv: "production",
  pnpmVersion: "10.19.0",
  platform: "linux",
  arch: "x64",
  cpuModel: "Test CPU",
  cpuCount: 8,
  totalMemoryBytes: 16,
  packageVersions: {
    react: "19.2.6",
  },
};

describe("formatBenchmarkMarkdown", () => {
  it("renders environment, rankings, and benchmark rows", () => {
    const rows: BenchmarkRow[] = [
      {
        suite: "primitive",
        framework: "mreact react-compat",
        version: "19.2.6",
        caseName: "create 1k rows",
        status: "completed",
        metric: "duration",
        unit: "ms",
        value: 12.34,
        summary: {
          count: 7,
          min: 10,
          max: 14,
          mean: 12,
          median: 12.34,
          medianAbsoluteDeviation: 1.2,
          p75: 13,
          p99: 14,
          p95: 14,
          standardDeviation: 1.2,
        },
        samples: [10, 12.34, 14],
        notes: ["validated DOM output"],
      },
      {
        suite: "primitive",
        framework: "mreact",
        version: "1.9.12",
        caseName: "create 1k rows",
        status: "completed",
        metric: "duration",
        unit: "ms",
        value: 8,
      },
    ];

    const markdown = formatBenchmarkMarkdown("Primitive Benchmark", env, rows, {
      caseDescriptions: {
        "create 1k rows":
          "Creates 1,000 DOM rows from an empty host and validates the final DOM.",
      },
    });

    expect(markdown).toContain("- Memory: 16 bytes");
    expect(markdown).toContain("- NODE_ENV: production");
    expect(markdown).toContain("- react: 19.2.6");
    expect(markdown).toContain("## Rankings");
    expect(markdown).toContain("### create 1k rows");
    expect(markdown).toContain(
      "Creates 1,000 DOM rows from an empty host and validates the final DOM.",
    );
    expect(markdown).toContain("| rank | framework | case | value | diff vs 1st | unit |");
    expect(markdown).toContain("| 1 | **mreact** | create 1k rows | 8 | best | ms |");
    expect(markdown).toContain("| 2 | **mreact react-compat** | create 1k rows | 12.34 | +54.25% | ms |");
    expect(markdown).toContain(
      "| primitive | mreact react-compat | 19.2.6 | create 1k rows | completed | duration | ms | 12.34 | +54.25% | 7 | 10 | 14 | 12 | 12.34 | 1.2 | 13 | 14 | 14 | 1.2 | 10, 12.34, 14 | validated DOM output |",
    );
  });

  it("escapes markdown table cells", () => {
    const rows: BenchmarkRow[] = [
      {
        suite: "primitive",
        framework: "react",
        version: "19.2.6",
        caseName: "create | hydrate\nrows",
        status: "completed",
        metric: "duration",
        unit: "ms",
        value: 12.34,
        notes: ["validated | DOM", "line\nbreak"],
      },
    ];

    const markdown = formatBenchmarkMarkdown("Primitive Benchmark", env, rows);

    expect(markdown).toContain(
      "| primitive | react | 19.2.6 | create \\| hydrate rows | completed | duration | ms | 12.34 | best | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  | validated \\| DOM; line break |",
    );
  });
});
