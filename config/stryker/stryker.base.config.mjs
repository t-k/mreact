/** @param {{ name: string; mutate: string[]; testFiles: string[]; breakThreshold?: number; vitestConfigFile?: string }} profile */
export function createStrykerConfig(profile) {
  const reportRoot = `coverage/mutation/${profile.name}`;
  const defaultVitestConfig =
    profile.testFiles.length > 0 && profile.testFiles.every((file) => file.startsWith("benchmarks/"))
      ? "vitest.benchmarks.config.ts"
      : profile.testFiles.length > 0 &&
          profile.testFiles.every((file) => file.startsWith("compat-lab/"))
        ? "vitest.compat-lab.config.ts"
        : "vitest.config.ts";

  return {
    clearTextReporter: {
      allowEmojis: false,
    },
    concurrency: 2,
    coverageAnalysis: "perTest",
    htmlReporter: {
      fileName: `${reportRoot}/html/index.html`,
    },
    ignoreStatic: true,
    incremental: true,
    incrementalFile: `${reportRoot}/incremental.json`,
    jsonReporter: {
      fileName: `${reportRoot}/mutation.json`,
    },
    mutate: profile.mutate,
    packageManager: "pnpm",
    plugins: ["@stryker-mutator/vitest-runner"],
    reporters: ["clear-text", "progress", "html", "json"],
    testFiles: profile.testFiles,
    testRunner: "vitest",
    thresholds: {
      break: profile.breakThreshold ?? 90,
      high: 90,
      low: 80,
    },
    vitest: {
      configFile: profile.vitestConfigFile ?? defaultVitestConfig,
      related: true,
    },
  };
}
