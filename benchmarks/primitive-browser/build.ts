import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { browserEntrySource } from "./run.js";
import { createBrowserFixture } from "./fixture.js";

const fixture = await createBrowserFixture(browserEntrySource());

try {
  const entry = await readFile(join(fixture.outDir, "assets", "bench.js"));
  if (entry.length === 0) {
    throw new Error("primitive browser fixture build emitted an empty mixed-framework entry");
  }
  console.log(
    `Primitive browser fixture build passed (mixed-framework entry ${entry.length} raw bytes, ${fixture.entryGzipBytes} gzip bytes; emitted JavaScript ${fixture.emittedJavaScriptGzipBytes} gzip bytes).`,
  );
} finally {
  await rm(fixture.rootDir, { force: true, recursive: true });
}
