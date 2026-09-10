import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  installLifecycleDiagnostics,
  notifyMeasurementsComplete,
  registerDetachedProcess,
} from "../lifecycle-protocol.js";

const mode = process.argv[2];
const directory = process.env.MREACT_BENCHMARK_RESULTS_DIR!;
process.title = "mreact-lifecycle-fixture-worker";
setTimeout(() => process.exit(99), 10_000).unref();
await writeFile(join(directory, "worker-pid.json"), String(process.pid));
installLifecycleDiagnostics();
await writeFile(join(directory, "measurements.json"), "[123]");
if (mode === "detached" || mode === "early-detached" || mode === "registered-exit") {
  const child = spawn(
    process.execPath,
    [
      "-e",
      "process.title = 'mreact-lifecycle-fixture-child'; setTimeout(() => process.exit(99), 10000).unref(); setInterval(() => {}, 1000)",
    ],
    {
      detached: true,
      stdio: "ignore",
    },
  );
  if (mode !== "early-detached") await registerDetachedProcess(child, "test server");
  if (mode === "registered-exit") child.unref();
  await writeFile(join(directory, "child-pid.json"), String(child.pid));
  // Keep the owner alive until its deliberately leaked child is reaped.
} else if (mode === "invalid-pid") {
  process.send?.({ type: "router:owned-group", pid: process.ppid, owner: "not owned" });
} else if (mode === "timer" || mode === "ignore-term") {
  if (mode === "ignore-term")
    process.on("SIGTERM", () => {
      let contents = '"missing"';
      try {
        contents = readFileSync(join(directory, "router.process.json"), "utf8");
      } catch {}
      writeFileSync(join(directory, "termination-observed.json"), contents);
    });
  setInterval(() => {}, 1000);
} else if (mode === "failed") {
  process.exitCode = 1;
}
if (mode !== "early-detached") await notifyMeasurementsComplete();
