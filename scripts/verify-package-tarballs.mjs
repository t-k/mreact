#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { builtinModules } from "node:module";

const rootDir = resolve(new URL("..", import.meta.url).pathname);
const packagesDir = join(rootDir, "packages");
const tarballDir = join(rootDir, "dist", "npm");
const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
const failures = [];
const args = parseArgs(process.argv.slice(2));

const tarballs = readTarballs();
const tarballsByName = new Map(tarballs.map((tarball) => [tarball.packageJson.name, tarball]));
const sourcePackages = readSourcePackages().filter(
  (packageInfo) => !args.onlyPacked || tarballsByName.has(packageInfo.packageJson.name),
);

if (args.onlyPacked && tarballs.length === 0) {
  fail(tarballDir, "no packed tarballs found");
}

for (const packageInfo of sourcePackages) {
  const tarball = tarballsByName.get(packageInfo.packageJson.name);

  if (tarball === undefined) {
    fail(packageInfo.manifestPath, "missing packed tarball");
    continue;
  }

  verifyManifest(packageInfo, tarball);
  verifyDeclaredFiles(packageInfo, tarball);
  verifyEntrypoints(packageInfo, tarball);
  verifyDistSourceMaps(packageInfo, tarball);
  verifyNoBuildInfo(packageInfo, tarball);
  verifyRuntimeDependencies(packageInfo, tarball);
  verifySpecialPackages(packageInfo, tarball);
}

for (const tarball of tarballs) {
  if (
    !sourcePackages.some((packageInfo) => packageInfo.packageJson.name === tarball.packageJson.name)
  ) {
    fail(tarball.filename, "tarball does not match a public workspace package");
  }
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`Verified ${tarballs.length} package tarballs.`);

function parseArgs(values) {
  const parsed = {
    onlyPacked: false,
  };

  for (const value of values) {
    if (value === "--only-packed") {
      parsed.onlyPacked = true;
      continue;
    }

    throw new Error(`Unknown option ${value}`);
  }

  return parsed;
}

function readSourcePackages() {
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const packageDir = join(packagesDir, entry.name);
      const manifestPath = join(packageDir, "package.json");
      try {
        return {
          dir: packageDir,
          manifestPath,
          packageJson: readJson(manifestPath),
        };
      } catch (error) {
        if (error?.code === "ENOENT") {
          return undefined;
        }
        throw error;
      }
    })
    .filter((packageInfo) => packageInfo?.packageJson.private !== true)
    .sort((left, right) => left.packageJson.name.localeCompare(right.packageJson.name));
}

