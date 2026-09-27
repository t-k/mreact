import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

import { buildApp } from "../src/build.js";
import { buildClientRouteEntrySource, collectClientRouteReferences } from "../src/client.js";

const policy = { fetch: "idle", activate: "interaction" } as const;
const counterSource = `"use client";
import { useState } from "@reckona/mreact-compat";
export function Counter() {
  const [count, setCount] = useState(0);
  return <button type="button" onClick={() => setCount(count + 1)}>Count: {count}</button>;
}`;
const pageSource = `import { Counter } from "./Counter.compat";
export default function Page() { return <main><Counter /><p>Static sibling</p></main>; }`;

async function fixture() {
  const appDir = await mkdtemp(join(tmpdir(), "mreact-boundary-lazy-contract-"));
  const filename = join(appDir, "page.tsx");
  await writeFile(join(appDir, "Counter.compat.tsx"), counterSource);
  await writeFile(filename, pageSource);
  return { appDir, filename, outDir: join(appDir, ".mreact") };
}

async function onlyKnownGap(message: string, verify: () => Promise<void>): Promise<void> {
  try {
    await verify();
  } catch (error) {
    if (error instanceof Error && error.message === message) {
      throw error;
    }
  }
}

// These are executable acceptance contracts for the proposed opt-in API. They remain expected
// failures until the route scheduler, chunk mapping, and browser interaction tests are complete.
// Remove test.fails when implementation lands; only the named current gap may count as expected.
test.fails("an idle/interaction compat reference is absent from route entry static imports", async () => {
  await onlyKnownGap("BOUNDARY_LAZY_STATIC_REFERENCE_IMPORT", async () => {
    const { appDir, filename } = await fixture();
    try {
      const references = await collectClientRouteReferences({ appDir, code: pageSource, filename });
      const entry = await buildClientRouteEntrySource({
        code: pageSource,
        clientBoundaryImports: references.clientBoundaryImports,
        clientReferenceImports: references.clientReferenceImports,
        clientReferenceManifest: references.clientReferenceManifest,
        clientBoundaryPolicies: { Counter: policy },
        filename,
        routePath: "/",
      } as Parameters<typeof buildClientRouteEntrySource>[0]);

      const staticImports = entry.code.split("\n").filter((line) => line.startsWith("import "));
      if (staticImports.some((line) => line.includes("Counter.compat"))) {
        throw new Error("BOUNDARY_LAZY_STATIC_REFERENCE_IMPORT");
      }
      expect(staticImports.filter((line) => line.includes("@reckona/mreact-compat"))).toEqual([]);
      expect(entry.code).toMatch(/import\s*\(/);
    } finally {
      await rm(appDir, { recursive: true, force: true });
    }
  });
});

test.fails("a built idle reference is reachable only through a dynamic chunk", async () => {
  await onlyKnownGap("BOUNDARY_LAZY_DYNAMIC_CHUNK_MISSING", async () => {
    const { appDir, outDir } = await fixture();
    try {
      await mkdir(outDir, { recursive: true });
      await buildApp({
        appDir,
        outDir,
        clientBoundaryPolicies: { "/": { Counter: policy } },
      } as Parameters<typeof buildApp>[0]);
      const manifest = JSON.parse(
        await readFile(join(outDir, "client", "manifest.json"), "utf8"),
      ) as {
        chunks: Array<{ file: string; imports?: string[]; dynamicImports?: string[] }>;
        routes: Array<{ path: string; script?: string; modulePreloads?: string[] }>;
      };
      const route = manifest.routes.find((entry) => entry.path === "/");
      expect(route?.script).toBeDefined();
      const chunks = new Map(manifest.chunks.map((chunk) => [chunk.file, chunk]));
      const staticFiles = new Set([route!.script!, ...(route?.modulePreloads ?? [])]);
      const dynamicFiles = new Set<string>();
      for (const file of staticFiles) {
        for (const dynamicImport of chunks.get(file)?.dynamicImports ?? []) {
          dynamicFiles.add(dynamicImport);
        }
      }
      if (dynamicFiles.size === 0) {
        throw new Error("BOUNDARY_LAZY_DYNAMIC_CHUNK_MISSING");
      }
      const containsCounter = async (file: string) =>
        (await readFile(join(outDir, "client", file), "utf8")).includes("Count:");
      expect(
        (await Promise.all([...staticFiles].map(containsCounter))).every((value) => !value),
      ).toBe(true);
      expect((await Promise.all([...dynamicFiles].map(containsCounter))).some(Boolean)).toBe(true);
    } finally {
      await rm(appDir, { recursive: true, force: true });
    }
  });
});

test.fails("an unknown boundary policy reference fails the production build", async () => {
  await onlyKnownGap("BOUNDARY_LAZY_UNKNOWN_REFERENCE_ACCEPTED", async () => {
    const { appDir, outDir } = await fixture();
    try {
      await buildApp({
        appDir,
        outDir,
        clientBoundaryPolicies: { "/": { Missing: policy } },
      } as Parameters<typeof buildApp>[0]);
      throw new Error("BOUNDARY_LAZY_UNKNOWN_REFERENCE_ACCEPTED");
    } finally {
      await rm(appDir, { recursive: true, force: true });
    }
  });
});
