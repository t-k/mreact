#!/usr/bin/env node
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

const repoRoot = resolve(new URL("../..", import.meta.url).pathname);
const fixtureRoot = join(repoRoot, "benchmarks", "js-framework-benchmark", "frameworks", "keyed");
const checkoutRoot = resolve(
  process.env.MREACT_JS_FRAMEWORK_BENCHMARK_DIR ??
    join(tmpdir(), `mreact-js-framework-benchmark-${process.pid}`),
);
const resultsRoot = process.env.MREACT_BENCHMARK_RESULTS_DIR;
const resultDir = resultsRoot === undefined
  ? join(repoRoot, "benchmarks", "results", "local-js-framework")
  : resultsRoot;
const officialResultDir = join(resultDir, "js-framework-benchmark-results");

const frameworkMappings = [
  {
    primitive: "marko",
    official: "keyed/marko",
  },
  {
    primitive: "vue",
    official: "keyed/vue",
  },
  {
    primitive: "svelte",
    official: "keyed/svelte",
  },
  {
    primitive: "angular",
    official: "keyed/angular-cf",
  },
  {
    primitive: "react",
    official: "keyed/react-hooks",
  },
  {
    primitive: "mreact react-compat",
    official: "keyed/mreact-react-compat",
  },
  {
    primitive: "solid",
    official: "keyed/solid",
  },
  {
    primitive: "mreact",
    official: "keyed/mreact",
  },
];

const unsupportedPrimitiveAdapters = [
  "qwik: krausest/js-framework-benchmark keyed/qwik currently fails the official isKeyed check and is categorized as non-keyed.",
  "qwik-v2: krausest/js-framework-benchmark does not currently provide a matching Qwik v2 keyed fixture.",
  "solid-v2: krausest/js-framework-benchmark does not currently provide a matching Solid v2 keyed fixture.",
];

const selectedFrameworks = parseFrameworks(
  process.env.MREACT_JS_FRAMEWORKS,
  frameworkMappings.map((mapping) => mapping.official),
);

const selectedBenchmarks = parseFrameworks(process.env.MREACT_JS_FRAMEWORK_BENCHMARKS, []);

await main();

async function main() {
  await prepareCheckout();
  await copyMreactFixtures();
  await mkdir(resultDir, { recursive: true });
  await rm(officialResultDir, { force: true, recursive: true });

  let server;
  try {
    await installOfficialDependencies();
    server = startServer();
    await waitForServer();
    await run("npm", ["run", "rebuild", "--", "--frameworks", ...selectedFrameworks], checkoutRoot);
    await resetOfficialRunOutput();
    await run("npm", ["run", "bench", "--", "--runner", "playwright", "--headless", "true", ...selectedFrameworks, ...benchmarkArgs()], checkoutRoot);
  } finally {
    if (server !== undefined) {
      stopProcessGroup(server);
    }
  }

  await copyResults();
  await writeSummary();
}

async function resetOfficialRunOutput() {
  await rm(join(checkoutRoot, "webdriver-ts", "results"), { force: true, recursive: true });
  await rm(join(checkoutRoot, "webdriver-ts", "traces"), { force: true, recursive: true });
  await mkdir(join(checkoutRoot, "webdriver-ts", "results"), { recursive: true });
  await mkdir(join(checkoutRoot, "webdriver-ts", "traces"), { recursive: true });
}

async function installOfficialDependencies() {
  await run("npm", ["ci", "--ignore-scripts"], checkoutRoot);
  await run("npm", ["ci"], join(checkoutRoot, "server"));
  await run("npm", ["ci"], join(checkoutRoot, "webdriver-ts"));
  await run("npm", ["run", "compile"], join(checkoutRoot, "webdriver-ts"));
}

