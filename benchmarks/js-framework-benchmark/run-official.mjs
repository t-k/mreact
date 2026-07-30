#!/usr/bin/env node
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

const repoRoot = resolve(new URL("../..", import.meta.url).pathname);
const fixtureRoot = join(repoRoot, "benchmarks", "js-framework-benchmark", "frameworks", "keyed");
const checkoutRoot = resolve(
  process.env.MREACT_JS_FRAMEWORK_BENCHMARK_DIR ??
    join(tmpdir(), `mreact-js-framework-benchmark-${process.pid}`),
);
const resultsRoot = process.env.MREACT_BENCHMARK_RESULTS_DIR;
const resultDir =
  resultsRoot === undefined
    ? join(repoRoot, "benchmarks", "results", "local-js-framework")
    : resultsRoot;
const officialResultDir = join(resultDir, "js-framework-benchmark-results");
const officialTraceDir = join(resultDir, "js-framework-benchmark-traces");
const runMetadataPath = join(resultDir, "js-framework-benchmark-run.json");
const useLocalPackages = parseBooleanEnv(process.env.MREACT_JS_FRAMEWORK_LOCAL_PACKAGES, true);
const localPackageModeHelp =
  "Set MREACT_JS_FRAMEWORK_LOCAL_PACKAGES=0 to benchmark published npm packages.";

const localPackageSpecs = [
  {
    name: "@reckona/mreact-shared",
    source: join(repoRoot, "packages", "shared"),
    target: "mreact-shared",
  },
  {
    name: "@reckona/mreact-reactive-core",
    source: join(repoRoot, "packages", "reactive-core"),
    target: "mreact-reactive-core",
  },
  {
    name: "@reckona/mreact-reactive-dom",
    source: join(repoRoot, "packages", "reactive-dom"),
    target: "mreact-reactive-dom",
  },
  {
    name: "@reckona/mreact-compiler",
    source: join(repoRoot, "packages", "compiler"),
    target: "mreact-compiler",
  },
  {
    name: "@reckona/mreact-compat",
    source: join(repoRoot, "packages", "react-compat"),
    target: "mreact-compat",
  },
];

const localPackageByName = new Map(localPackageSpecs.map((spec) => [spec.name, spec]));

const localFixtureDependencies = {
  mreact: ["@reckona/mreact-reactive-core", "@reckona/mreact-reactive-dom"],
  "mreact-compiled": [
    "@reckona/mreact-compiler",
    "@reckona/mreact-reactive-core",
    "@reckona/mreact-reactive-dom",
  ],
  "mreact-react-compat": ["@reckona/mreact-reactive-dom", "@reckona/mreact-compat"],
  "mreact-react-compat-vdom": ["@reckona/mreact-compat"],
};
const localFixtureNames = ["mreact", "mreact-compiled", "mreact-react-compat", "mreact-react-compat-vdom", "octane"];

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
    primitive: "mreact react-compat (vdom)",
    official: "keyed/mreact-react-compat-vdom",
  },
  {
    primitive: "solid",
    official: "keyed/solid",
  },
  {
    primitive: "mreact",
    official: "keyed/mreact",
  },
  {
    primitive: "mreact compiled",
    official: "keyed/mreact-compiled",
  },
  {
    primitive: "octane",
    official: "keyed/octane",
  },
];

const unsupportedPrimitiveAdapters = [
  "qwik: krausest/js-framework-benchmark keyed/qwik currently fails the official isKeyed check and is categorized as non-keyed.",
  "qwik-v2: krausest/js-framework-benchmark does not currently provide a matching Qwik v2 keyed fixture.",
  "solid-v2: krausest/js-framework-benchmark does not currently provide a matching Solid v2 keyed fixture.",
];

