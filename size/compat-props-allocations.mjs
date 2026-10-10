import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function saveAllocationProfile({ output, kind, trial, profile }) {
  const file = `${kind}-trial-${trial}-allocations.json`;
  await writeFile(join(output, file), JSON.stringify(profile));
  return file;
}
