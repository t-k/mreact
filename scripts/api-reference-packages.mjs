import { readdir, readFile } from "node:fs/promises";
import { join, posix, resolve } from "node:path";

const skippedExportPattern = /(?:^|\/)internal(?:\/|$)/;

export async function collectWorkspaceApiEntries(rootDir) {
  const packagesDir = join(rootDir, "packages");
  const directories = await readdir(packagesDir, { withFileTypes: true });
  const entries = [];

  for (const directory of directories) {
    if (!directory.isDirectory()) {
      continue;
    }

    const packageDir = posix.join("packages", directory.name);
    const manifest = await readPackageManifest(join(rootDir, packageDir, "package.json"));

    if (manifest === undefined || manifest.private === true || typeof manifest.types !== "string") {
      continue;
    }

    entries.push(...collectPackageApiEntries(packageDir, manifest));
  }

  return entries.sort((left, right) =>
    `${left.packageName}:${left.exportPath}`.localeCompare(`${right.packageName}:${right.exportPath}`),
  );
}

export function collectPackageApiEntries(packageDir, manifest) {
  const packageName = manifest.name;

  if (typeof packageName !== "string" || packageName.length === 0) {
    return [];
  }

  const exportsEntries = Object.entries(manifest.exports ?? {});
  const entries = [];

  if (exportsEntries.length === 0 && typeof manifest.types === "string") {
    entries.push(createApiEntry(packageDir, packageName, ".", manifest.types));
    return entries;
  }

  for (const [exportPath, exportValue] of exportsEntries) {
    if (skippedExportPattern.test(exportPath)) {
      continue;
    }

    const typesPath = typesPathFromExport(exportValue);
    if (typesPath === undefined) {
      continue;
    }

    entries.push(createApiEntry(packageDir, packageName, exportPath, typesPath));
  }

  return entries;
}

export function apiReportFileName(packageName, exportPath) {
  const subpath = exportPath === "."
    ? ""
    : `__${exportPath.replace(/^\.\//, "").replaceAll("/", "__")}`;
  return `${packageSlug(packageName)}${subpath}.api.md`;
}

export function apiExtractorConfigForEntry(rootDir, reportDir, entry) {
  const reportFileName = apiReportFileName(entry.packageName, entry.exportPath);

  return {
    $schema:
      "https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json",
    mainEntryPointFilePath: resolve(rootDir, entry.entryPoint),
    projectFolder: resolve(rootDir, entry.packageDir),
    compiler: {
      tsconfigFilePath: resolve(rootDir, entry.packageDir, "tsconfig.json"),
    },
    apiReport: {
      enabled: true,
      reportFileName,
      reportFolder: resolve(rootDir, reportDir),
      reportTempFolder: resolve(rootDir, "tmp", "api-extractor"),
    },
    docModel: {
      enabled: false,
    },
    dtsRollup: {
      enabled: false,
    },
    messages: {
      compilerMessageReporting: {
        default: {
          logLevel: "warning",
        },
      },
      extractorMessageReporting: {
        "ae-internal-missing-underscore": {
          logLevel: "none",
        },
        "ae-missing-release-tag": {
          logLevel: "none",
        },
      },
      tsdocMessageReporting: {
        default: {
          logLevel: "warning",
        },
      },
    },
  };
}

export function packageSlug(packageName) {
  return packageName.replace(/^@/, "").replaceAll("/", "-");
}

function createApiEntry(packageDir, packageName, exportPath, typesPath) {
  return {
    displayName: exportPath === "." ? packageName : `${packageName}/${exportPath.replace(/^\.\//, "")}`,
    entryPoint: posix.join(packageDir, typesPath.replace(/^\.\//, "")),
    exportPath,
    packageDir,
    packageName,
  };
}

function typesPathFromExport(value) {
  if (typeof value === "string") {
    return value.endsWith(".d.ts") ? value : undefined;
  }

  if (value === null || typeof value !== "object") {
    return undefined;
  }

  if (typeof value.types === "string") {
    return value.types;
  }

  for (const child of Object.values(value)) {
    const result = typesPathFromExport(child);
    if (result !== undefined) {
      return result;
    }
  }

  return undefined;
}

async function readPackageManifest(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}
