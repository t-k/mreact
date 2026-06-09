import { createRequire } from "node:module";
import { nativeModulePackageCandidates } from "./native-route-matcher.js";
import { escapeHtmlAttribute as escapeHtml } from "@reckona/mreact-shared/html-escape";

interface NativeEscapeModule {
  escapeHtmlBatch?: (values: string[]) => string[];
}

let nativeModule: NativeEscapeModule | false | undefined;
let nativeRequire: ReturnType<typeof createRequire> | false | undefined;

/**
 * Escapes a batch of values as HTML text using the native helper when available.
 */
export function escapeHtmlBatch(values: readonly unknown[]): string[] {
  const strings = values.map((value) => String(value ?? ""));
  const native = loadNativeEscapeModule();

  return native?.escapeHtmlBatch?.(strings) ?? strings.map(escapeHtml);
}

function loadNativeEscapeModule(): NativeEscapeModule | undefined {
  if (nativeModule === undefined) {
    const require = nativePackageRequire();

    if (require === undefined) {
      nativeModule = false;
      return undefined;
    }

    for (const candidate of nativeModulePackageCandidates(process.platform, process.arch)) {
      try {
        nativeModule = require(candidate) as NativeEscapeModule;
        break;
      } catch {
        // Native package is optional. JS escaping remains the portable fallback.
      }
    }
    nativeModule ??= false;
  }

  return nativeModule === false ? undefined : nativeModule;
}

function nativePackageRequire(): ReturnType<typeof createRequire> | undefined {
  if (nativeRequire === undefined) {
    try {
      nativeRequire =
        new URL(import.meta.url).protocol === "file:" ? createRequire(import.meta.url) : false;
    } catch {
      nativeRequire = false;
    }
  }

  return nativeRequire === false ? undefined : nativeRequire;
}
