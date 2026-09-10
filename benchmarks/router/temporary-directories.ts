import { mkdtemp, rm } from "node:fs/promises";
import { runCleanupTasks } from "./cleanup.js";

/** Own directories from allocation, including fixtures that never finish building. */
export function createTemporaryDirectoryOwner() {
  const directories = new Set<string>();
  return {
    async create(prefix: string): Promise<string> {
      const directory = await mkdtemp(prefix);
      directories.add(directory);
      return directory;
    },
    async closeAll(): Promise<void> {
      await runCleanupTasks(
        [...directories].map((directory) => ({
          name: `temporary directory ${directory}`,
          async run() {
            await rm(directory, { recursive: true, force: true });
            directories.delete(directory);
          },
        })),
      );
    },
  };
}