function parseFrameworks(value, fallback) {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  return value
    .split(/[,\s]+/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function benchmarkArgs() {
  if (selectedBenchmarks.length === 0) {
    return [];
  }

  return ["--benchmark", ...selectedBenchmarks];
}

async function prepareCheckout() {
  if (!existsSync(join(checkoutRoot, "package.json"))) {
    await rm(checkoutRoot, { force: true, recursive: true });
    await mkdir(checkoutRoot, { recursive: true });
    await run("git", [
      "clone",
      "--depth=1",
      "https://github.com/krausest/js-framework-benchmark.git",
      checkoutRoot,
    ], repoRoot);
  }
}

async function copyMreactFixtures() {
  for (const name of ["mreact", "mreact-react-compat"]) {
    await cp(join(fixtureRoot, name), join(checkoutRoot, "frameworks", "keyed", name), {
      force: true,
      recursive: true,
    });
  }
}

function startServer() {
  const child = spawn("npm", ["start"], {
    cwd: checkoutRoot,
    detached: true,
    env: officialEnv(),
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (code !== null && code !== 0) {
      console.error(`js-framework-benchmark server exited with ${code}`);
    }
    if (signal !== null) {
      console.error(`js-framework-benchmark server exited with signal ${signal}`);
    }
  });

  return child;
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://localhost:8080/ls");
      if (response.ok) {
        return;
      }
      lastError = new Error(`server returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }

  throw new Error(`Timed out waiting for js-framework-benchmark server: ${String(lastError)}`);
}

async function copyResults() {
  const source = join(checkoutRoot, "webdriver-ts", "results");
  if (!existsSync(source)) {
    throw new Error(`Missing js-framework-benchmark results directory: ${source}`);
  }

  await cp(source, officialResultDir, { force: true, recursive: true });
}

async function writeSummary() {
  const rows = await collectResultRows();
  const lines = [
    "# js-framework-benchmark Results",
    "",
    "Official krausest/js-framework-benchmark keyed DOM cases run for the primitive benchmark peers that have matching upstream fixtures.",
    "",
    "## Framework Mapping",
    "",
    "| primitive adapter | official fixture |",
    "| --- | --- |",
    ...frameworkMappings.map((mapping) => `| ${mapping.primitive} | ${mapping.official} |`),
    "",
    "## Unsupported Primitive Adapters",
    "",
    ...unsupportedPrimitiveAdapters.map((entry) => `- ${entry}`),
    "",
    "## Selected Results",
    "",
    "| framework | create 1k total | update every 10th script | select script | swap total | create 10k total | compressed size |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map((row) =>
      `| ${row.framework} | ${format(row.run1kTotal)} | ${format(row.updateScript)} | ${format(row.selectScript)} | ${format(row.swapTotal)} | ${format(row.create10kTotal)} | ${format(row.compressedSize)} |`,
    ),
    "",
    `Raw JSON files are stored in \`${relativePath(officialResultDir)}\`.`,
    "",
  ];

  await writeFile(join(resultDir, "js-framework-benchmark.md"), lines.join("\n"));
}

async function collectResultRows() {
  const files = await readdir(officialResultDir);
  const run1kSuffix = "_01_run1k.json";
  const frameworkNames = new Set(
    files
      .filter((file) => file.endsWith(run1kSuffix))
      .map((file) => file.slice(0, -run1kSuffix.length)),
  );

  return [...frameworkNames].sort().map((framework) => ({
    framework,
    run1kTotal: readMetric(files, framework, "01_run1k", "total"),
    updateScript: readMetric(files, framework, "03_update10th1k_x16", "script"),
    selectScript: readMetric(files, framework, "04_select1k", "script"),
    swapTotal: readMetric(files, framework, "05_swap1k", "total"),
    create10kTotal: readMetric(files, framework, "07_create10k", "total"),
    compressedSize: readMetric(files, framework, "42_size-compressed", "DEFAULT"),
  }));
}

function readMetric(files, framework, caseId, metric) {
  const filename = `${framework}_${caseId}.json`;
  if (!files.includes(filename)) {
    return undefined;
  }

  return readJsonMetric(join(officialResultDir, filename), metric);
}

function readJsonMetric(filename, metric) {
  const json = JSON.parse(readFileSync(filename, "utf8"));
  return json.values?.[metric]?.median ?? json.values?.DEFAULT?.median;
}

function format(value) {
  return typeof value === "number" ? String(Math.round(value * 10) / 10) : "";
}

function relativePath(path) {
  return path.startsWith(repoRoot) ? path.slice(repoRoot.length + 1) : path;
}

async function run(command, args, cwd) {
  console.log(`$ ${command} ${args.join(" ")}`);
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: officialEnv(),
      stdio: "inherit",
    });

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

function officialEnv() {
  const env = { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1" };
  delete env.NODE_ENV;
  return env;
}

function stopProcessGroup(child) {
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    return;
  }
}

async function sleep(ms) {
  await new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}
