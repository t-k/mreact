import { describe, expect, it } from "vitest";
import { nextAppRouterAdapter } from "./next-app-router.js";
import { svelteKitAdapter } from "./svelte-kit.js";
import { measureHttpTrials } from "../http-trials.js";

describe("production HTTP server PID integration", () => {
  it
    .runIf(process.env["MREACT_ROUTER_HTTP_INTEGRATION"] === "1")
    .each([nextAppRouterAdapter, svelteKitAdapter])(
    "serves and closes $name from its actual server PID",
    async (adapter) => {
      let pid: number | undefined;
      try {
        const target = await adapter.getHttpTarget!();
        pid = target.serverPid;
        const [trial] = await measureHttpTrials(target, {
          profile: "burst",
          totalRequests: 5,
          concurrency: 2,
          windows: 1,
        });
        expect(trial?.status, trial?.error).toBe("completed");
        expect(pid).not.toBe(process.pid);
        expect(trial?.generatorPid).not.toBe(pid);
        expect(trial?.rssBeforeBytes).toBeGreaterThan(0);
      } finally {
        await adapter.teardown?.();
      }
      expect(() => process.kill(pid!, 0)).toThrow();
    },
    120_000,
  );
});
