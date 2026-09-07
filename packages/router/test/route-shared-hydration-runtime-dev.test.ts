import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { startDevServer } from "../src/dev-server.js";

const devServers: Array<{ close(): Promise<void> }> = [];

const interactiveRouteCode = `import { cell } from "@reckona/mreact-reactive-core";

export const clientNavigation = false;

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>{count.get()}</button>;
}`;

// The dev server is kept in its own file: it starts a real Vite server per test, which the
// mutation sandbox cannot afford to run once per mutant.
describe("shared route hydration runtime in dev", () => {
  afterEach(async () => {
    await Promise.all(devServers.splice(0).map((server) => server.close()));
  });

  test("the dev server resolves the shared runtime the unbundled route module imports", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-shared-resume-dev-"));
    await writeFile(join(appDir, "page.tsx"), interactiveRouteCode);
    const server = await startDevServer({ appDir, port: 0 });
    devServers.push(server);

    const moduleResponse = await fetch(`${server.url}/_mreact/client/routes/index.js`);
    const moduleSource = await moduleResponse.text();
    const runtimeSpecifiers = [...moduleSource.matchAll(/from\s+"([^"]+)"/gu)]
      .map((match) => match[1] ?? "")
      .filter((specifier) => specifier.includes("route-hydration-runtime"));

    expect(moduleResponse.status).toBe(200);
    expect(runtimeSpecifiers.length).toBeGreaterThan(0);

    for (const specifier of runtimeSpecifiers) {
      const runtimeResponse = await fetch(new URL(specifier, server.url));

      expect(runtimeResponse.status, specifier).toBe(200);
      expect(runtimeResponse.headers.get("content-type"), specifier).toContain("javascript");
      expect((await runtimeResponse.text()).length, specifier).toBeGreaterThan(0);
    }
  });

});