const resultMetricDescriptors = [
  {
    key: "createRows",
    caseId: "01_run1k",
    caseName: "create rows",
    sourceMetric: "total",
    metric: "duration",
    unit: "ms",
  },
  {
    key: "replaceAllRows",
    caseId: "02_replace1k",
    caseName: "replace all rows",
    sourceMetric: "total",
    metric: "duration",
    unit: "ms",
  },
  {
    key: "partialUpdate",
    caseId: "03_update10th1k_x16",
    caseName: "partial update",
    sourceMetric: "total",
    metric: "duration",
    unit: "ms",
  },
  {
    key: "selectRow",
    caseId: "04_select1k",
    caseName: "select row",
    sourceMetric: "total",
    metric: "duration",
    unit: "ms",
  },
  {
    key: "swapRows",
    caseId: "05_swap1k",
    caseName: "swap rows",
    sourceMetric: "total",
    metric: "duration",
    unit: "ms",
  },
  {
    key: "removeRow",
    caseId: "06_remove-one-1k",
    caseName: "remove row",
    sourceMetric: "total",
    metric: "duration",
    unit: "ms",
  },
  {
    key: "createManyRows",
    caseId: "07_create10k",
    caseName: "create many rows",
    sourceMetric: "total",
    metric: "duration",
    unit: "ms",
  },
  {
    key: "appendRowsToLargeTable",
    caseId: "08_create1k-after1k_x2",
    caseName: "append rows to large table",
    sourceMetric: "total",
    metric: "duration",
    unit: "ms",
  },
  {
    key: "clearRows",
    caseId: "09_clear1k_x8",
    caseName: "clear rows",
    sourceMetric: "total",
    metric: "duration",
    unit: "ms",
  },
  {
    key: "readyMemory",
    caseId: "21_ready-memory",
    caseName: "ready memory",
    sourceMetric: "DEFAULT",
    metric: "memory",
    unit: "MB",
  },
  {
    key: "runMemory",
    caseId: "22_run-memory",
    caseName: "run memory",
    sourceMetric: "DEFAULT",
    metric: "memory",
    unit: "MB",
  },
  {
    key: "updateMemory",
    caseId: "23_update5-memory",
    caseName: "update memory",
    sourceMetric: "DEFAULT",
    metric: "memory",
    unit: "MB",
  },
  {
    key: "replaceMemory",
    caseId: "24_run5-memory",
    caseName: "replace memory",
    sourceMetric: "DEFAULT",
    metric: "memory",
    unit: "MB",
  },
  {
    key: "repeatedClearMemory",
    caseId: "25_run-clear-memory",
    caseName: "repeated clear memory",
    sourceMetric: "DEFAULT",
    metric: "memory",
    unit: "MB",
  },
  {
    key: "startupTime",
    caseId: "34_startup-interactive",
    caseName: "startup time",
    sourceMetric: "DEFAULT",
    metric: "duration",
    unit: "ms",
  },
  {
    key: "consistentlyInteractive",
    caseId: "31_startup-ci",
    caseName: "consistently interactive",
    sourceMetric: "DEFAULT",
    metric: "duration",
    unit: "ms",
  },
  {
    key: "scriptBootupTime",
    caseId: "32_startup-bt",
    caseName: "script bootup time",
    sourceMetric: "DEFAULT",
    metric: "duration",
    unit: "ms",
  },
  {
    key: "mainThreadWorkCost",
    caseId: "33_startup-mainthreadcost",
    caseName: "main thread work cost",
    sourceMetric: "DEFAULT",
    metric: "duration",
    unit: "ms",
  },
  {
    key: "totalByteWeight",
    caseId: "42_size-compressed",
    caseName: "total byte weight",
    sourceMetric: "DEFAULT",
    metric: "size",
    unit: "kB",
  },
];

const defaultSelectedFrameworks = parseFrameworks(
  process.env.MREACT_JS_FRAMEWORKS,
  frameworkMappings.map((mapping) => mapping.official),
);
const frameworkOrderOffset = parseIntegerEnv(
  process.env.MREACT_JS_FRAMEWORK_ORDER_OFFSET,
  new Date().getUTCDate() - 1,
);
const selectedFrameworks = rotateFrameworks(defaultSelectedFrameworks, frameworkOrderOffset);
const diffAnchorFramework = process.env.MREACT_JS_FRAMEWORK_DIFF_ANCHOR ?? "react-hooks";

const selectedBenchmarks = parseFrameworks(process.env.MREACT_JS_FRAMEWORK_BENCHMARKS, []);
const chromeBinaryPath = parseChromeBinaryPath(process.env.MREACT_JS_FRAMEWORK_CHROME_BINARY);
const summaryOnly = parseBooleanEnv(process.env.MREACT_JS_FRAMEWORK_SUMMARY_ONLY, false);

if (summaryOnly) {
  await mkdir(resultDir, { recursive: true });
  await writeSummary();
} else {
  await main();
}

