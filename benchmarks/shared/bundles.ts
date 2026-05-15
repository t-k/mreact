import { gzipSync } from "node:zlib";
import { build } from "esbuild";

export interface BundleMeasurement {
  rawBytes: number;
  minifiedBytes: number;
  gzipBytes: number;
}

export async function measureBrowserBundle(
  entryPoint: string,
): Promise<BundleMeasurement> {
  const raw = await bundle(entryPoint, false);
  const minified = await bundle(entryPoint, true);

  return {
    rawBytes: Buffer.byteLength(raw, "utf8"),
    minifiedBytes: Buffer.byteLength(minified, "utf8"),
    gzipBytes: gzipSync(minified).byteLength,
  };
}

async function bundle(entryPoint: string, minify: boolean): Promise<string> {
  const result = await build({
    bundle: true,
    entryPoints: [entryPoint],
    format: "esm",
    minify,
    platform: "browser",
    treeShaking: true,
    write: false,
  });

  return result.outputFiles[0]?.text ?? "";
}
