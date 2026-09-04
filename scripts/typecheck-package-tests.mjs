import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import ts from "typescript";

const rootDir = process.cwd();
const packagesDir = resolve(rootDir, "packages");
const testSourcePattern = /\.tsx?$/;

const collectTestFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory()
        ? collectTestFiles(path)
        : testSourcePattern.test(entry.name)
          ? [path]
          : [];
    })
    .sort();

const discoverPackageTestProjects = () =>
  readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const packageDir = resolve(packagesDir, entry.name);
      const testDir = resolve(packageDir, "test");
      try {
        const testFiles = collectTestFiles(testDir);
        return testFiles.length === 0
          ? []
          : [{ name: entry.name, packageDir, testFiles }];
      } catch (error) {
        if (error.code === "ENOENT") {
          return [];
        }
        throw error;
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name));

const projects = discoverPackageTestProjects();
const packagePaths = Object.fromEntries(
  readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const packageDir = resolve(packagesDir, entry.name);
      try {
        const packageJson = JSON.parse(readFileSync(resolve(packageDir, "package.json"), "utf8"));
        if (typeof packageJson.name !== "string") {
          return [];
        }
        const sourceDir = relative(rootDir, resolve(packageDir, "src")).split(sep).join("/");
        return [
          [packageJson.name, [`${sourceDir}/index.ts`]],
          [`${packageJson.name}/*`, [`${sourceDir}/*.ts`]],
        ];
      } catch (error) {
        if (error.code === "ENOENT") {
          return [];
        }
        throw error;
      }
    }),
);

if (process.argv.includes("--list-files")) {
  const files = projects
    .flatMap((project) => project.testFiles)
    .map((file) => relative(rootDir, file).split(sep).join("/"));
  writeFileSync(process.stdout.fd, `${files.join("\n")}\n`);
  process.exit(0);
}

const formatHost = {
  getCanonicalFileName: (fileName) => fileName,
  getCurrentDirectory: () => rootDir,
  getNewLine: () => ts.sys.newLine,
};
let hasErrors = false;

for (const project of projects) {
  const configPath = resolve(project.packageDir, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    process.stderr.write(ts.formatDiagnostics([config.error], formatHost));
    hasErrors = true;
    continue;
  }

  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, project.packageDir, {}, configPath);
  if (parsed.errors.length > 0) {
    process.stderr.write(ts.formatDiagnostics(parsed.errors, formatHost));
    hasErrors = true;
    continue;
  }

  const options = {
    ...parsed.options,
    composite: false,
    declaration: false,
    declarationMap: false,
    incremental: false,
    inlineSources: false,
    noEmit: true,
    allowImportingTsExtensions: true,
    noUncheckedIndexedAccess: false,
    exactOptionalPropertyTypes: false,
    ignoreDeprecations: "6.0",
    jsx: ts.JsxEmit.Preserve,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noImplicitOverride: false,
    strict: false,
    baseUrl: rootDir,
    paths: packagePaths,
    sourceMap: false,
    types: [...new Set([...(parsed.options.types ?? []), "node", "vitest/globals"])],
  };
  delete options.outDir;
  delete options.rootDir;
  delete options.tsBuildInfoFile;

  const program = ts.createProgram({
    rootNames: [...new Set([...parsed.fileNames, ...project.testFiles])],
    options,
    projectReferences: parsed.projectReferences,
  });
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter(
      (diagnostic) =>
        diagnostic.file === undefined ||
        diagnostic.file.fileName.startsWith(resolve(project.packageDir, "test") + sep),
    );
  if (diagnostics.length > 0) {
    process.stderr.write(`\nPackage ${project.name}\n`);
    process.stderr.write(ts.formatDiagnostics(diagnostics, formatHost));
    hasErrors = true;
  }
}

process.exitCode = hasErrors ? 1 : 0;
