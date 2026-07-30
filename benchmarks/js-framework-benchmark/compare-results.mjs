export const CPU_CASE_IDS = [
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

export const MEMORY_CASE_IDS = [
  "21_ready-memory",
  "22_run-memory",
  "23_update5-memory",
  "24_run5-memory",
  "25_run-clear-memory",
];

export const SIZE_CASE_ID = "42_size-compressed";
export const REQUIRED_CASE_IDS = [...CPU_CASE_IDS, ...MEMORY_CASE_IDS, SIZE_CASE_ID];

export function geometricMean(values) {
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
}

export function percentDelta(baseline, candidate) {
  return (candidate / baseline - 1) * 100;
}

export function compareAbbaRuns(runs) {
  const provenanceError = validateProvenance(runs);

  if (provenanceError !== undefined) {
    return inconclusive(provenanceError);
  }

  for (const [name, run] of Object.entries(runs)) {
    for (const caseId of REQUIRED_CASE_IDS) {
      const value = run.metrics[caseId];

      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        return inconclusive(`${name} is missing a positive finite ${caseId} metric.`);
      }
    }
  }

  const caseDeltas = Object.fromEntries(
    REQUIRED_CASE_IDS.map((caseId) => {
      const baseline = mean(runs.baselineA.metrics[caseId], runs.baselineB.metrics[caseId]);
      const candidate = mean(runs.candidateA.metrics[caseId], runs.candidateB.metrics[caseId]);
      return [caseId, percentDelta(baseline, candidate)];
    }),
  );
  const cpuGeometricMeanDeltaPercent = percentDelta(
    geometricMean(
      CPU_CASE_IDS.map((caseId) =>
        mean(runs.baselineA.metrics[caseId], runs.baselineB.metrics[caseId]),
      ),
    ),
    geometricMean(
      CPU_CASE_IDS.map((caseId) =>
        mean(runs.candidateA.metrics[caseId], runs.candidateB.metrics[caseId]),
      ),
    ),
  );
  const memoryGeometricMeanDeltaPercent = percentDelta(
    geometricMean(
      MEMORY_CASE_IDS.map((caseId) =>
        mean(runs.baselineA.metrics[caseId], runs.baselineB.metrics[caseId]),
      ),
    ),
    geometricMean(
      MEMORY_CASE_IDS.map((caseId) =>
        mean(runs.candidateA.metrics[caseId], runs.candidateB.metrics[caseId]),
      ),
    ),
  );
  const compressedSizeDeltaKb =
    mean(runs.candidateA.metrics[SIZE_CASE_ID], runs.candidateB.metrics[SIZE_CASE_ID]) -
    mean(runs.baselineA.metrics[SIZE_CASE_ID], runs.baselineB.metrics[SIZE_CASE_ID]);
  const repeatableCpuRegressions = CPU_CASE_IDS.filter(
    (caseId) =>
      percentDelta(runs.baselineA.metrics[caseId], runs.candidateA.metrics[caseId]) > 5 &&
      percentDelta(runs.baselineB.metrics[caseId], runs.candidateB.metrics[caseId]) > 5,
  );
  const reasons = [];

  if (cpuGeometricMeanDeltaPercent > 3) {
    reasons.push(`CPU geometric mean regressed ${formatPercent(cpuGeometricMeanDeltaPercent)}.`);
  }
  if (memoryGeometricMeanDeltaPercent > 3) {
    reasons.push(
      `Memory geometric mean regressed ${formatPercent(memoryGeometricMeanDeltaPercent)}.`,
    );
  }
  if (repeatableCpuRegressions.length > 0) {
    reasons.push(`Repeatable CPU regressions exceeded 5%: ${repeatableCpuRegressions.join(", ")}.`);
  }

  return {
    decision: reasons.length === 0 ? "pass" : "reject",
    reasons,
    baselineSha: runs.baselineA.sha,
    candidateSha: runs.candidateA.sha,
    upstreamRevision: runs.baselineA.upstreamRevision,
    caseDeltas,
    cpuGeometricMeanDeltaPercent,
    memoryGeometricMeanDeltaPercent,
    compressedSizeDeltaKb,
  };
}

export function formatComparisonMarkdown(result) {
  const lines = [
    "# Compiler keyed-list benchmark comparison",
    "",
    `- Decision: **${result.decision}**`,
  ];

  if (result.baselineSha !== undefined) {
    lines.push(`- Baseline SHA: \`${result.baselineSha}\``);
    lines.push(`- Candidate SHA: \`${result.candidateSha}\``);
    lines.push(`- Upstream revision: \`${result.upstreamRevision}\``);
    lines.push(`- CPU geometric mean delta: ${formatPercent(result.cpuGeometricMeanDeltaPercent)}`);
    lines.push(
      `- Memory geometric mean delta: ${formatPercent(result.memoryGeometricMeanDeltaPercent)}`,
    );
    lines.push(`- Compressed size delta: ${result.compressedSizeDeltaKb.toFixed(3)} kB`);
    lines.push("", "| case | candidate delta |", "| --- | ---: |");
    for (const [caseId, delta] of Object.entries(result.caseDeltas)) {
      lines.push(`| ${caseId} | ${formatPercent(delta)} |`);
    }
  }

  if (result.reasons.length > 0) {
    lines.push("", "## Reasons", "", ...result.reasons.map((reason) => `- ${reason}`));
  }

  return `${lines.join("\n")}\n`;
}

function validateProvenance(runs) {
  if (runs.baselineA.sha !== runs.baselineB.sha) {
    return "Baseline SHAs differ between A and B runs.";
  }
  if (runs.candidateA.sha !== runs.candidateB.sha) {
    return "Candidate SHAs differ between A and B runs.";
  }
  const upstreamRevisions = new Set(Object.values(runs).map((run) => run.upstreamRevision));
  if (upstreamRevisions.size !== 1) {
    return "Upstream js-framework-benchmark revisions differ.";
  }
  return undefined;
}

function inconclusive(reason) {
  return { decision: "inconclusive", reasons: [reason] };
}

function mean(left, right) {
  return (left + right) / 2;
}

function formatPercent(value) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}
