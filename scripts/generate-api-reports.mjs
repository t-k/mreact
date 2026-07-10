#!/usr/bin/env node

import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Extractor, ExtractorConfig } from "@microsoft/api-extractor";
import {
  apiForgottenExports,
  apiExtractorConfigForEntry,
  collectWorkspaceApiEntries,
  staleApiForgottenExportAllowlistEntries,
} from "./api-reference-packages.mjs";

const rootDir = resolve(new URL("..", import.meta.url).pathname);
const args = parseArgs(process.argv.slice(2));
const reportDir = "etc/api";
const tempDir = join(rootDir, "tmp", "api-extractor");
const tempConfigDir = join(tempDir, "configs");
const entries = (await collectWorkspaceApiEntries(rootDir)).filter(
  (entry) => args.packageNames.size === 0 || args.packageNames.has(entry.packageName),
);
const failures = [];
const forgottenExportAllowlist = [];

if (entries.length === 0) {
  throw new Error("No API entry points were found.");
}

await mkdir(tempConfigDir, { recursive: true });
await mkdir(join(rootDir, reportDir), { recursive: true });

for (const entry of entries) {
  const config = apiExtractorConfigForEntry(rootDir, reportDir, entry);
  const configPath = join(
    tempConfigDir,
    `${config.apiReport.reportFileName.replace(/\.api\.md$/, "")}.json`,
  );

  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const extractorConfig = ExtractorConfig.loadFileAndPrepare(configPath);
  const result = Extractor.invoke(extractorConfig, {
    localBuild: !args.check,
    showDiagnostics: false,
    showVerboseMessages: false,
  });

  const tempReport = join(tempDir, config.apiReport.reportFileName);
  const finalReport = join(rootDir, reportDir, config.apiReport.reportFileName);

  if (args.check) {
    if (!result.succeeded) {
      failures.push(`${entry.displayName}: API report is out of date`);
    }
    if (await exists(finalReport)) {
      recordForgottenExports(entry, await readFile(finalReport, "utf8"));
    }
    continue;
  }

  if (await exists(tempReport)) {
    await writeFile(finalReport, normalizeApiReport(await readFile(tempReport, "utf8")));
  }

  if (await exists(finalReport)) {
    recordForgottenExports(entry, await readFile(finalReport, "utf8"));
  }

  if (!result.succeeded && !(await exists(finalReport))) {
    failures.push(`${entry.displayName}: API Extractor did not produce ${tempReport}`);
  }
}

if (!args.check) {
  await rm(tempDir, { force: true, recursive: true });
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(
  args.check
    ? `Checked ${entries.length} API report entry points.`
    : `Generated ${entries.length} API report files in ${reportDir}.`,
);

function parseArgs(values) {
  const parsed = {
    check: false,
    packageNames: new Set(),
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--check") {
      parsed.check = true;
      continue;
    }

    if (value === "--package") {
      parsed.packageNames.add(readOptionValue(values, index, "package"));
      index += 1;
      continue;
    }

    if (value?.startsWith("--package=")) {
      parsed.packageNames.add(value.slice("--package=".length));
      continue;
    }

    throw new Error(`Unknown option ${value}`);
  }

  return parsed;
}

function readOptionValue(values, index, name) {
  const value = values[index + 1];

  if (value === undefined || value.startsWith("-")) {
    throw new Error(`Missing value for ${name}.`);
  }

  return value;
}

async function exists(path) {
  return access(path).then(
    () => true,
    () => false,
  );
}

function normalizeApiReport(value) {
  return value.replace(/\r\n/g, "\n");
}

function recordForgottenExports(entry, report) {
  const forgottenExports = apiForgottenExports(
    entry.displayName,
    report,
    forgottenExportAllowlist,
  );
  const staleAllowlistEntries = staleApiForgottenExportAllowlistEntries(
    entry.displayName,
    report,
    forgottenExportAllowlist,
  );

  if (forgottenExports.length > 0) {
    failures.push(
      `${entry.displayName}: public types are not exported: ${forgottenExports.join(", ")}`,
    );
  }
  if (staleAllowlistEntries.length > 0) {
    failures.push(
      `${entry.displayName}: stale forgotten-export exceptions: ${staleAllowlistEntries.map((entry) => entry.symbol).join(", ")}`,
    );
  }
}
