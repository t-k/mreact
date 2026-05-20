import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface CreateDatedResultsDirOptions {
  resultsRoot?: string | undefined;
}

export async function createDatedResultsDir(
  date = new Date(),
  options: CreateDatedResultsDirOptions = {},
): Promise<string> {
  const day = date.toISOString().slice(0, 10);
  const dayDir = join(options.resultsRoot ?? join("benchmarks", "results"), day);

  await mkdir(dayDir, { recursive: true });

  for (let index = 1; index <= 999; index += 1) {
    const runDir = join(dayDir, String(index).padStart(3, "0"));

    try {
      await mkdir(runDir);
      return runDir;
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
    }
  }

  throw new Error(`No benchmark result run slots remain for ${day}`);
}

function isAlreadyExistsError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "EEXIST"
  );
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value, null, 2);
  if (json === undefined) {
    throw new Error("Value must be JSON serializable");
  }

  await writeFile(path, `${json}\n`);
}

export async function writeTextFile(path: string, value: string): Promise<void> {
  await writeFile(path, value.endsWith("\n") ? value : `${value}\n`);
}
