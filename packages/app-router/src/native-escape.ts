import { createRequire } from "node:module";
import { join } from "node:path";

interface NativeEscapeModule {
  escapeHtmlBatch?: (values: string[]) => string[];
}

const require = createRequire(join(process.cwd(), "package.json"));
let nativeModule: NativeEscapeModule | false | undefined;

export function escapeHtmlBatch(values: readonly unknown[]): string[] {
  const strings = values.map((value) => String(value ?? ""));
  const native = loadNativeEscapeModule();

  return native?.escapeHtmlBatch?.(strings) ?? strings.map(escapeHtml);
}

function loadNativeEscapeModule(): NativeEscapeModule | undefined {
  if (nativeModule === undefined) {
    try {
      nativeModule = require("@modular-react/app-router-native") as NativeEscapeModule;
    } catch {
      nativeModule = false;
    }
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
