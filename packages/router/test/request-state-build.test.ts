import { AsyncLocalStorage } from "node:async_hooks";
import { installRequestStateStorage, type RequestStateScope } from "@reckona/mreact-reactive-core";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Miniflare } from "miniflare";
import { expect, test } from "vitest";
import { buildApp, packageCloudflarePagesArtifact } from "../src/build.js";
import { createBuiltRequestRuntime } from "../src/serve.js";

for (const [target, nativeStorage] of [
  ["node", true],
  ["cloudflare", true],
  ["cloudflare", false],
] as const) {
  for (const streaming of [false, true]) {
    test(`isolates module state across successful and null loaders in a reused ${target} artifact (native=${nativeStorage}, stream=${streaming})`, async () => {
      const rootDir = await mkdtemp(join(tmpdir(), `mreact-request-state-${target}-`));
      let worker: Miniflare | undefined;
      try {
        installRequestStateStorage(
          nativeStorage ? new AsyncLocalStorage<RequestStateScope>() : undefined,
        );
        const appDir = join(rootDir, "app");
        const outDir = join(rootDir, ".mreact");
        await mkdir(appDir, { recursive: true });
        await mkdir(join(rootDir, "lib"));
        await writeFile(
          join(rootDir, "package.json"),
          JSON.stringify({ type: "module", dependencies: {} }),
        );
        await writeFile(
          join(rootDir, "lib/state.ts"),
          `
import { cell, computed, requestState } from "@reckona/mreact-reactive-core";
export const moduleId = Math.random().toString(36).slice(2);
export const useState = requestState(() => {
  const name = cell("empty");
  return { name, label: computed(() => name.get().toUpperCase()), urls: [] as string[], loaderName: "empty-loader" };
});
`,
        );
        await writeFile(
          join(appDir, "page.tsx"),
          `
import { useState, moduleId } from "../lib/state";
export const stream = ${streaming};
export function loader({ request }: { request: Request }) {
  const name = request.headers.get("x-user");
  if (useState().name.get() !== "empty") throw new Error("loader state leaked");
  useState().loaderName = name ?? "empty-loader";
  return name;
}
export default function Page({ data }: { data: string | null }) {
  const state = useState();
  if (data !== null) {
    state.name.set(data);
    state.urls.push("signed-url-" + data);
  }
  return <main data-module={moduleId}><h1>{state.label.get()}</h1><aside>{state.loaderName}</aside><p>{state.urls.join(",")}</p><span>{JSON.stringify(data)}</span>${streaming ? "<Await value={Promise.resolve(null)} placeholder={<i>pending</i>}>{() => <strong>{useState().label.get()}</strong>}</Await>" : ""}</main>;
}
`,
        );
        await buildApp({
          projectRoot: rootDir,
          routesDir: "app",
          allowedSourceDirs: ["app", "lib"],
          outDir,
          targets: [target],
        });
        let render: (request: Request) => Promise<Response>;
        if (target === "node") {
          const runtime = await createBuiltRequestRuntime({ outDir });
          render = (request) => runtime.render(request);
        } else {
          const pagesDir = join(rootDir, "pages");
          await packageCloudflarePagesArtifact({ fromDir: outDir, outDir: pagesDir });
          worker = new Miniflare({
            compatibilityDate: "2026-06-01",
            compatibilityFlags: nativeStorage ? ["nodejs_compat"] : [],
            modules: true,
            modulesRoot: pagesDir,
            scriptPath: join(pagesDir, "_worker.js"),
            port: 0,
            inspectorPort: 0,
          });
          render = async (request) => {
            const response = await worker!.dispatchFetch(request.url, { headers: Object.fromEntries(request.headers) });
            return new Response(await response.arrayBuffer(), {
              status: response.status,
              headers: Object.fromEntries(response.headers),
            });
          };
        }
        const html: string[] = [];
        for (const user of ["alice", null, "bob"]) {
          const response = await render(
            new Request("https://app.test/", { headers: user === null ? {} : { "x-user": user } }),
          );
          const text = await response.text();
          if (!nativeStorage) {
            expect(response.status).toBe(500);
            expect(text).not.toContain("alice");
            expect(text).not.toContain("signed-url");
            continue;
          }
          expect(response.status, text).toBe(200);
          html.push(text);
        }
        if (!nativeStorage) return;
        expect(html[0]).toContain("ALICE");
        expect(html[0]).toContain("signed-url-alice");
        expect(html[1]).toContain("<aside>empty-loader</aside>");
        expect(html[1]).toContain("EMPTY");
        expect(html[1]).toContain("null");
        expect(html[1]).not.toContain("alice");
        expect(html[1]).not.toContain("ALICE");
        expect(html[2]).toContain("BOB");
        expect(html[2]).not.toContain("alice");
        const moduleIds = html.map((value) => value.match(/data-module="([^"]+)"/)?.[1]);
        expect(moduleIds[0]).toBeTruthy();
        expect(new Set(moduleIds).size).toBe(1);
      } finally {
        await worker?.dispose();
        installRequestStateStorage(new AsyncLocalStorage<RequestStateScope>());
        await rm(rootDir, { recursive: true, force: true });
      }
    });
  }
}
