#!/usr/bin/env node

import { access, copyFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const rootDir = resolve(new URL("..", import.meta.url).pathname);
const packagesDir = join(rootDir, "packages");
const packDir = join(rootDir, "dist", "npm");
const rootLicenseFile = join(rootDir, "LICENSE");
const args = parseArgs(process.argv.slice(2));
const packages = await readPackages();
const orderedPackages = sortPackages(packages);

await preflightRequiredFiles(orderedPackages);
await rm(packDir, { force: true, recursive: true });
await mkdir(packDir, { recursive: true });

for (const packageInfo of orderedPackages) {
  const spec = `${packageInfo.name}@${packageInfo.version}`;

  if (!args.skipExistingCheck && (await packageExists(spec))) {
    console.log(`skip ${spec}: already published`);
    continue;
  }

  const tarball = await packPackage(packageInfo);
  await publishPackage(tarball, packageInfo);
}

function parseArgs(values) {
  const parsed = {
    access: "public",
    dryRun: false,
    skipExistingCheck: false,
    tag: "latest",
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }

    if (value === "--skip-existing-check") {
      parsed.skipExistingCheck = true;
      continue;
    }

    if (value === "--tag") {
      parsed.tag = readOptionValue(values, index, "tag");
      index += 1;
      continue;
    }

    if (value?.startsWith("--tag=")) {
      parsed.tag = value.slice("--tag=".length);
      continue;
    }

    if (value === "--access") {
      parsed.access = readOptionValue(values, index, "access");
      index += 1;
      continue;
    }

    if (value?.startsWith("--access=")) {
      parsed.access = value.slice("--access=".length);
      continue;
    }

    throw new Error(`Unknown option ${value}`);
  }

  return parsed;
}

function readOptionValue(values, index, name) {
  const value = values[index + 1];

  if (value === undefined || value.startsWith("-")) {
    throw new Error(`Missing value for ${name}`);
  }

  return value;
}

async function readPackages() {
  const directories = await readdir(packagesDir, { withFileTypes: true });
  const packageInfos = [];

  for (const directory of directories) {
    if (!directory.isDirectory()) {
      continue;
    }

    const packageDir = join(packagesDir, directory.name);
    const packageJson = await readJson(join(packageDir, "package.json")).catch((error) => {
      if (error?.code === "ENOENT") {
        return undefined;
      }

      throw error;
    });

    if (packageJson === undefined || packageJson.private === true) {
      continue;
    }

    packageInfos.push({
      dependencies: internalDependencies(packageJson),
      dir: packageDir,
      name: packageJson.name,
      version: packageJson.version,
    });
  }

  return packageInfos;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function internalDependencies(packageJson) {
  return Object.keys({
    ...packageJson.dependencies,
    ...packageJson.peerDependencies,
    ...packageJson.optionalDependencies,
  }).filter((name) => name.startsWith("@reckona/"));
}

function sortPackages(packageInfos) {
  const byName = new Map(packageInfos.map((packageInfo) => [packageInfo.name, packageInfo]));
  const visited = new Set();
  const visiting = new Set();
  const sorted = [];

  for (const packageInfo of packageInfos) {
    visit(packageInfo);
  }

  return sorted;

  function visit(packageInfo) {
    if (visited.has(packageInfo.name)) {
      return;
    }

    if (visiting.has(packageInfo.name)) {
      throw new Error(`Circular package dependency involving ${packageInfo.name}`);
    }

    visiting.add(packageInfo.name);

    for (const dependency of packageInfo.dependencies) {
      const dependencyInfo = byName.get(dependency);
      if (dependencyInfo !== undefined) {
        visit(dependencyInfo);
      }
    }

    visiting.delete(packageInfo.name);
    visited.add(packageInfo.name);
    sorted.push(packageInfo);
  }
}

async function preflightRequiredFiles(packageInfos) {
  if (args.dryRun) {
    return;
  }

  const requiredNativePackages = new Set([
    "@reckona/mreact-router-native-darwin-arm64",
    "@reckona/mreact-router-native-linux-x64-gnu",
    "@reckona/mreact-router-native-win32-x64-msvc",
  ]);
  const missingFiles = [];

  for (const packageInfo of packageInfos) {
    if (!requiredNativePackages.has(packageInfo.name)) {
      continue;
    }

    const binary = join(packageInfo.dir, "index.node");
    await access(binary).catch(() => {
      missingFiles.push(binary);
    });
  }

  if (missingFiles.length > 0) {
    throw new Error(
      `Missing native package binaries. Build or download these files before publishing:\n${missingFiles.join("\n")}`,
    );
  }
}

async function packageExists(spec) {
  const result = await run("npm", ["view", spec, "version", "--json"], {
    allowFailure: true,
    cwd: rootDir,
  });

  if (result.exitCode === 0) {
    return true;
  }

  const output = `${result.stdout}\n${result.stderr}`;
  if (output.includes("E404") || output.includes("404 Not Found")) {
    return false;
  }

  throw new Error(`Failed to check ${spec} on npm:\n${output}`);
}

async function packPackage(packageInfo) {
  console.log(`pack ${packageInfo.name}@${packageInfo.version}`);
  const cleanupLicense = await copyRootLicenseForPack(packageInfo.dir);
  let result;

  try {
    result = await run(
      "corepack",
      ["pnpm", "--dir", packageInfo.dir, "pack", "--pack-destination", packDir],
      { cwd: rootDir },
    );
  } finally {
    await cleanupLicense();
  }

  const tarballName = result.stdout
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);

  if (tarballName === undefined) {
    throw new Error(`Could not determine packed tarball for ${packageInfo.name}`);
  }

  return join(packDir, basename(tarballName));
}

async function copyRootLicenseForPack(packageDir) {
  const packageLicenseFile = join(packageDir, "LICENSE");
  const packageHasLicense = await access(packageLicenseFile)
    .then(() => true)
    .catch(() => false);

  if (packageHasLicense) {
    return async () => {};
  }

  await copyFile(rootLicenseFile, packageLicenseFile);
  return async () => {
    await rm(packageLicenseFile, { force: true });
  };
}

async function publishPackage(tarball, packageInfo) {
  const commandArgs = ["publish", tarball, "--access", args.access, "--tag", args.tag];

  if (args.dryRun) {
    commandArgs.push("--dry-run");
  }

  console.log(
    `${args.dryRun ? "dry-run publish" : "publish"} ${packageInfo.name}@${packageInfo.version}`,
  );
  await run("npm", commandArgs, { cwd: rootDir, inheritStdio: true });
}

function run(command, commandArgs, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd,
      shell: process.platform === "win32",
      stdio: options.inheritStdio ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", rejectRun);
    child.on("close", (exitCode) => {
      if (exitCode === 0 || options.allowFailure === true) {
        resolveRun({ exitCode, stdout, stderr });
        return;
      }

      rejectRun(
        new Error(
          `${command} ${commandArgs.join(" ")} failed with exit code ${exitCode}\n${stdout}\n${stderr}`,
        ),
      );
    });
  });
}