async function main() {
  await prepareCheckout();
  await copyLocalFixtures();
  if (useLocalPackages) {
    await prepareLocalPackages();
  }
  await mkdir(resultDir, { recursive: true });
  await rm(officialResultDir, { force: true, recursive: true });
  await rm(officialTraceDir, { force: true, recursive: true });

  let server;
  try {
    await installOfficialDependencies();
    server = startServer();
    await waitForServer();
    await rebuildSelectedFrameworks();
    await runOfficialChecks();
    await resetOfficialRunOutput();
    await run(
      "npm",
      [
        "run",
        "bench",
        "--",
        "--runner",
        "playwright",
        "--headless",
        "true",
        ...chromeBinaryArgs(),
        ...selectedFrameworks,
        ...benchmarkArgs(),
      ],
      checkoutRoot,
    );
  } finally {
    if (server !== undefined) {
      stopProcessGroup(server);
    }
  }

  await copyResults();
  await copyTraces();
  await writeRunMetadata(currentRunMetadata());
  await writeSummary();
}

async function rebuildSelectedFrameworks() {
  console.log("Using js-framework-benchmark build-only rebuild path.");
  await run("node", ["--input-type=module", "-e", buildOnlyRebuildScript()], checkoutRoot);
}

async function runOfficialChecks() {
  if (selectedBenchmarks.length !== 0) {
    return;
  }

  const webdriverRoot = join(checkoutRoot, "webdriver-ts");
  await run(
    "npm",
    [
      "run",
      "bench",
      "--",
      "--runner",
      "playwright",
      "--headless",
      "true",
      "--smoketest",
      "true",
      ...chromeBinaryArgs(),
      ...selectedFrameworks,
    ],
    webdriverRoot,
  );
  await run(
    "npm",
    [
      "run",
      "isKeyed",
      "--",
      "--runner",
      "playwright",
      "--headless",
      "true",
      ...chromeBinaryArgs(),
      ...selectedFrameworks,
    ],
    webdriverRoot,
  );
  await run(
    "npm",
    ["run", "checkCSP", "--", "--headless", "true", ...chromeBinaryArgs(), ...selectedFrameworks],
    webdriverRoot,
  );
}

function buildOnlyRebuildScript() {
  return [
    'import { rebuildFrameworks } from "./cli/rebuild-build-single.js";',
    `const frameworks = ${JSON.stringify(selectedFrameworks)};`,
    "if (!rebuildFrameworks(frameworks, false)) process.exit(1);",
  ].join("\n");
}

async function resetOfficialRunOutput() {
  await rm(join(checkoutRoot, "webdriver-ts", "results"), { force: true, recursive: true });
  await rm(join(checkoutRoot, "webdriver-ts", "traces"), { force: true, recursive: true });
  await mkdir(join(checkoutRoot, "webdriver-ts", "results"), { recursive: true });
  await mkdir(join(checkoutRoot, "webdriver-ts", "traces"), { recursive: true });
}

async function installOfficialDependencies() {
  await run("npm", ["ci", "--ignore-scripts", "--legacy-peer-deps"], checkoutRoot);
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

function parseBooleanEnv(value, defaultValue) {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }

  if (/^(1|true|yes|on)$/iu.test(value)) {
    return true;
  }

  if (/^(0|false|no|off)$/iu.test(value)) {
    return false;
  }

  throw new Error(`Expected a boolean environment value, received ${value}`);
}

