import { describe, expect, test } from "vitest";
import { compareAbbaRuns } from "./compare-results.mjs";

interface BenchmarkRun {
  readonly sha: string;
  upstreamRevision: string;
  readonly metrics: Record<string, number>;
}

const cpuCases = [
  "01_run1k",
  "02_replace1k",
  "03_update10th1k_x16",
  "04_select1k",
  "05_swap1k",
  "06_remove-one-1k",
  "07_create10k",
  "08_create1k-after1k_x2",
  "09_clear1k_x8",
];
const memoryCases = ["21_ready-memory", "22_run-memory", "25_run-clear-memory"];

function run(sha: string, multiplier = 1): BenchmarkRun {
  return {
    sha,
    upstreamRevision: "upstream-sha",
    metrics: Object.fromEntries(
      [...cpuCases, ...memoryCases, "42_size-compressed"].map((caseId) => [
        caseId,
        (caseId === "42_size-compressed" ? 10 : 100) * multiplier,
      ]),
    ),
  };
}

describe("js-framework-benchmark ABBA comparison", () => {
  test("passes a repeatable speedup and reports relaxed size growth", () => {
    const result = compareAbbaRuns({
      baselineA: run("base", 1),
      candidateA: run("candidate", 0.96),
      candidateB: run("candidate", 0.96),
      baselineB: run("base", 1),
    });

    expect(result.decision).toBe("pass");
    expect(result.cpuGeometricMeanDeltaPercent).toBeCloseTo(-4, 6);
    expect(result.memoryGeometricMeanDeltaPercent).toBeCloseTo(-4, 6);
    expect(result.compressedSizeDeltaKb).toBeCloseTo(-0.4, 6);
  });

  test("accepts the current official memory benchmark set", () => {
    const runs = {
      baselineA: run("base"),
      candidateA: run("candidate", 0.96),
      candidateB: run("candidate", 0.96),
      baselineB: run("base"),
    };

    for (const value of Object.values(runs)) {
      delete value.metrics["23_update5-memory"];
      delete value.metrics["24_run5-memory"];
    }

    expect(compareAbbaRuns(runs).decision).toBe("pass");
  });

  test("rejects CPU or memory regressions at the approved gates", () => {
    const cpuRegression = run("candidate", 1);
    cpuRegression.metrics["03_update10th1k_x16"] = 106;
    const memoryRegression = run("candidate", 1);

    for (const caseId of memoryCases) {
      memoryRegression.metrics[caseId] = 104;
    }

    expect(
      compareAbbaRuns({
        baselineA: run("base"),
        candidateA: cpuRegression,
        candidateB: cpuRegression,
        baselineB: run("base"),
      }).decision,
    ).toBe("reject");
    expect(
      compareAbbaRuns({
        baselineA: run("base"),
        candidateA: memoryRegression,
        candidateB: memoryRegression,
        baselineB: run("base"),
      }).decision,
    ).toBe("reject");
  });

  test("keeps exact CPU, memory, and repeatable-case boundaries inclusive", () => {
    const exactCpu = run("candidate");
    const aboveCpu = run("candidate");
    const exactMemory = run("candidate");
    const aboveMemory = run("candidate");
    const exactCaseA = run("candidate");
    const exactCaseB = run("candidate");
    const aboveCaseA = run("candidate");
    const aboveCaseB = run("candidate");

    for (const caseId of cpuCases) {
      exactCpu.metrics[caseId] = 103;
      aboveCpu.metrics[caseId] = 103.01;
    }
    for (const caseId of memoryCases) {
      exactMemory.metrics[caseId] = 103;
      aboveMemory.metrics[caseId] = 103.01;
    }
    exactCaseA.metrics["03_update10th1k_x16"] = 105;
    exactCaseB.metrics["03_update10th1k_x16"] = 105;
    aboveCaseA.metrics["03_update10th1k_x16"] = 105.01;
    aboveCaseB.metrics["03_update10th1k_x16"] = 105.01;

    const compare = (candidateA: BenchmarkRun, candidateB = candidateA) =>
      compareAbbaRuns({
        baselineA: run("base"),
        candidateA,
        candidateB,
        baselineB: run("base"),
      }).decision;

    expect(compare(exactCpu)).toBe("pass");
    expect(compare(aboveCpu)).toBe("reject");
    expect(compare(exactMemory)).toBe("pass");
    expect(compare(aboveMemory)).toBe("reject");
    expect(compare(exactCaseA, exactCaseB)).toBe("pass");
    expect(compare(aboveCaseA, aboveCaseB)).toBe("reject");
  });

  test("allows one-sided CPU noise and compressed-size growth by themselves", () => {
    const noisyCandidateA = run("candidate");
    const stableCandidateB = run("candidate");
    noisyCandidateA.metrics["03_update10th1k_x16"] = 106;
    noisyCandidateA.metrics["42_size-compressed"] = 14;
    stableCandidateB.metrics["42_size-compressed"] = 14;

    const result = compareAbbaRuns({
      baselineA: run("base"),
      candidateA: noisyCandidateA,
      candidateB: stableCandidateB,
      baselineB: run("base"),
    });

    expect(result.decision).toBe("pass");
    expect(result.compressedSizeDeltaKb).toBe(4);
  });

  test("marks missing metrics or provenance mismatches inconclusive", () => {
    const missing = run("candidate");
    delete missing.metrics["07_create10k"];

    expect(
      compareAbbaRuns({
        baselineA: run("base"),
        candidateA: missing,
        candidateB: run("candidate"),
        baselineB: run("base"),
      }).decision,
    ).toBe("inconclusive");

    const wrongUpstream = run("candidate");
    wrongUpstream.upstreamRevision = "different";
    expect(
      compareAbbaRuns({
        baselineA: run("base"),
        candidateA: wrongUpstream,
        candidateB: run("candidate"),
        baselineB: run("base"),
      }).decision,
    ).toBe("inconclusive");
  });
});
