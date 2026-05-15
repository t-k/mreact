import { createRequire } from "node:module";
import { nativeModulePackageCandidates } from "./native-route-matcher.js";

interface NativeEscapeModule {
  escapeHtmlBatch?: (values: string[]) => string[];
}

const require = createRequire(import.meta.url);
let nativeModule: NativeEscapeModule | false | undefined;

export function escapeHtmlBatch(values: readonly unknown[]): string[] {
  const strings = values.map((value) => String(value ?? ""));
  const native = loadNativeEscapeModule();

  return native?.escapeHtmlBatch?.(strings) ?? strings.map(escapeHtml);
}

function loadNativeEscapeModule(): NativeEscapeModule | undefined {
  if (nativeModule === undefined) {
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}
