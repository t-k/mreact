import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { browserEntrySource } from "./run.js";
import { createBrowserFixture } from "./fixture.js";

const fixture = await createBrowserFixture(browserEntrySource());

try {
  const bundle = await readFile(join(fixture.outDir, "assets", "bench.js"));
  if (bundle.length === 0) {
    throw new Error("primitive browser fixture build emitted an empty bundle");
  }
  console.log(`Primitive browser fixture build passed (${bundle.length} bytes).`);
} finally {
  await rm(fixture.rootDir, { force: true, recursive: true });
}
