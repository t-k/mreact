import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { saveRouterBenchmarkRun } from "./run-output.js";
import type { BenchmarkEnvironment } from "../shared/types.js";

const environment: BenchmarkEnvironment = {
  date: "2026-09-09",
  gitCommit: "test",
  nodeVersion: process.version,
  nodeEnv: "test",
  pnpmVersion: "test",
  platform: process.platform,
  arch: process.arch,
  ci: false,
  cpuModel: "test",
  cpuCount: 1,
  totalMemoryBytes: 1,
  packageVersions: {},
};

describe("router benchmark output", () => {
  it("retains measurement and cleanup failure counts when output also fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mreact-run-mixed-failure-"));
    try {
      await mkdir(join(directory, "router.md"));
      const result = await saveRouterBenchmarkRun(
        [
          {
            name: "mreact-app-router",
            version: "test",
            async measureBuildOutputGzipBytes() {
              throw new Error("measure failed");
            },
            async teardown() {
              throw new Error("close failed");
            },
          },
        ],
        directory,
        environment,
        { benchTimeMs: 1, warmupTimeMs: 1 },
      );
      expect(result).toEqual({
        status: "failed",
        measurementFailures: 1,
        cleanupFailures: 1,
        error: expect.stringContaining("EISDIR"),
      });
      expect(
        JSON.parse(await readFile(join(directory, "router.lifecycle.json"), "utf8")),
      ).toMatchObject(result);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("records successful measurements and cleanup as completed", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mreact-run-success-"));
    try {
      const result = await saveRouterBenchmarkRun(
        [
          {
            name: "mreact-app-router",
            version: "test",
            measureBuildOutputGzipBytes: async () => 123,
          },
        ],
        directory,
        environment,
        { benchTimeMs: 1, warmupTimeMs: 1 },
      );
      expect(result).toEqual({ status: "completed", measurementFailures: 0, cleanupFailures: 0 });
      expect(JSON.parse(await readFile(join(directory, "router.lifecycle.json"), "utf8"))).toEqual({
        status: "completed",
        measurementFailures: 0,
        cleanupFailures: 0,
        cleanup: [{ adapter: "mreact-app-router", status: "completed" }],
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("preserves the output failure and still closes adapters when a report path is unwritable", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mreact-run-write-failure-"));
    let closed = false;
    try {
      await mkdir(join(directory, "router.summary.json"));
      const result = await saveRouterBenchmarkRun(
        [
          {
            name: "mreact-app-router",
            version: "test",
            async teardown() {
              closed = true;
            },
          },
        ],
        directory,
        environment,
        { benchTimeMs: 1, warmupTimeMs: 1 },
      );
      expect(result).toEqual({
        status: "failed",
        measurementFailures: 0,
        cleanupFailures: 0,
        error: expect.stringContaining("EISDIR"),
      });
      expect(closed).toBe(true);
      expect(JSON.parse(await readFile(join(directory, "router.lifecycle.json"), "utf8"))).toEqual({
        status: "failed",
        measurementFailures: 0,
        cleanupFailures: 0,
        cleanup: [{ adapter: "mreact-app-router", status: "completed" }],
        error: expect.stringContaining("EISDIR"),
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps setup failures in the measurement rows even when cleanup succeeds", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mreact-run-setup-failure-"));
    let closed = false;
    try {
      const result = await saveRouterBenchmarkRun(
        [
          {
            name: "mreact-app-router",
            version: "test",
            measureBuildOutputGzipBytes: async () => 123,
          },
          {
            name: "marko-run",
            version: "test",
            async setup() {
              throw new Error("setup failure");
            },
            async teardown() {
              closed = true;
            },
          },
        ],
        directory,
        environment,
        { benchTimeMs: 1, warmupTimeMs: 1 },
      );
      expect(result.status).toBe("failed");
      expect(closed).toBe(true);
      const rows = JSON.parse(await readFile(join(directory, "router.summary.json"), "utf8"));
      expect(rows.some((row: { status: string }) => row.status === "failed")).toBe(true);
      expect(rows.some((row: { value: number }) => row.value === 123)).toBe(true);
      expect(result).toMatchObject({
        measurementFailures: rows.filter((row: { status: string }) => row.status === "failed")
          .length,
        cleanupFailures: 0,
      });
      expect(
        JSON.parse(await readFile(join(directory, "router.lifecycle.json"), "utf8")),
      ).toMatchObject({
        status: "failed",
        measurementFailures: result.measurementFailures,
        cleanupFailures: 0,
        cleanup: [
          { adapter: "mreact-app-router", status: "completed" },
          { adapter: "marko-run", status: "completed" },
        ],
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("persists measured rows before teardown and records teardown failure separately", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mreact-run-output-"));
    let savedBeforeCleanup = false;
    let beforeCleanup: unknown;
    try {
      const result = await saveRouterBenchmarkRun(
        [
          {
            name: "mreact-app-router",
            version: "test",
            measureBuildOutputGzipBytes: async () => 123,
            async teardown() {
              beforeCleanup = JSON.parse(
                await readFile(join(directory, "router.lifecycle.json"), "utf8"),
              );
              const rows = JSON.parse(
                await readFile(join(directory, "router.summary.json"), "utf8"),
              );
              savedBeforeCleanup = rows.some((row: { value: number }) => row.value === 123);
              expect(await readFile(join(directory, "router.md"), "utf8")).toContain(
                "Router Benchmark",
              );
              throw new Error("fixture close failed");
            },
          },
          { name: "marko-run", version: "test" },
        ],
        directory,
        environment,
        { benchTimeMs: 1, warmupTimeMs: 1 },
      );
      expect(savedBeforeCleanup).toBe(true);
      expect(beforeCleanup).toEqual({ status: "cleaning", cleanup: [] });
      expect(result.status).toBe("failed");
      expect(result).toMatchObject({ measurementFailures: 0, cleanupFailures: 1 });
      const lifecycle = JSON.parse(
        await readFile(join(directory, "router.lifecycle.json"), "utf8"),
      );
      expect(lifecycle).toMatchObject({
        status: "failed",
        measurementFailures: 0,
        cleanupFailures: 1,
        cleanup: [
          { adapter: "mreact-app-router", status: "failed", error: "fixture close failed" },
          { adapter: "marko-run", status: "completed" },
        ],
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
