import { spawn } from "node:child_process";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { measureHttpTrials } from "./http-trials.js";
import { collectHttpRows } from "./runner-http.js";

async function withServer(
  run: (target: {
    url: string;
    serverPid: number;
    requiredText: string;
    workload: Record<string, string>;
  }) => Promise<void>,
) {
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
import { createServer } from 'node:http';
let count = 0;
const retained = [];
const server = createServer((req, res) => {
  count++;
  if (req.url === '/allocate') retained.push(Buffer.alloc(16 * 1024 * 1024, 1));
  if (req.url === '/exit') { res.end('ok:' + count, () => process.exit(0)); return; }
  if (req.url === '/hang') return;
  res.statusCode = req.url === '/error' ? 503 : 200;
  res.end('ok:' + count);
});
process.on('disconnect', () => { server.closeAllConnections(); server.close(); });
server.listen(0, '127.0.0.1', () => process.send({port: server.address().port}));
`,
    ],
    { stdio: ["ignore", "ignore", "inherit", "ipc"] },
  );
  const exited = once(child, "exit");
  try {
    const [{ port }] = (await once(child, "message")) as [{ port: number }];
    await run({
      url: `http://127.0.0.1:${port}/`,
      serverPid: child.pid!,
      requiredText: "ok:",
      workload: { route: "/" },
    });
  } finally {
    child.kill("SIGTERM");
    await exited;
  }
}

