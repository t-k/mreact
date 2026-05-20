import { describe, expect, it } from "vitest";
import { formatLambdaRouteLatencyMarkdown } from "./report.js";
import type { BenchmarkEnvironment } from "../shared/types.js";

describe("formatLambdaRouteLatencyMarkdown", () => {
  it("renders Lambda request and render phase rows", () => {
    const markdown = formatLambdaRouteLatencyMarkdown(testEnvironment, [
      {
        bodyBytes: 0,
        iteration: 1,
        path: "/",
        renderPhases: {
          loaderExecutionMs: 2,
          loaderModuleLoadMs: 10,
          loaderWaitMs: 12,
          middlewareExecutionMs: 1,
          middlewareModuleLoadMs: 3,
          sourceAnalysisArtifactMs: 0.5,
          sourceAnalysisMs: 4,
        },
        requestDurationMs: 25,
        requestPhases: {
          renderMs: 20,
          bodyEncodeMs: 0.1,
          preloadWaitMs: 5,
          responseSerializationMs: 1,
          responseStreamingMs: 0.9,
          runtimeDirMs: 2,
          streamConcatMs: 0.2,
          streamDrainMs: 0.8,
          streamReadMs: 0.6,
          streamWaitMs: 0.7,
          streamWriteMs: 0.2,
        },
        scenario: "first-root-redirect",
        status: 303,
      },
    ]);

    expect(markdown).toContain("# AWS Lambda Route Latency Benchmark");
    expect(markdown).toContain("| scenario | iteration | path | status | request duration ms | render ms | runtime dir ms | preload wait ms | loader wait ms | loader module load ms | loader execution ms | middleware module load ms | middleware execution ms | source analysis ms | source analysis artifact ms | stream drain ms | stream read ms | stream concat ms | stream wait ms | stream write ms | body encode ms | response serialization ms | response streaming ms | body bytes |");
    expect(markdown).toContain("| first-root-redirect | 1 | / | 303 | 25 | 20 | 2 | 5 | 12 | 10 | 2 | 3 | 1 | 4 | 0.5 | 0.8 | 0.6 | 0.2 | 0.7 | 0.2 | 0.1 | 1 | 0.9 | 0 |");
  });
});

const testEnvironment: BenchmarkEnvironment = {
  arch: "x64",
  cpuCount: 1,
  cpuModel: "test",
  date: "2026-05-19",
  gitCommit: "abc",
  nodeEnv: "production",
  nodeVersion: "v24.0.0",
  packageVersions: {
    "@reckona/mreact-router": "0.0.19",
  },
  platform: "linux",
  pnpmVersion: "10.19.0",
  totalMemoryBytes: 1,
};
