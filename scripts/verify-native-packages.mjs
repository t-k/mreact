#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const rootDir = resolve(new URL("..", import.meta.url).pathname);
const require = createRequire(import.meta.url);

const platformPackages = [
  "router-native-darwin-arm64",
  "router-native-linux-x64-gnu",
  "router-native-win32-x64-msvc",
];
const packages = ["router-native", ...platformPackages];
const allowMissingPlatformBinaries =
  process.env["MREACT_ALLOW_MISSING_NATIVE_PLATFORM_BINARIES"] === "1";
const missing = [];

for (const packageDir of packages) {
  await verifyPackageFiles(packageDir);
}

if (missing.length > 0) {
  throw new Error(`Native package validation failed:\n${missing.join("\n")}`);
}

smokeCurrentPlatformPackage();

console.log("Verified native package metadata, staged artifacts, and current platform loader.");

async function verifyPackageFiles(packageDir) {
  const dir = join(rootDir, "packages", packageDir);
  const manifest = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));

  expectEqual(manifest.main, "./index.cjs", `${manifest.name} main`);
  expectEqual(manifest.types, "./index.d.ts", `${manifest.name} types`);
  expectEqual(
    JSON.stringify(manifest.exports?.["."]),
    JSON.stringify({
      types: "./index.d.ts",
      require: "./index.cjs",
      default: "./index.cjs",
    }),
    `${manifest.name} exports["."]`,
  );

  for (const filename of ["index.cjs", "index.d.ts"]) {
    await requireFile(join(dir, filename), `${manifest.name} ${filename}`);
    if (!manifest.files?.includes(filename)) {
      missing.push(`${manifest.name}: files must include ${filename}`);
    }
  }

  if (packageDir !== "router-native") {
    if (allowMissingPlatformBinaries) {
      await access(join(dir, "index.node")).catch(() => {});
    } else {
      await requireFile(join(dir, "index.node"), `${manifest.name} index.node`);
    }
    if (!manifest.files?.includes("index.node")) {
      missing.push(`${manifest.name}: files must include index.node`);
    }
  }
}

function smokeCurrentPlatformPackage() {
  const native = require(join(rootDir, "packages", "router-native"));
  for (const exportName of [
    "NativeRouteMatcher",
    "escapeHtmlBatch",
    "escapeAttributeBatch",
    "decodeFlightBase64",
    "decodeFlightRows",
    "encodeFlightResponse",
    "mergeFlightRows",
  ]) {
    if (typeof native[exportName] !== "function") {
      throw new Error(`@reckona/mreact-router-native export ${exportName} is not a function`);
    }
  }

  const matcher = new native.NativeRouteMatcher(
    JSON.stringify([{ index: 1, segments: [{ kind: "dynamic", name: "id" }] }]),
  );
  const match = matcher.matchRoute("/hello");
  if (match?.index !== 1 || match.params.id !== "hello") {
    throw new Error("NativeRouteMatcher smoke test did not return the expected match");
  }
}

async function requireFile(path, label) {
  await access(path).catch(() => {
    missing.push(`${label} is missing at ${path}`);
  });
}

function expectEqual(actual, expected, label) {
  if (actual !== expected) {
    missing.push(`${label} must be ${expected}, got ${actual}`);
  }
}
