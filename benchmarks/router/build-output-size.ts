import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const measuredExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".txt",
  ".wasm",
]);

export async function measureBuildOutputGzipBytes(directories: readonly string[]): Promise<number> {
  let total = 0;

  for (const directory of directories) {
    total += await measureDirectoryGzipBytes(directory);
  }

  return total;
}

async function measureDirectoryGzipBytes(directory: string): Promise<number> {
  let total = 0;

  try {
    const entries = await readdir(directory, { recursive: true, withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || !hasMeasuredExtension(entry.name)) {
        continue;
      }

      const filePath =
        "parentPath" in entry && typeof (entry as { parentPath?: string }).parentPath === "string"
          ? join((entry as { parentPath: string }).parentPath, entry.name)
          : join(directory, entry.name);
      const code = await readFile(filePath);
      total += gzipSync(code).length;
    }
  } catch {
    // Some frameworks emit one of several known directories depending on version.
  }

  return total;
}

function hasMeasuredExtension(fileName: string): boolean {
  const dotIndex = fileName.lastIndexOf(".");

  if (dotIndex < 0) {
    return false;
  }

  return measuredExtensions.has(fileName.slice(dotIndex));
}
