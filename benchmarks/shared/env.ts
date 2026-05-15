import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus, totalmem } from "node:os";
import { dirname, join } from "node:path";
import type { BenchmarkEnvironment } from "./types.js";

const require = createRequire(import.meta.url);

export async function collectBenchmarkEnvironment(
  packages: readonly string[],
): Promise<BenchmarkEnvironment> {
  return {
    date: new Date().toISOString().slice(0, 10),
    gitCommit: readCommand("git", ["rev-parse", "HEAD"]),
    nodeVersion: process.version,
    nodeEnv: process.env.NODE_ENV ?? "unset",
    pnpmVersion: readCommand("pnpm", ["--version"]),
    platform: process.platform,
    arch: process.arch,
    cpuModel: cpus()[0]?.model ?? "unknown",
    cpuCount: cpus().length,
    totalMemoryBytes: totalmem(),
    packageVersions: Object.fromEntries(
      packages.map((packageName) => [
        packageName,
        readPackageVersion(packageName),
      ]),
    ),
  };
}

export function readPackageVersion(packageName: string): string {
  try {
    return readVersionFromPackageJson(
      require.resolve(`${packageName}/package.json`),
    );
  } catch {
    // Fall back to walking from the resolved entrypoint for packages that do not
    // expose package.json.
  }

  try {
    let current = dirname(require.resolve(packageName));

    for (let index = 0; index < 8; index += 1) {
      const packageJsonPath = join(current, "package.json");

      try {
        return readVersionFromPackageJson(packageJsonPath);
      } catch {
        current = dirname(current);
      }
    }
  } catch {
    return "unknown";
  }

  return "unknown";
}

function readVersionFromPackageJson(packageJsonPath: string): string {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    version?: string;
  };
  return packageJson.version ?? "unknown";
}

function readCommand(command: string, args: readonly string[]): string {
  try {
    return execFileSync(command, [...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}
