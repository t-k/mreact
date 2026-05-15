import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function createDatedResultsDir(date = new Date()): Promise<string> {
  const day = date.toISOString().slice(0, 10);
  const dir = join("benchmarks", "results", day);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeTextFile(path: string, value: string): Promise<void> {
  await writeFile(path, value.endsWith("\n") ? value : `${value}\n`);
}
