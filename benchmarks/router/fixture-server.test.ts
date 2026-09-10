import { describe, expect, it } from "vitest";
import { mreactAppRouterAdapter } from "./adapters/mreact-app-router.js";
import { measureHttpTrials } from "./http-trials.js";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../../packages/router/dist/index.js";

describe("production fixture process isolation", () => {
  it("exits when its owner disconnects before server startup finishes", async () => {
    const root = await mkdtemp(join(tmpdir(), "mreact-http-owner-test-"));
    let child: ReturnType<typeof fork> | undefined;
    let exit: Promise<unknown> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const appDir = join(root, "app");
      const outDir = join(root, "out");
      await mkdir(appDir);
      await writeFile(
        join(appDir, "page.tsx"),
        "export default function Page() { return <main>ok</main>; }",
      );
      await buildApp({ appDir, outDir });
      child = fork(
        new URL("./fixture-server-worker.ts", import.meta.url),
        [JSON.stringify({ framework: "mreact", directory: outDir })],
        { execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "ignore", "ipc"] },
      );
      exit = once(child, "exit");
      child.disconnect();
      const outcome = await Promise.race([
        exit.then(() => "exited"),
        new Promise<string>((resolve) => {
          timer = setTimeout(() => resolve("leaked"), 5_000);
        }),
      ]);
      expect(outcome).toBe("exited");
      expect(child.exitCode).not.toBe(0);
    } finally {
      clearTimeout(timer);
      if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await exit;
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
  it("runs mreact's existing cached route in a child and closes it after load", async () => {
    let pid: number | undefined;
    try {
      const target = await mreactAppRouterAdapter.getHttpTarget!();
      pid = target.serverPid;
      expect(pid).not.toBe(process.pid);
      expect(target.url).toContain("/static-page");
      const [trial] = await measureHttpTrials(target, {
        profile: "burst",
        concurrency: 2,
        totalRequests: 5,
        windows: 1,
      });
      expect(trial?.status, trial?.error).toBe("completed");
      expect(trial?.generatorPid).not.toBe(pid);
    } finally {
      await mreactAppRouterAdapter.teardown?.();
    }
    expect(() => process.kill(pid!, 0)).toThrow();
  }, 120_000);
});
