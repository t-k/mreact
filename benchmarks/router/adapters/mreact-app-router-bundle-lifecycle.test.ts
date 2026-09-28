import { access } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mreactAppRouterAdapter,
  mreactAppRouterLogEnabledAdapter,
  mreactAppRouterReactCompatAdapter,
} from "./mreact-app-router.js";

const reads = vi.hoisted(() => ({
  started: () => {},
  resume: Promise.resolve(),
  directory: "",
  removed: [] as string[],
  cleanup: [] as Promise<void>[],
  scripts: new Map<string, Buffer>(),
  error: undefined as Error | undefined,
  alreadyRemoved: false,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original,
    async readFile(...args: Parameters<typeof original.readFile>) {
      const path = String(args[0]);
      if (
        /mreact-app-bench-(?:shared-client|react-compat-client)-/.test(path) &&
        path.includes("/.mreact/client/") &&
        path.endsWith(".js")
      ) {
        reads.directory = path.slice(0, path.indexOf("/.mreact/client/"));
        reads.started();
        await reads.resume;
        await Promise.all(reads.cleanup);
        if (reads.error) {
          if (reads.alreadyRemoved) await original.rm(reads.directory, { recursive: true });
          throw reads.error;
        }
        const code = await original.readFile(...args);
        reads.scripts.set(path, Buffer.from(code));
        return code;
      }
      return original.readFile(...args);
    },
    async rm(...args: Parameters<typeof original.rm>) {
      reads.removed.push(String(args[0]));
      const cleanup = original.rm(...args);
      reads.cleanup.push(cleanup);
      return cleanup;
    },
  };
});

beforeEach(() => {
  reads.directory = "";
  reads.removed = [];
  reads.cleanup = [];
  reads.scripts.clear();
  reads.error = undefined;
  reads.alreadyRemoved = false;
});

const measurements = [
  [
    "native shared routes",
    mreactAppRouterAdapter,
    "measureInteractiveClientBundleSharedRoutesBytes",
  ],
  [
    "logged shared routes",
    mreactAppRouterLogEnabledAdapter,
    "measureInteractiveClientBundleSharedRoutesBytes",
  ],
  [
    "compat shared routes",
    mreactAppRouterReactCompatAdapter,
    "measureInteractiveClientBundleSharedRoutesBytes",
  ],
  [
    "compat minimal bundle",
    mreactAppRouterReactCompatAdapter,
    "measureInteractiveClientBundleMinimalBytes",
  ],
] as const;

describe("mreact client bundle fixture lifetime", () => {
  it.each(measurements)(
    "keeps %s files until all gzip reads finish",
    async (_name, adapter, method) => {
      const started = new Promise<void>((resolve) => {
        reads.started = resolve;
      });
      let resume!: () => void;
      reads.resume = new Promise<void>((resolve) => {
        resume = resolve;
      });
      const measurement = adapter[method]!();
      try {
        await started;
        expect(reads.removed).not.toContain(reads.directory);
        await expect(access(reads.directory)).resolves.toBeUndefined();
        resume();
        const bytes = await measurement;
        expect(bytes).toBeGreaterThan(0);
        expect(bytes).toBe(
          [...reads.scripts.values()].reduce((total, code) => total + gzipSync(code).length, 0),
        );
        expect(reads.removed).toContain(reads.directory);
        await expect(access(reads.directory)).rejects.toMatchObject({ code: "ENOENT" });
      } finally {
        resume();
        await measurement.catch(() => {});
        await adapter.teardown?.();
      }
    },
    20_000,
  );

  it.each(
    [measurements[0], measurements[3]].flatMap(([name, adapter, method]) =>
      [false, true].map((alreadyRemoved) => ({ name, adapter, method, alreadyRemoved })),
    ),
  )(
    "$name preserves read errors after cleanup (already removed: $alreadyRemoved)",
    async ({ adapter, method, alreadyRemoved }) => {
      const started = new Promise<void>((resolve) => {
        reads.started = resolve;
      });
      let resume!: () => void;
      reads.resume = new Promise<void>((resolve) => {
        resume = resolve;
      });
      reads.error = new Error("client bundle read failed");
      reads.alreadyRemoved = alreadyRemoved;
      const measurement = adapter[method]!();
      const rejection = expect(measurement).rejects.toThrow("client bundle read failed");
      try {
        await started;
        expect(reads.removed).not.toContain(reads.directory);
        resume();
        await rejection;
        expect(reads.removed).toContain(reads.directory);
        await expect(access(reads.directory)).rejects.toMatchObject({ code: "ENOENT" });
      } finally {
        resume();
        await rejection;
        await adapter.teardown?.();
      }
    },
    20_000,
  );
});
