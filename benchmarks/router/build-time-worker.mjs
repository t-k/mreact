import { performance } from "node:perf_hooks";

const [appDir, outDir, phaseFlag] = process.argv.slice(2);
if (!appDir || !outDir) throw new Error("Expected app and output directories");

const startedAt = performance.now();
const { buildApp } = await import("../../packages/router/dist/build.js");
const importMs = performance.now() - startedAt;
const phaseTimings = [];
const buildStartedAt = performance.now();
await buildApp({
  appDir,
  outDir,
  ...(phaseFlag === "1" ? { onBuildPhaseTiming(timing) { phaseTimings.push(timing); } } : {}),
});
const buildMs = performance.now() - buildStartedAt;
const cpu = process.cpuUsage();
const usage = process.resourceUsage();
const round = (value) => Math.round(value * 100) / 100;
console.log("MREACT_BUILD_SAMPLE:" + JSON.stringify({
  importMs: round(importMs),
  buildMs: round(buildMs),
  peakRssBytes: usage.maxRSS * 1024,
  cpuUserMs: round(cpu.user / 1000),
  cpuSystemMs: round(cpu.system / 1000),
  phaseTimings,
}));
