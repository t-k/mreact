import { spawn } from "node:child_process";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { measureHttpTrials } from "./http-trials.js";

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
const server = createServer((req, res) => {
  count++;
  if (req.url === '/hang') return;
  res.statusCode = req.url === '/error' ? 503 : 200;
  res.end('ok:' + count);
});
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