function readTarballs() {
  return readdirSync(tarballDir)
    .filter((filename) => filename.endsWith(".tgz"))
    .map((filename) => {
      const path = join(tarballDir, filename);
      const entries = new Set(
        execFileSync("tar", ["-tzf", path], { encoding: "utf8" }).trim().split(/\r?\n/),
      );
      const packageJson = JSON.parse(
        execFileSync("tar", ["-xOf", path, "package/package.json"], { encoding: "utf8" }),
      );

      return { entries, filename, packageJson, path };
    })
    .sort((left, right) => left.packageJson.name.localeCompare(right.packageJson.name));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function verifyManifest(packageInfo, tarball) {
  const source = packageInfo.packageJson;
  const packed = tarball.packageJson;

  for (const key of ["name", "version", "license", "types", "main", "type"]) {
    if (source[key] !== packed[key]) {
      fail(source.name, `packed ${key} differs from source manifest`);
    }
  }

  if (packed.license !== "MIT") {
    fail(source.name, "packed manifest must declare MIT license");
  }

  if (!tarball.entries.has("package/LICENSE")) {
    fail(source.name, "tarball must include LICENSE");
  }

  if (existsInSource(packageInfo, "README.md") && !tarball.entries.has("package/README.md")) {
    fail(source.name, "tarball must include README.md");
  }
}

function verifyDeclaredFiles(packageInfo, tarball) {
  const files = packageInfo.packageJson.files ?? [];

  for (const file of files) {
    const normalized = file.replace(/^\.\//, "").replace(/\/$/, "");
    const packedPath = `package/${normalized}`;
    const included = file.includes("*")
      ? [...tarball.entries].some((entry) => globMatches(packedPath, entry))
      : tarball.entries.has(packedPath) ||
        [...tarball.entries].some((entry) => entry.startsWith(`${packedPath}/`));

    if (!included) {
      fail(packageInfo.packageJson.name, `files entry ${file} is not included in tarball`);
    }
  }
}

function globMatches(glob, value) {
  const globstar = "__MREACT_GLOBSTAR__";
  const pattern = glob
    .replaceAll("**/", globstar)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", "[^/]*")
    .replaceAll(globstar, "(?:.*/)?");
  return new RegExp(`^${pattern}$`).test(value);
}

function verifyEntrypoints(packageInfo, tarball) {
  const manifest = packageInfo.packageJson;

  verifyRelativePath(packageInfo, tarball, manifest.types, "types");
  verifyRelativePath(packageInfo, tarball, manifest.main, "main");

  for (const [name, path] of Object.entries(manifest.bin ?? {})) {
    verifyRelativePath(packageInfo, tarball, path, `bin ${name}`);
    const packedPath = toPackedPath(path);
    if (tarball.entries.has(packedPath)) {
      const content = execFileSync("tar", ["-xOf", tarball.path, packedPath], { encoding: "utf8" });
      if (!content.startsWith("#!/usr/bin/env node")) {
        fail(manifest.name, `bin ${name} must start with a node shebang`);
      }
    }
  }

  for (const path of exportPaths(manifest.exports)) {
    verifyRelativePath(packageInfo, tarball, path, "exports");
  }
}

function verifyRelativePath(packageInfo, tarball, path, label) {
  if (typeof path !== "string" || !path.startsWith(".")) {
    return;
  }

  const packedPath = toPackedPath(path);
  if (!tarball.entries.has(packedPath)) {
    fail(packageInfo.packageJson.name, `${label} path ${path} is missing from tarball`);
  }
}

function exportPaths(exportsField) {
  const paths = [];
  collect(exportsField);
  return paths;

  function collect(value) {
    if (typeof value === "string") {
      paths.push(value);
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) collect(item);
      return;
    }

    if (value !== null && typeof value === "object") {
      for (const child of Object.values(value)) collect(child);
    }
  }
}

function verifyDistSourceMaps(packageInfo, tarball) {
  for (const entry of tarball.entries) {
    if (!entry.startsWith("package/dist/")) {
      continue;
    }

    if (entry.endsWith(".js") && !tarball.entries.has(`${entry}.map`)) {
      fail(packageInfo.packageJson.name, `${entry} is missing a .js.map file`);
    }

    if (entry.endsWith(".d.ts") && !tarball.entries.has(`${entry}.map`)) {
      fail(packageInfo.packageJson.name, `${entry} is missing a .d.ts.map file`);
    }

    if (entry.endsWith(".js.map") || entry.endsWith(".d.ts.map")) {
      verifySourceMapSources(packageInfo, tarball, entry);
    }
  }
}

function verifySourceMapSources(packageInfo, tarball, entry) {
  const content = execFileSync("tar", ["-xOf", tarball.path, entry], { encoding: "utf8" });
  let sourceMap;

  try {
    sourceMap = JSON.parse(content);
  } catch {
    fail(packageInfo.packageJson.name, `${entry} is not valid JSON`);
    return;
  }

  if (!Array.isArray(sourceMap.sources)) {
    fail(packageInfo.packageJson.name, `${entry} must declare sourcemap sources`);
    return;
  }

  if (entry.endsWith(".js.map")) {
    verifyRuntimeSourceMapContent(packageInfo, entry, sourceMap);
  }

  const sourceRoot = typeof sourceMap.sourceRoot === "string" ? sourceMap.sourceRoot : "";

  for (const source of sourceMap.sources) {
    if (typeof source !== "string" || source.length === 0 || isVirtualSourceMapSource(source)) {
      continue;
    }

    const packedPath = resolveSourceMapSource(entry, sourceRoot, source);
    if (packedPath === undefined) {
      fail(packageInfo.packageJson.name, `${entry} points to unsupported source ${source}`);
      continue;
    }

    if (!packedPath.startsWith("package/")) {
      fail(packageInfo.packageJson.name, `${entry} points outside the package: ${source}`);
      continue;
    }

    if (!tarball.entries.has(packedPath)) {
      fail(packageInfo.packageJson.name, `${entry} points to missing source ${source}`);
    }
  }
}

function verifyRuntimeSourceMapContent(packageInfo, entry, sourceMap) {
  if (!Array.isArray(sourceMap.sourcesContent)) {
    fail(packageInfo.packageJson.name, `${entry} must include sourcesContent for Vite dev`);
    return;
  }

  for (let index = 0; index < sourceMap.sources.length; index += 1) {
    const source = sourceMap.sources[index];
    if (typeof source !== "string" || source.length === 0 || isVirtualSourceMapSource(source)) {
      continue;
    }

    if (typeof sourceMap.sourcesContent[index] !== "string") {
      fail(packageInfo.packageJson.name, `${entry} must inline source content for ${source}`);
    }
  }
}

function isVirtualSourceMapSource(source) {
  return (
    source.startsWith("<") ||
    source.startsWith("[") ||
    source.startsWith("webpack://") ||
    source.startsWith("rollup://") ||
    source.startsWith("vite://")
  );
}

function resolveSourceMapSource(mapEntry, sourceRoot, source) {
  const rootedSource = sourceRoot.length > 0 ? posix.join(sourceRoot, source) : source;

  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(rootedSource) || rootedSource.startsWith("/")) {
    return undefined;
  }

  return posix.normalize(posix.join(posix.dirname(mapEntry), rootedSource));
}

function verifyNoBuildInfo(packageInfo, tarball) {
  for (const entry of tarball.entries) {
    if (entry.endsWith(".tsbuildinfo")) {
      fail(packageInfo.packageJson.name, `${entry} should not be published`);
    }
  }
}

