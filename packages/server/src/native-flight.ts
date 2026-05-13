// Native binding loader for the Flight encode/decode hot path
// (issue 081). Mirrors the pattern in
// `packages/app-router/src/native-route-matcher.ts`: try the
// platform-specific prebuilt package first, then fall back to the
// workspace package built locally, then give up silently so the JS
// implementation stays the portable default.
//
// Selection is opt-in via `MR_FLIGHT_NATIVE=1` until benchmarks meet
// the issue 081 acceptance criteria. Once they do, this flips to
// "native by default, opt-out via MR_FLIGHT_NATIVE=0".

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface NativeFlightModule {
  decodeFlightBase64?: (value: string) => Uint8Array;
}

let loadedModule: NativeFlightModule | false | undefined;

export function getNativeFlight(): NativeFlightModule | undefined {
  if (!shouldUseNativeFlight()) {
    return undefined;
  }

  const native = loadNativeFlightModule();
  return native === false ? undefined : native;
}

function shouldUseNativeFlight(): boolean {
  return process.env.MR_FLIGHT_NATIVE === "1";
}

function loadNativeFlightModule(): NativeFlightModule | false {
  if (loadedModule !== undefined) {
    return loadedModule;
  }

  const require = createRequire(import.meta.url);

  for (const candidate of nativeModuleCandidates()) {
    try {
      loadedModule = require(candidate) as NativeFlightModule;
      return loadedModule;
    } catch {
      // Native package is optional. Fall through to the next candidate.
    }
  }

  loadedModule = false;
  return false;
}

function nativeModuleCandidates(): string[] {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const workspaceNativePackage = join(currentDir, "..", "..", "app-router-native");

  return [
    ...nativePlatformPackageCandidates(process.platform, process.arch),
    "@modular-react/app-router-native",
    workspaceNativePackage,
  ];
}

function nativePlatformPackageCandidates(
  platform: NodeJS.Platform,
  arch: string,
): string[] {
  if (platform === "linux" && arch === "x64") {
    return ["@modular-react/app-router-native-linux-x64-gnu"];
  }
  if (platform === "darwin" && arch === "arm64") {
    return ["@modular-react/app-router-native-darwin-arm64"];
  }
  if (platform === "win32" && arch === "x64") {
    return ["@modular-react/app-router-native-win32-x64-msvc"];
  }
  return [];
}
