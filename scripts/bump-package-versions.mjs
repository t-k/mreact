#!/usr/bin/env node

import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const defaultRootDir = resolve(new URL("..", import.meta.url).pathname);
const createAppDependencyRangePackages = [
  "@reckona/mreact",
  "@reckona/mreact-reactive-core",
  "@reckona/mreact-router",
];

if (isCliEntryPoint(import.meta.url, process.argv[1])) {
  await main(process.argv.slice(2), { rootDir: defaultRootDir });
}

export async function main(argv, options = {}) {
  const args = parseArgs(argv);
  const rootDir = options.rootDir ?? defaultRootDir;

  if (!isValidSemver(args.version)) {
    throw new Error(`Invalid semver version: ${args.version}`);
  }

  const manifests = await readVersionedPackageManifests(rootDir);

  if (args.check) {
    const mismatches = findVersionMismatches(manifests, args.version);
    const createAppMismatches = await findCreateAppDependencyRangeMismatches(rootDir, args.version);
    const allMismatches = [...mismatches, ...createAppMismatches];
    if (allMismatches.length > 0) {
      throw new Error(
        `Package versions are not aligned to ${args.version}:\n${allMismatches
          .map((mismatch) => `- ${mismatch.path}: ${mismatch.actual}`)
          .join("\n")}`,
      );
    }
    console.log(`All ${manifests.length} package versions are ${args.version}.`);
    return;
  }

  const changed = await updatePackageVersions(manifests, args.version);
  const createAppChanged = await updateCreateAppDependencyRanges(rootDir, args.version);
  console.log(
    `Updated ${changed} of ${manifests.length} package versions and ${createAppChanged} create app dependency ranges to ${args.version}.`,
  );
}

export function parseArgs(argv) {
  const parsed = {
    check: false,
    version: undefined,
  };

  for (const value of argv) {
    if (value === "--check") {
      parsed.check = true;
      continue;
    }

    if (value.startsWith("-")) {
      throw new Error(`Unknown option ${value}`);
    }

    if (parsed.version !== undefined) {
      throw new Error(`Unexpected argument ${value}`);
    }

    parsed.version = value;
  }

  if (parsed.version === undefined) {
    throw new Error("Usage: node scripts/bump-package-versions.mjs <version> [--check]");
  }

  return parsed;
}

export function isValidSemver(version) {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
    version,
  );
}

export async function readVersionedPackageManifests(rootDir) {
  const rootManifest = await readManifest(resolve(rootDir, "package.json"));
  const packageManifests = await readPublicWorkspacePackageManifests(resolve(rootDir, "packages"));
  return [rootManifest, ...packageManifests].filter((manifest) => manifest.json.version !== undefined);
}

export function findVersionMismatches(manifests, version) {
  return manifests
    .filter((manifest) => manifest.json.version !== version)
    .map((manifest) => ({
      actual: manifest.json.version,
      path: manifest.path,
    }));
}

export async function updatePackageVersions(manifests, version) {
  let changed = 0;

  for (const manifest of manifests) {
    if (manifest.json.version === version) {
      continue;
    }

    manifest.json.version = version;
    await writeFile(manifest.path, `${JSON.stringify(manifest.json, null, 2)}\n`);
    changed += 1;
  }

  return changed;
}

export async function findCreateAppDependencyRangeMismatches(rootDir, version) {
  const path = createAppSourcePath(rootDir);
  const source = await readFile(path, "utf8");
  const mismatches = [];

  for (const packageName of createAppDependencyRangePackages) {
    const current = readCreateAppDependencyRange(source, packageName);
    const expected = `^${version}`;

    if (current !== expected) {
      mismatches.push({
        actual: current ?? "<missing>",
        path: `${path} ${packageName}`,
      });
    }
  }

  return mismatches;
}

export async function updateCreateAppDependencyRanges(rootDir, version) {
  const path = createAppSourcePath(rootDir);
  let source = await readFile(path, "utf8");
  let changed = 0;

  for (const packageName of createAppDependencyRangePackages) {
    const current = readCreateAppDependencyRange(source, packageName);
    const next = `^${version}`;

    if (current === next) {
      continue;
    }

    if (current === undefined) {
      throw new Error(`Missing create-mreact-app dependency range for ${packageName}`);
    }

    source = source.replace(
      createAppDependencyRangePattern(packageName),
      (_match, prefix, _current, suffix) => `${prefix}${next}${suffix}`,
    );
    changed += 1;
  }

  if (changed > 0) {
    await writeFile(path, source);
  }

  return changed;
}

async function readPublicWorkspacePackageManifests(packagesDir) {
  const entries = await readdir(packagesDir, { withFileTypes: true });
  const manifests = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const manifest = await readManifest(resolve(packagesDir, entry.name, "package.json")).catch(
      (error) => {
        if (error?.code === "ENOENT") {
          return undefined;
        }

        throw error;
      },
    );

    if (manifest !== undefined && manifest.json.private !== true) {
      manifests.push(manifest);
    }
  }

  return manifests.sort((left, right) => left.json.name.localeCompare(right.json.name));
}

async function readManifest(path) {
  return {
    json: JSON.parse(await readFile(path, "utf8")),
    path,
  };
}

function createAppSourcePath(rootDir) {
  return resolve(rootDir, "packages/create-mreact-app/src/index.ts");
}

function readCreateAppDependencyRange(source, packageName) {
  return createAppDependencyRangePattern(packageName).exec(source)?.[2];
}

function createAppDependencyRangePattern(packageName) {
  return new RegExp(`("${escapeRegExp(packageName)}"\\s*:\\s*")([^"]+)(")`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isCliEntryPoint(importMetaUrl, argvPath) {
  if (argvPath === undefined) {
    return false;
  }

  return pathToFileURL(resolve(argvPath)).href === importMetaUrl;
}
