import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildApp } from "../packages/router/dist/build.js";
import { startServer } from "../packages/router/dist/serve.js";
import { measureBrowserDelivery, type BrowserDeliveryManifest } from "./delivery.js";
import { materializeClientDeliveryFixture } from "./fixtures.js";
import { signedCounterFixtures } from "./signed-counter-fixtures.js";

process.env.NODE_ENV = "production";
const output = resolve(
  process.env.MREACT_BENCHMARK_RESULTS_DIR ?? "test-results/signed-counter-delivery",
  new Date().toISOString().replaceAll(/[:.]/g, "-"),
);
await mkdir(output, { recursive: true });
const root = await mkdtemp(join(tmpdir(), "mreact-signed-delivery-"));
const fixtures = [];
try {
  for (const fixture of signedCounterFixtures) {
    const project = await materializeClientDeliveryFixture(fixture, root);
    await buildApp(project);
    const clientDir = join(project.outDir, "client");
    const manifest = JSON.parse(
      await readFile(join(clientDir, "manifest.json"), "utf8"),
    ) as BrowserDeliveryManifest;
    const server = await startServer({ outDir: project.outDir, port: 0 });
    try {
      const response = await fetch(server.url);
      if (!response.ok) throw new Error("SSR failed");
      const html = await response.text();
      if (!html.includes(">-1</button>")) throw new Error("Incorrect signed counter HTML");
      const delivery = await measureBrowserDelivery({
        clientDir,
        manifest,
        initialPath: "/",
        initialIncludesNavigationRuntime: true,
        html: { source: html },
      });
      fixtures.push({ name: fixture.name, delivery });
      await writeFile(join(output, `${fixture.name}.html`), html);
    } finally {
      await server.close();
    }
  }
  await writeFile(
    join(output, "signed-counter-delivery.json"),
    JSON.stringify(
      { commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), fixtures },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        output,
        fixtures: fixtures.map(({ name, delivery }) => ({ name, initial: delivery.initial })),
      },
      null,
      2,
    ),
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