function parseIntegerEnv(value, defaultValue) {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Expected an integer environment value, received ${value}`);
  }

  return parsed;
}

function parseChromeBinaryPath(value) {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  const path = value.trim();
  if (!isAbsolute(path)) {
    throw new Error(`Chrome binary path must be absolute, received ${path}`);
  }
  if (!existsSync(path)) {
    throw new Error(`Chrome binary does not exist: ${path}`);
  }

  return path;
}

function chromeBinaryArgs() {
  return chromeBinaryPath === undefined ? [] : ["--chromeBinary", chromeBinaryPath];
}

function rotateFrameworks(frameworks, offset) {
  if (frameworks.length === 0) {
    return frameworks;
  }

  const start = ((offset % frameworks.length) + frameworks.length) % frameworks.length;
  return [...frameworks.slice(start), ...frameworks.slice(0, start)];
}

function matchesAnchorFramework(framework, anchor) {
  return (
    framework === anchor ||
    framework.startsWith(`${anchor}-v`) ||
    framework.endsWith(`/${anchor}`) ||
    framework.endsWith(anchor)
  );
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
    await run(
      "git",
      [
        "clone",
        "--depth=1",
        "https://github.com/krausest/js-framework-benchmark.git",
        checkoutRoot,
      ],
      repoRoot,
    );
  }
}

async function prepareLocalPackages() {
  await run("pnpm", ["build"], repoRoot);

  for (const fixture of Object.keys(localFixtureDependencies)) {
    const fixtureDir = join(checkoutRoot, "frameworks", "keyed", fixture);
    const packageRoot = localPackageRoot(fixtureDir);
    await rm(packageRoot, { force: true, recursive: true });
    await mkdir(packageRoot, { recursive: true });

    for (const spec of localPackageSpecs) {
      await copyLocalPackage(packageRoot, spec);
    }

    for (const spec of localPackageSpecs) {
      await rewriteLocalPackageDependencies(packageRoot, spec);
    }

    await applyLocalFixtureDependencies(fixtureDir, packageRoot, localFixtureDependencies[fixture]);
  }
}

async function copyLocalPackage(packageRoot, spec) {
  const target = localPackageDir(packageRoot, spec);
  await mkdir(target, { recursive: true });
  await cp(join(spec.source, "package.json"), join(target, "package.json"));

  for (const entry of ["dist", "src"]) {
    const source = join(spec.source, entry);
    if (existsSync(source)) {
      await cp(source, join(target, entry), { force: true, recursive: true });
    }
  }
}

async function rewriteLocalPackageDependencies(packageRoot, spec) {
  const packageDir = localPackageDir(packageRoot, spec);
  const packageJsonPath = join(packageDir, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

  rewriteLocalDependencies(packageJson, packageRoot, packageDir);
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function rewriteLocalDependencies(packageJson, packageRoot, packageDir) {
  const dependencies = packageJson.dependencies;
  if (dependencies === undefined) {
    return;
  }

  for (const [name, value] of Object.entries(dependencies)) {
    const localPackage = localPackageByName.get(name);
    if (localPackage !== undefined && typeof value === "string" && value.startsWith("workspace:")) {
      dependencies[name] = fileDependency(packageDir, localPackageDir(packageRoot, localPackage));
    }
  }
}

async function applyLocalFixtureDependencies(fixtureDir, packageRoot, dependencies) {
  const packageJsonPath = join(fixtureDir, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  packageJson.dependencies ??= {};

  for (const dependency of dependencies) {
    const localPackage = localPackageByName.get(dependency);
    if (localPackage === undefined) {
      throw new Error(`Missing local package staging config for ${dependency}`);
    }
    packageJson.dependencies[dependency] = fileDependency(
      fixtureDir,
      localPackageDir(packageRoot, localPackage),
    );
  }

  await applyLocalFixtureVersion(packageJson, packageRoot, dependencies[dependencies.length - 1]);
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

async function applyLocalFixtureVersion(packageJson, packageRoot, versionPackageName) {
  const localPackage = localPackageByName.get(versionPackageName);
  if (localPackage === undefined) {
    throw new Error(`Missing local package staging config for ${versionPackageName}`);
  }

  const versionPackageJson = JSON.parse(
    await readFile(join(localPackageDir(packageRoot, localPackage), "package.json"), "utf8"),
  );
  const benchmarkData = packageJson["js-framework-benchmark"];
  if (benchmarkData === undefined) {
    throw new Error(`Missing js-framework-benchmark metadata in ${packageJson.name}`);
  }

  benchmarkData.frameworkVersion = `${versionPackageJson.version}-local`;
  delete benchmarkData.frameworkVersionFromPackage;
}

function localPackageRoot(fixtureDir) {
  return join(fixtureDir, "mreact-local-packages");
}

function localPackageDir(packageRoot, spec) {
  return join(packageRoot, spec.target);
}

function fileDependency(fromDir, toDir) {
  const relativePath = relative(fromDir, toDir).replaceAll("\\", "/");
  return `file:${relativePath.startsWith(".") ? relativePath : `./${relativePath}`}`;
}

async function copyLocalFixtures() {
  for (const name of localFixtureNames) {
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

async function copyTraces() {
  const source = join(checkoutRoot, "webdriver-ts", "traces");
  if (!existsSync(source)) {
    throw new Error(`Missing js-framework-benchmark traces directory: ${source}`);
  }

  await cp(source, officialTraceDir, { force: true, recursive: true });
}

async function writeSummary() {
  const frameworkRows = await collectResultRows();
  const resultRows = toResultRows(frameworkRows);
  const runMetadata =
    (await readRunMetadata()) ?? inferRunMetadata(frameworkRows.map((row) => row.framework));
  const summaryDiffAnchor = runMetadata.diffAnchorFramework;
  const lines = [
    "# js-framework-benchmark Results",
    "",
    "Official krausest/js-framework-benchmark keyed DOM cases run for the primitive benchmark peers that have matching upstream fixtures.",
    runMetadata.useLocalPackages
      ? "The mreact fixtures use local package builds staged from this checkout, so unreleased runtime changes are included."
      : `The mreact fixtures use the published npm package versions from their package.json files. ${localPackageModeHelp}`,
    "",
    "## Framework Mapping",
    "",
    "| primitive adapter | official fixture |",
    "| --- | --- |",
    ...frameworkMappings.map((mapping) => `| ${mapping.primitive} | ${mapping.official} |`),
    "",
    "## Run Selection",
    "",
    `Framework order offset: ${runMetadata.frameworkOrderOffset ?? "unknown"}`,
    `${runMetadata.inferred ? "Frameworks inferred from result files" : "Requested framework order"}: ${runMetadata.selectedFrameworks.join(", ")}`,
    `Fixed diff anchor: ${summaryDiffAnchor}`,
    "",
    "## Unsupported Primitive Adapters",
    "",
    ...unsupportedPrimitiveAdapters.map((entry) => `- ${entry}`),
    "",
    `Raw JSON files are stored in \`${relativePath(officialResultDir)}\`.`,
    `Chrome trace files are stored in \`${relativePath(officialTraceDir)}\`.`,
    "",
    "## Rankings",
    "",
    "Lower values are better for all js-framework-benchmark metrics reported here.",
    "",
    ...formatJsFrameworkRankingSections(resultRows, summaryDiffAnchor),
    "## Results",
    "",
    `| suite | framework | case | status | metric | unit | value | script | paint | diff vs 1st | diff vs ${escapeMarkdownTableCell(summaryDiffAnchor)} |`,
    "| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...resultRows.map((row) => {
      const bestRow = rankJsFrameworkRows(resultRows, row.caseName)[0];
      const anchorRow = findAnchorRow(resultRows, row.caseName, summaryDiffAnchor);
      return `| js-framework-benchmark | ${formatFrameworkCell(row.framework)} | ${escapeMarkdownTableCell(row.caseName)} | ${row.status} | ${row.metric} | ${row.unit} | ${format(row.value)} | ${format(row.script)} | ${format(row.paint)} | ${formatDiffVsBest(row, bestRow)} | ${formatDiffVsBest(row, anchorRow)} |`;
    }),
    "",
  ];

  await writeFile(join(resultDir, "js-framework-benchmark.md"), lines.join("\n"));
}

