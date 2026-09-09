import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { superviseRouterBenchmark } from "./process-supervisor.js";

const fixture = fileURLToPath(new URL("./test-fixtures/lifecycle-worker.ts", import.meta.url));
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe.skipIf(process.platform === "win32")("router benchmark process supervisor", () => {
  it("fails before spawning a worker when process observation is unavailable", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mreact-no-ps-"));
    const originalPath = process.env.PATH;
    try {
      process.env.PATH = directory;
      await expect(
        superviseRouterBenchmark({ entry: fixture, args: ["timer"], directory }),
      ).rejects.toThrow();
      expect(
        JSON.parse(await readFile(join(directory, "router.process.json"), "utf8")),
      ).toMatchObject({ status: "failed", phase: "preflight" });
      await expect(readFile(join(directory, "measurements.json"), "utf8")).rejects.toThrow();
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("still reaps its direct worker and records failure if ps disappears during a run", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mreact-lost-ps-"));
    const originalPath = process.env.PATH;
    let outcome: Awaited<ReturnType<typeof superviseRouterBenchmark>> | undefined;
    const completion = superviseRouterBenchmark({
      entry: fixture,
      args: ["timer"],
      directory,
      shutdownTimeoutMs: 500,
      runTimeoutMs: 3_000,
      terminateGraceMs: 200,
      diagnosticGraceMs: 50,
    });
    try {
      await expect
        .poll(async () => readFile(join(directory, "measurements.json"), "utf8"))
        .toBe("[123]");
      process.env.PATH = directory;
      outcome = await completion;
      expect(outcome.status).toBe("failed");
      expect(outcome.observationErrors.length).toBeGreaterThan(0);
      expect(alive(outcome.workerPid)).toBe(false);
      expect(
        JSON.parse(await readFile(join(directory, "router.process.json"), "utf8")),
      ).toMatchObject({ status: "failed" });
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
      await completion;
      await rm(directory, { recursive: true, force: true });
    }
  }, 10_000);

  it.each([
    "normal",
    "failed",
    "timer",
    "ignore-term",
    "detached",
    "early-detached",
    "registered-exit",
    "invalid-pid",
  ])(
    "records %s worker termination without leaving owned processes",
    async (mode) => {
      const directory = await mkdtemp(join(tmpdir(), "mreact-lifecycle-test-"));
      try {
        const result = await superviseRouterBenchmark({
          entry: fixture,
          args: [mode],
          directory,
          shutdownTimeoutMs: 250,
          runTimeoutMs: 1_500,
          terminateGraceMs: 100,
          diagnosticGraceMs: 100,
          env: { ...process.env, LIFECYCLE_TEST_SECRET: "must-not-appear-in-diagnostics" },
        });
        expect(result.status).toBe(mode === "normal" ? "completed" : "failed");
        expect(result.forced).toBe(
          ["timer", "ignore-term", "detached", "early-detached", "registered-exit"].includes(mode),
        );
        expect(alive(result.workerPid)).toBe(false);
        for (const pid of result.ownedGroups) expect(alive(pid)).toBe(false);
        const stored = await readFile(join(directory, "router.process.json"), "utf8");
        expect(JSON.parse(stored)).toEqual(result);
        expect(stored).not.toContain("must-not-appear-in-diagnostics");
        expect(stored).not.toContain("environmentVariables");
        expect(result.ownedGroups).not.toContain(process.pid);
        expect(await readFile(join(directory, "measurements.json"), "utf8")).toBe("[123]");
        if (mode === "timer" || mode === "ignore-term")
          expect(result.diagnostics?.resources).toContain("Timeout");
        if (mode === "ignore-term") {
          expect(result.signals).toContain("SIGKILL");
          expect(
            JSON.parse(await readFile(join(directory, "termination-observed.json"), "utf8")),
          ).toMatchObject({
            status: "terminating",
            diagnostics: { resources: expect.arrayContaining(["Timeout"]) },
          });
        }
        if (mode === "failed") expect(result.exitCode).toBe(1);
        if (mode === "detached")
          expect(result.owners).toEqual(
            expect.arrayContaining([expect.objectContaining({ owner: "test server" })]),
          );
        if (mode === "invalid-pid") expect(result.unverifiedGroups).toContain(process.pid);
        if (mode === "early-detached" || mode === "registered-exit") {
          const pid = Number(await readFile(join(directory, "child-pid.json"), "utf8"));
          expect(result.ownedGroups).toContain(pid);
          expect(alive(pid)).toBe(false);
        }
      } finally {
        for (const kind of ["child", "worker"])
          try {
            const pid = Number(await readFile(join(directory, `${kind}-pid.json`), "utf8"));
            if (Number.isSafeInteger(pid) && pid > 1 && alive(pid)) {
              const identity = execFileSync("ps", ["-p", String(pid), "-o", "comm=,args="], {
                encoding: "utf8",
              });
              if (identity.includes(`mreact-lifecycle-fixture-${kind}`)) {
                process.kill(pid, "SIGKILL");
                await expect.poll(() => alive(pid)).toBe(false);
              }
            }
          } catch {}
        await rm(directory, { recursive: true, force: true });
      }
    },
    15_000,
  );
});