describe("isolated HTTP trials", () => {
  it("retains completed HTTP samples if the server exits before the final RSS snapshot", async () => {
    await withServer(async (target) => {
      const [trial] = await measureHttpTrials({ ...target, url: new URL("/exit", target.url).href }, { profile: "burst", totalRequests: 1, concurrency: 1, windows: 1 });
      expect(trial?.status).toBe("failed");
      expect(trial?.requestCount).toBe(1);
      expect(trial?.latenciesMs).toHaveLength(1);
      expect(trial?.rssAfterBytes).toBeUndefined();
    });
  });
  it("samples memory allocated by the server process", async () => {
    await withServer(async (target) => {
      const [trial] = await measureHttpTrials(
        { ...target, url: new URL("/allocate", target.url).href },
        { profile: "burst", totalRequests: 2, concurrency: 1, windows: 1 },
      );
      expect(trial?.status).toBe("completed");
      expect(trial?.rssDeltaBytes).toBeGreaterThan(16 * 1024 * 1024);
    });
  });
  it("does not convert an exited server's missing RSS into zero", async () => {
    await withServer(async (target) => {
      process.kill(target.serverPid, "SIGTERM");
      await expect
        .poll(() => {
          try {
            process.kill(target.serverPid, 0);
            return true;
          } catch {
            return false;
          }
        })
        .toBe(false);
      const [trial] = await measureHttpTrials(target, {
        profile: "burst",
        totalRequests: 1,
        windows: 1,
      });
      expect(trial?.status).toBe("failed");
      expect(trial?.rssBeforeBytes).toBeUndefined();
      expect(trial?.rssDeltaBytes).toBeUndefined();
      expect(() => process.kill(trial!.generatorPid!, 0)).toThrow();
    });
  });
  it("rotates adapters between burst rounds and retains steady ordering", async () => {
    await withServer(async (target) => {
      const calls: string[] = [];
      const adapters = (["mreact-app-router", "marko-run", "next-app-router"] as const).map(
        (name) => ({
          name,
          version: "test",
          async getHttpTarget() {
            calls.push(name);
            return target;
          },
        }),
      );
      const rows = await collectHttpRows(adapters, {
        concurrency: 1,
        totalRequests: 1,
        warmupMs: 0,
        durationMs: 1,
      });
      expect(calls).toEqual([
        "mreact-app-router",
        "marko-run",
        "next-app-router",
        "marko-run",
        "next-app-router",
        "mreact-app-router",
        "next-app-router",
        "mreact-app-router",
        "marko-run",
        "mreact-app-router",
        "marko-run",
        "next-app-router",
      ]);
      expect(rows[5]?.httpTrials?.map((trial) => trial.executionOrder)).toEqual([
        { round: 0, position: 0 },
        { round: 1, position: 0 },
        { round: 2, position: 0 },
      ]);
    });
  });
  it.each(["setup", "response"])(
    "stops retrying a failed burst after %s failure",
    async (failure) => {
      await withServer(async (target) => {
        let calls = 0;
        const rows = await collectHttpRows(
          [
            {
              name: "mreact-app-router",
              version: "test",
              async getHttpTarget() {
                calls++;
                if (failure === "setup") throw new Error("setup failed");
                return { ...target, url: new URL("/error", target.url).href };
              },
            },
          ],
          { concurrency: 1, totalRequests: 1, warmupMs: 0, durationMs: 1 },
        );
        expect(calls).toBe(2);
        expect(rows.every((row) => row.status === "failed")).toBe(true);
        expect(rows[0]?.note).toMatch(/setup failed|HTTP 503/);
      });
    },
  );
  it("runs three bursts and three steady windows once, not once per metric", async () => {
    await withServer(async (target) => {
      let targetCalls = 0;
      const rows = await collectHttpRows(
        [
          {
            name: "mreact-app-router",
            version: "test",
            async getHttpTarget() {
              targetCalls++;
              return target;
            },
          },
        ],
        { concurrency: 1, totalRequests: 2, warmupMs: 10, durationMs: 10 },
      );
      expect(targetCalls).toBe(4);
      expect(rows).toHaveLength(10);
      expect(rows.every((row) => row.status === "completed")).toBe(true);
      for (const row of rows) expect(row.httpTrials).toHaveLength(3);
      expect(
        new Set(rows.flatMap((row) => row.httpTrials!.map((trial) => trial.trialId))).size,
      ).toBe(6);
      expect(rows[0]?.httpTrials?.map((trial) => trial.executionOrder)).toEqual([
        { round: 0, position: 0 },
        { round: 1, position: 0 },
        { round: 2, position: 0 },
      ]);
    });
  });
  it("does not retroactively fail burst results when steady target setup fails", async () => {
    await withServer(async (target) => {
      let calls = 0;
      const rows = await collectHttpRows(
        [
          {
            name: "mreact-app-router",
            version: "test",
            async getHttpTarget() {
              if (++calls === 4) throw new Error("steady setup failed");
              return target;
            },
          },
        ],
        { totalRequests: 1, concurrency: 1 },
      );
      expect(rows.slice(0, 5).every((row) => row.status === "completed")).toBe(true);
      expect(rows.slice(5).every((row) => row.status === "failed")).toBe(true);
    });
  });
  it("derives all metrics from exactly one burst in a distinct load process", async () => {
    await withServer(async (target) => {
      const [trial] = await measureHttpTrials(target, {
        profile: "burst",
        concurrency: 2,
        totalRequests: 5,
        windows: 1,
      });
      expect(trial.status).toBe("completed");
      expect(trial.requestCount).toBe(5);
      expect(trial.latenciesMs).toHaveLength(5);
      expect(trial.generatorPid).not.toBe(process.pid);
      expect(trial.generatorPid).not.toBe(target.serverPid);
      expect(trial.serverPid).toBe(target.serverPid);
      expect(trial.rssDeltaBytes).toBe(trial.rssAfterBytes! - trial.rssBeforeBytes!);
      expect(trial.throughputOps).toBeCloseTo(5_000 / trial.elapsedMs!, 8);
      expect(trial.p50Ms).toBeLessThanOrEqual(trial.p95Ms!);
      expect(trial.p95Ms).toBeLessThanOrEqual(trial.p99Ms!);
      expect(trial.connectionsOpened).toBeLessThanOrEqual(2);
      expect(await (await fetch(target.url)).text()).toBe("ok:6");
      expect(() => process.kill(trial.generatorPid!, 0)).toThrow();
    });
  });

  it("keeps warmed connections across steady windows and excludes warmup samples", async () => {
    await withServer(async (target) => {
      const trials = await measureHttpTrials(target, {
        profile: "steady",
        concurrency: 2,
        warmupMs: 30,
        durationMs: 40,
        windows: 3,
      });
      expect(trials).toHaveLength(3);
      expect(new Set(trials.map((trial) => trial.trialId)).size).toBe(3);
      expect(new Set(trials.map((trial) => trial.generatorPid)).size).toBe(1);
      for (const trial of trials) {
        expect(trial.status).toBe("completed");
        expect(trial.warmupRequests).toBeGreaterThan(0);
        expect(trial.requestCount).toBe(trial.latenciesMs?.length);
        expect(trial.connectionsOpened).toBeLessThanOrEqual(2);
        expect(trial.connectionsOpened! + trial.reusedRequests!).toBe(trial.requestCount);
        expect(trial.elapsedMs).toBeGreaterThanOrEqual(40);
      }
    });
  });

  it.each(["/error", "/hang", "/wrong"])(
    "records failure and closes the generator for %s",
    async (path) => {
      await withServer(async (target) => {
        const [trial] = await measureHttpTrials(
          {
            ...target,
            url: new URL(path, target.url).href,
            requiredText: path === "/wrong" ? "missing" : "ok:",
          },
          { profile: "burst", totalRequests: 1, concurrency: 1, requestTimeoutMs: 50, windows: 1 },
        );
        expect(trial.status).toBe("failed");
        expect(trial.error).toMatch(/HTTP 503|deadline|body/);
        expect(() => process.kill(trial.generatorPid!, 0)).toThrow();
      });
    },
  );

  it("rejects an orchestrator PID as a server before starting load", async () => {
    await expect(
      measureHttpTrials(
        { url: "http://127.0.0.1:1", serverPid: process.pid, requiredText: "ok", workload: {} },
        { profile: "burst" },
      ),
    ).rejects.toThrow(/distinct/);
  });
});
