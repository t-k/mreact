import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

interface PackageSizeRow {
  files: number;
  gzipBytes: number;
  name: string;
  rawBytes: number;
}

const measuredExtensions = new Set([".cjs", ".css", ".js", ".json", ".mjs", ".wasm"]);
const packageDir = "packages";
const maxPackageGzipBytes = 512 * 1024;
const maxTotalGzipBytes = 2 * 1024 * 1024;
const checkBudget = process.env.CHECK_BUNDLE_SIZE_BUDGET === "1";

const rows = await measurePackageDistSizes();
const totalRawBytes = rows.reduce((sum, row) => sum + row.rawBytes, 0);
const totalGzipBytes = rows.reduce((sum, row) => sum + row.gzipBytes, 0);

printReport(rows, { totalGzipBytes, totalRawBytes });

if (checkBudget) {
  const oversizedPackages = rows.filter((row) => row.gzipBytes > maxPackageGzipBytes);
  const failures = [
    ...oversizedPackages.map((row) =>
      `${row.name} gzip size ${formatBytes(row.gzipBytes)} exceeds ${formatBytes(maxPackageGzipBytes)} package budget`
    ),
    ...(totalGzipBytes > maxTotalGzipBytes
      ? [
          `total gzip size ${formatBytes(totalGzipBytes)} exceeds ${formatBytes(maxTotalGzipBytes)} total budget`,
        ]
      : []),
  ];

  if (failures.length > 0) {
    console.error(`\nBundle size budget failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
    process.exitCode = 1;
  }
}

async function measurePackageDistSizes(): Promise<PackageSizeRow[]> {
  const packageEntries = await readdir(packageDir, { withFileTypes: true });
  const rows: PackageSizeRow[] = [];

  for (const entry of packageEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const packageJsonPath = join(packageDir, entry.name, "package.json");
    const distDir = join(packageDir, entry.name, "dist");

    if (!existsSync(packageJsonPath) || !existsSync(distDir)) {
      continue;
    }

    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { private?: boolean; name?: string };
    if (packageJson.private === true || packageJson.name === undefined) {
      continue;
    }

    const size = await measureDirectory(distDir);
    rows.push({
      files: size.files,
      gzipBytes: size.gzipBytes,
      name: packageJson.name,
      rawBytes: size.rawBytes,
    });
  }

  return rows.sort((left, right) => right.gzipBytes - left.gzipBytes);
}

async function measureDirectory(directory: string): Promise<{ files: number; gzipBytes: number; rawBytes: number }> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  let files = 0;
  let gzipBytes = 0;
  let rawBytes = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !hasMeasuredExtension(entry.name)) {
      continue;
    }

    const parentPath =
      "parentPath" in entry && typeof (entry as { parentPath?: string }).parentPath === "string"
        ? (entry as { parentPath: string }).parentPath
        : directory;
    const content = await readFile(join(parentPath, entry.name));
    files += 1;
    rawBytes += content.byteLength;
    gzipBytes += gzipSync(content).byteLength;
  }

  return { files, gzipBytes, rawBytes };
}

function hasMeasuredExtension(fileName: string): boolean {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 && measuredExtensions.has(fileName.slice(dotIndex));
}

function printReport(rows: readonly PackageSizeRow[], totals: { totalGzipBytes: number; totalRawBytes: number }): void {
  console.log("# Package dist size");
  console.log("");
  console.log("| package | files | raw | gzip |");
  console.log("| --- | ---: | ---: | ---: |");
  for (const row of rows) {
    console.log(`| ${row.name} | ${row.files} | ${formatBytes(row.rawBytes)} | ${formatBytes(row.gzipBytes)} |`);
  }
  console.log(`| total | ${rows.reduce((sum, row) => sum + row.files, 0)} | ${formatBytes(totals.totalRawBytes)} | ${formatBytes(totals.totalGzipBytes)} |`);
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
  }

  return `${(bytes / 1024).toFixed(1)} KiB`;
}