function currentRunMetadata() {
  return {
    selectedFrameworks,
    frameworkOrderOffset,
    diffAnchorFramework,
    useLocalPackages,
  };
}

async function writeRunMetadata(metadata) {
  await writeFile(runMetadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
}

async function readRunMetadata() {
  if (!existsSync(runMetadataPath)) {
    return undefined;
  }

  const metadata = JSON.parse(await readFile(runMetadataPath, "utf8"));
  if (
    !Array.isArray(metadata.selectedFrameworks) ||
    !metadata.selectedFrameworks.every((framework) => typeof framework === "string") ||
    !Number.isInteger(metadata.frameworkOrderOffset) ||
    typeof metadata.diffAnchorFramework !== "string" ||
    typeof metadata.useLocalPackages !== "boolean"
  ) {
    throw new Error(`Invalid js-framework-benchmark run metadata: ${runMetadataPath}`);
  }

  return metadata;
}

function inferRunMetadata(frameworks) {
  const inferredAnchor = frameworks.some((framework) =>
    matchesAnchorFramework(framework, "react-hooks"),
  )
    ? "react-hooks"
    : diffAnchorFramework;
  return {
    selectedFrameworks: frameworks,
    frameworkOrderOffset: undefined,
    diffAnchorFramework: inferredAnchor,
    useLocalPackages: frameworks.some(
      (framework) => framework.includes("mreact") && framework.includes("-local-"),
    ),
    inferred: true,
  };
}

async function collectResultRows() {
  const files = await readdir(officialResultDir);
  const caseIds = new Set(resultMetricDescriptors.map((descriptor) => descriptor.caseId));
  const frameworkNames = new Set();

  for (const file of files) {
    if (!file.endsWith(".json")) {
      continue;
    }

    for (const caseId of caseIds) {
      const suffix = `_${caseId}.json`;
      if (file.endsWith(suffix)) {
        frameworkNames.add(file.slice(0, -suffix.length));
      }
    }
  }

  return [...frameworkNames].sort().map((framework) => ({
    framework,
    ...Object.fromEntries(
      resultMetricDescriptors.map((descriptor) => [
        descriptor.key,
        readMetricParts(files, framework, descriptor.caseId, descriptor.sourceMetric),
      ]),
    ),
  }));
}

function toResultRows(frameworkRows) {
  return frameworkRows.flatMap((frameworkRow) =>
    resultMetricDescriptors.flatMap((descriptor) => {
      const value = frameworkRow[descriptor.key];

      if (typeof value?.value !== "number") {
        return [];
      }

      return [
        {
          framework: frameworkRow.framework,
          caseName: descriptor.caseName,
          status: "completed",
          metric: descriptor.metric,
          unit: descriptor.unit,
          value: value.value,
          script: value.script,
          paint: value.paint,
        },
      ];
    }),
  );
}

function formatJsFrameworkRankingSections(resultRows, anchorFramework) {
  const lines = [];

  for (const descriptor of resultMetricDescriptors) {
    const rankedRows = rankJsFrameworkRows(resultRows, descriptor.caseName);

    if (rankedRows.length === 0) {
      continue;
    }

    lines.push(`### ${descriptor.caseName}`, "");
    lines.push(
      `| rank | framework | case | value | script | paint | diff vs 1st | diff vs ${escapeMarkdownTableCell(anchorFramework)} | unit |`,
    );
    lines.push("| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |");

    const bestRow = rankedRows[0];
    const anchorRow = findAnchorRow(resultRows, descriptor.caseName, anchorFramework);
    rankedRows.forEach((row, index) => {
      lines.push(
        `| ${index + 1} | ${formatFrameworkCell(row.framework)} | ${escapeMarkdownTableCell(row.caseName)} | ${format(row.value)} | ${format(row.script)} | ${format(row.paint)} | ${formatDiffVsBest(row, bestRow)} | ${formatDiffVsBest(row, anchorRow)} | ${row.unit} |`,
      );
    });
    lines.push("");
  }

  if (lines.length === 0) {
    lines.push(
      `| rank | framework | case | value | script | paint | diff vs 1st | diff vs ${escapeMarkdownTableCell(anchorFramework)} | unit |`,
    );
    lines.push("| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |");
    lines.push("|  | no completed results |  |  |  |  |  |  |  |");
    lines.push("");
  }

  return lines;
}

function rankJsFrameworkRows(resultRows, caseName) {
  return [...resultRows]
    .filter((row) => row.caseName === caseName && row.status === "completed")
    .sort((left, right) => {
      const valueOrder = left.value - right.value;

      if (valueOrder !== 0) {
        return valueOrder;
      }

      return left.framework.localeCompare(right.framework);
    });
}

function findAnchorRow(resultRows, caseName, anchorFramework) {
  return resultRows.find(
    (row) =>
      row.caseName === caseName &&
      row.status === "completed" &&
      matchesAnchorFramework(row.framework, anchorFramework),
  );
}

function formatDiffVsBest(row, bestRow) {
  if (
    row.status !== "completed" ||
    bestRow === undefined ||
    bestRow.status !== "completed" ||
    row.metric !== bestRow.metric ||
    row.caseName !== bestRow.caseName ||
    bestRow.value === 0
  ) {
    return "";
  }

  if (row.framework === bestRow.framework && row.value === bestRow.value) {
    return "best";
  }

  return formatPercent((row.value / bestRow.value - 1) * 100);
}

function formatPercent(value) {
  const rounded = Math.round(value * 100) / 100;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${String(rounded)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "")}%`;
}

function escapeMarkdownTableCell(value) {
  return value.replace(/\|/g, "\\|").replace(/[\n\r]+/g, " ");
}

function formatFrameworkCell(value) {
  const escaped = escapeMarkdownTableCell(value);
  return value.includes("mreact") ? `**${escaped}**` : escaped;
}

function readMetricParts(files, framework, caseId, metric) {
  const filename = `${framework}_${caseId}.json`;
  if (!files.includes(filename)) {
    return undefined;
  }

  return readJsonMetricParts(join(officialResultDir, filename), metric);
}

function readJsonMetricParts(filename, metric) {
  const json = JSON.parse(readFileSync(filename, "utf8"));
  return {
    paint: json.values?.paint?.median,
    script: json.values?.script?.median,
    value: json.values?.[metric]?.median ?? json.values?.DEFAULT?.median,
  };
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
