import { describe, expect, test } from "vitest";
import { formatLambdaGeneratedHandlerLatencyMarkdown } from "./report.js";

describe("AWS Lambda generated handler latency report", () => {
  test("renders handler import, first hit, warm hit, and cold total rows", () => {
    const markdown = formatLambdaGeneratedHandlerLatencyMarkdown(
      {
        arch: "x64",
        cpuCount: 8,
        cpuModel: "test cpu",
        date: "2026-06-17",
        gitCommit: "abc123",
        nodeEnv: "production",
        nodeVersion: "v24.0.0",
        packageVersions: { "@reckona/mreact-router": "0.0.170" },
        platform: "linux",
        pnpmVersion: "10.19.0",
        totalMemoryBytes: 1024,
      },
      [
        {
          coldTotalMs: 16,
          entry: "buffered",
          firstMs: 6,
          importMs: 10,
          iteration: 1,
          path: "/users",
          preload: "middleware",
          scenario: "generated-first-route",
          status: 200,
          warmMs: 1,
        },
      ],
    );

    expect(markdown).toContain("# AWS Lambda Generated Handler Latency Benchmark");
    expect(markdown).toContain(
      "| scenario | entry | preload | iteration | path | status | handler import ms | first hit ms | warm hit ms | cold total ms |",
    );
    expect(markdown).toContain(
      "| generated-first-route | buffered | middleware | 1 | /users | 200 | 10 | 6 | 1 | 16 |",
    );
  });
});