function verifyRuntimeDependencies(packageInfo, tarball) {
  const manifest = packageInfo.packageJson;
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]);
  const imported = new Set();

  for (const entry of tarball.entries) {
    if (
      !entry.startsWith("package/dist/") ||
      (!entry.endsWith(".js") && !entry.endsWith(".d.ts"))
    ) {
      continue;
    }

    const content = execFileSync("tar", ["-xOf", tarball.path, entry], { encoding: "utf8" });
    for (const specifier of topLevelImportSpecifiers(content)) {
      const packageName = packageNameFromSpecifier(specifier);
      if (packageName !== undefined) {
        imported.add(packageName);
      }
    }
  }

  for (const packageName of imported) {
    if (packageName === manifest.name || builtins.has(packageName)) {
      continue;
    }

    if (ignoredTemplateDependency(manifest.name, packageName)) {
      continue;
    }

    if (!declared.has(packageName)) {
      fail(manifest.name, `imports ${packageName} but does not declare it`);
    }
  }

  if (manifest.name === "@reckona/mreact-router") {
    if (manifest.peerDependencies?.vite === undefined) {
      fail(manifest.name, "must keep vite as a peer dependency");
    }
    if (manifest.optionalDependencies?.["@reckona/mreact-router-native"] === undefined) {
      fail(manifest.name, "must declare the native loader as an optional dependency");
    }
  }

  if (manifest.name === "@reckona/mreact-vite" && manifest.peerDependencies?.vite === undefined) {
    fail(manifest.name, "must keep vite as a peer dependency");
  }

  if (manifest.name === "@reckona/mreact-router-native") {
    for (const name of [
      "@reckona/mreact-router-native-darwin-arm64",
      "@reckona/mreact-router-native-linux-x64-gnu",
      "@reckona/mreact-router-native-win32-x64-msvc",
    ]) {
      if (manifest.optionalDependencies?.[name] === undefined) {
        fail(manifest.name, `must declare ${name} as an optional dependency`);
      }
    }
  }
}

function ignoredTemplateDependency(ownPackageName, importedPackageName) {
  return (
    ownPackageName === "@reckona/create-mreact-app" &&
    (importedPackageName === "@reckona/mreact-auth" ||
      importedPackageName === "@reckona/mreact-devtools" ||
      importedPackageName === "@reckona/mreact-forms" ||
      importedPackageName === "@reckona/mreact-query" ||
      importedPackageName === "@reckona/mreact-router" ||
      importedPackageName === "vite")
  );
}

function topLevelImportSpecifiers(content) {
  const specifiers = [];
  const importExportPattern =
    /^(?:import|export)\s+(?:[^'"]*?\s+from\s+)?["'](?<specifier>[^'"]+)["'];?/gm;
  const dynamicImportPattern = /^import\(["'](?<specifier>[^'"]+)["']\);?/gm;
  const requirePattern = /require\(["'](?<specifier>[^'"]+)["']\)/gm;

  for (const match of content.matchAll(importExportPattern)) {
    specifiers.push(match.groups.specifier);
  }
  for (const match of content.matchAll(dynamicImportPattern)) {
    specifiers.push(match.groups.specifier);
  }
  for (const match of content.matchAll(requirePattern)) {
    specifiers.push(match.groups.specifier);
  }

  return specifiers;
}

function packageNameFromSpecifier(specifier) {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    builtins.has(specifier) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(specifier)
  ) {
    return undefined;
  }

  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return name === undefined ? undefined : `${scope}/${name}`;
  }

  return specifier.split("/")[0];
}

function verifySpecialPackages(packageInfo, tarball) {
  const manifest = packageInfo.packageJson;

  if (manifest.name === "@reckona/create-mreact-app") {
    if (!tarball.entries.has("package/dist/cli.js")) {
      fail(manifest.name, "CLI bin is missing");
    }

    const indexContent = execFileSync("tar", ["-xOf", tarball.path, "package/dist/index.js"], {
      encoding: "utf8",
    });
    for (const template of ["basic", "tailwind", "dashboard"]) {
      if (!indexContent.includes(template)) {
        fail(manifest.name, `compiled scaffolder is missing ${template} template`);
      }
    }
    for (const deployTarget of ["cloudflare", "container", "aws-lambda"]) {
      if (!indexContent.includes(deployTarget)) {
        fail(manifest.name, `compiled scaffolder is missing ${deployTarget} deploy target`);
      }
    }
  }

  if (manifest.name === "@reckona/mreact-router-native") {
    if (tarball.entries.has("package/index.node")) {
      fail(manifest.name, "generic native loader tarball must not include index.node");
    }
  }

  if (manifest.name.startsWith("@reckona/mreact-router-native-")) {
    if (!tarball.entries.has("package/index.node")) {
      fail(manifest.name, "platform native tarball must include index.node");
    }
  }
}

function existsInSource(packageInfo, file) {
  try {
    readFileSync(join(packageInfo.dir, file));
    return true;
  } catch {
    return false;
  }
}

function toPackedPath(path) {
  return `package/${path.replace(/^\.\//, "")}`;
}

function fail(subject, message) {
  failures.push(`${subject}: ${message}`);
}
