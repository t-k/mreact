import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { analogAdapter } from "../adapters/analog.js";
import { installLifecycleDiagnostics, notifyMeasurementsComplete } from "../lifecycle-protocol.js";

installLifecycleDiagnostics();
try {
  for (let attempt = 0; attempt < 3; attempt++) {
    const html = await analogAdapter.renderToString!(1000);
    await writeFile(
      join(process.env.MREACT_BENCHMARK_RESULTS_DIR!, `response-${attempt}.html`),
      html,
    );
    assert.equal((html.match(/<span>/g) ?? []).length, 1000);
    assert.ok(html.includes("<span>0</span>"));
    assert.ok(html.includes("<span>999</span>"));
  }
} catch (error) {
  const url = analogAdapter.getServerUrl?.();
  if (url) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      await writeFile(
        join(process.env.MREACT_BENCHMARK_RESULTS_DIR!, "followup-response.html"),
        await response.text(),
      );
    } catch {
      // Preserve the original assertion or rendering error.
    }
  }
  throw error;
} finally {
  await notifyMeasurementsComplete();
  await analogAdapter.teardown?.();
}
