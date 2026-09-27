import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { browserEntrySource } from "./run.js";
import { createBrowserFixture } from "./fixture.js";
import { primitiveBrowserFrameworks } from "./cases.js";

for (const framework of primitiveBrowserFrameworks) {
  if (framework === "marko") continue;
  const fixture = await createBrowserFixture(browserEntrySource(framework));
  try {
    const entry = await readFile(join(fixture.outDir, "assets", "bench.js"));
    if (entry.length === 0) {
      throw new Error(`primitive browser fixture build emitted an empty ${framework} entry`);
    }
    console.log(
      `Primitive browser ${framework} fixture build passed (${entry.length} raw bytes, ${fixture.entryGzipBytes} entry gzip bytes; emitted JavaScript ${fixture.emittedJavaScriptGzipBytes} gzip bytes).`,
    );
  } finally {
    await rm(fixture.rootDir, { force: true, recursive: true });
  }
}
