import { gzipSync } from "node:zlib";
import { dirname } from "node:path";
import { build as viteBuild } from "vite";

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
  const result = await viteBuild({
    configFile: false,
    logLevel: "silent",
    publicDir: false,
    root: dirname(entryPoint),
    build: {
      emptyOutDir: false,
      lib: {
        entry: entryPoint,
        fileName: () => "bundle.js",
        formats: ["es"],
      },
      minify,
      target: "es2022",
      write: false,
      rolldownOptions: {
        output: {
          codeSplitting: false,
        },
      },
    },
  });
  const output = Array.isArray(result) ? result[0] : result;
  const outputFile = output.output.find((item) => item.type === "chunk");

  if (!outputFile) {
    throw new Error(`Vite/Rolldown produced no output for ${entryPoint}`);
  }

  return outputFile.code;
}
