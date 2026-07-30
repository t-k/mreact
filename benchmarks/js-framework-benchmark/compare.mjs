#!/usr/bin/env node
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import {
  compareAbbaRuns,
  formatComparisonMarkdown,
  REQUIRED_CASE_IDS,
} from "./compare-results.mjs";

const argumentsByName = parseArguments(process.argv.slice(2));
const baselineRoot = requireDirectoryArgument(argumentsByName, "baseline-root");
const candidateRoot = requireDirectoryArgument(argumentsByName, "candidate-root");
const outputRoot = requireNewOutputArgument(argumentsByName, "output");
const selectedBenchmarks = argumentsByName.get("cases") ?? "";
const upstreamRoot = await mkdtemp(join(tmpdir(), "mreact-js-framework-abba-"));
const runSpecs = [
  { name: "baseline-a", root: baselineRoot, upstreamRoot },
  { name: "candidate-a", root: candidateRoot, upstreamRoot },
  { name: "candidate-b", root: candidateRoot, upstreamRoot },
  { name: "baseline-b", root: baselineRoot, upstreamRoot },
];

try {
  await mkdir(outputRoot, { recursive: false });
  const sourceShas = {
    baseline: await gitRevision(baselineRoot),
    candidate: await gitRevision(candidateRoot),
  };

  await assertTrackedFilesClean(baselineRoot);
  await assertTrackedFilesClean(candidateRoot);

  for (const spec of runSpecs) {
    await runBenchmark(spec, selectedBenchmarks, outputRoot);
  }

  const upstreamRevision = await gitRevision(upstreamRoot);
  const runs = {
    baselineA: await readBenchmarkRun(
      join(outputRoot, "baseline-a"),
      sourceShas.baseline,
      upstreamRevision,
    ),
    candidateA: await readBenchmarkRun(
      join(outputRoot, "candidate-a"),
      sourceShas.candidate,
      upstreamRevision,
    ),
    candidateB: await readBenchmarkRun(
      join(outputRoot, "candidate-b"),
      sourceShas.candidate,
      upstreamRevision,
    ),
    baselineB: await readBenchmarkRun(
      join(outputRoot, "baseline-b"),
      sourceShas.baseline,
      upstreamRevision,
    ),
  };
  const comparison = compareAbbaRuns(runs);
  const manifest = {
    order: runSpecs.map((spec) => spec.name),
    selectedFramework: "keyed/mreact-compiled",
    selectedBenchmarks: selectedBenchmarks.split(/[,\s]+/u).filter(Boolean),
    baselineSha: sourceShas.baseline,
    candidateSha: sourceShas.candidate,
    upstreamRevision,
    node: process.version,
    chromeBinary: process.env.MREACT_JS_FRAMEWORK_CHROME_BINARY ?? null,
  };

  await writeFile(join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(outputRoot, "comparison.json"), `${JSON.stringify(comparison, null, 2)}\n`);
  await writeFile(join(outputRoot, "comparison.md"), formatComparisonMarkdown(comparison));
  process.stdout.write(formatComparisonMarkdown(comparison));

  if (comparison.decision !== "pass") {
    process.exitCode = 2;
  }
} finally {
  await rm(upstreamRoot, { force: true, recursive: true });
}

async function runBenchmark(spec, cases, root) {
  const resultDir = join(root, spec.name);

  if (existsSync(resultDir)) {
    throw new Error(`Refusing to reuse benchmark result directory: ${resultDir}`);
  }

  await run("pnpm", ["bench:js-framework"], spec.root, {
    ...process.env,
    MREACT_BENCHMARK_RESULTS_DIR: resultDir,
    MREACT_JS_FRAMEWORK_BENCHMARK_DIR: spec.upstreamRoot,
    MREACT_JS_FRAMEWORKS: "keyed/mreact-compiled",
    MREACT_JS_FRAMEWORK_BENCHMARKS: cases,
    MREACT_JS_FRAMEWORK_ORDER_OFFSET: "0",
  });
}

async function readBenchmarkRun(resultDir, sha, upstreamRevision) {
  const rawDir = join(resultDir, "js-framework-benchmark-results");
  const files = await readdir(rawDir);
  const metrics = {};

  for (const caseId of REQUIRED_CASE_IDS) {
    const suffix = `_${caseId}.json`;
    const matches = files.filter(
      (file) => file.includes("mreact-compiled") && file.endsWith(suffix),
    );

    if (matches.length !== 1) {
      continue;
    }

    const json = JSON.parse(await readFile(join(rawDir, matches[0]), "utf8"));
    metrics[caseId] = caseId.startsWith("0")
      ? json.values?.total?.median
      : json.values?.DEFAULT?.median;
  }

  return { sha, upstreamRevision, metrics };
}

async function gitRevision(root) {
  return (await capture("git", ["rev-parse", "HEAD"], root)).trim();
}

async function assertTrackedFilesClean(root) {
  const status = await capture("git", ["status", "--short", "--untracked-files=no"], root);

  if (status.trim() !== "") {
    throw new Error(`Tracked files must be clean before measurement in ${root}:\n${status}`);
  }
}

function parseArguments(values) {
  const parsed = new Map();

  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];

    if (name === undefined || !name.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value arguments, received: ${values.join(" ")}`);
    }
    parsed.set(name.slice(2), value);
  }

  return parsed;
}

function requireDirectoryArgument(argumentsMap, name) {
  const value = argumentsMap.get(name);

  if (value === undefined) {
    throw new Error(`Missing --${name}.`);
  }
  const directory = resolve(value);
  if (!existsSync(join(directory, "package.json"))) {
    throw new Error(`Missing package.json in --${name}: ${directory}`);
  }
  return directory;
}

function requireNewOutputArgument(argumentsMap, name) {
  const value = argumentsMap.get(name);

  if (value === undefined) {
    throw new Error(`Missing --${name}.`);
  }
  const directory = resolve(value);
  if (existsSync(directory)) {
    throw new Error(`Refusing to reuse --${name}: ${directory}`);
  }
  return directory;
}

async function capture(command, args, cwd) {
  return await new Promise((resolvePromise, reject) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise(stdout);
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with ${code ?? signal}: ${stderr}`));
    });
  });
}

async function run(command, args, cwd, env) {
  process.stdout.write(`$ (${cwd}) ${command} ${args.join(" ")}\n`);
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with ${code ?? signal}`));
    });
  });
}
