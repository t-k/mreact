import { execFile, spawn } from "node:child_process";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { writeJsonFile } from "../shared/results.js";
import type { LifecycleDiagnostics } from "./lifecycle-protocol.js";

const execFileAsync = promisify(execFile);
interface ProcessIdentity {
  pid: number;
  parent: number;
  group: number;
  started: string;
  command: string;
}

export interface RouterProcessOutcome {
  status: "completed" | "failed";
  workerPid: number;
  ownedGroups: number[];
  owners: { pid: number; owner: string }[];
  unverifiedGroups: number[];
  remainingGroups: number[];
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  forced: boolean;
  signals: NodeJS.Signals[];
  reason?: string;
  diagnostics?: LifecycleDiagnostics;
  observationErrors: string[];
}

export async function superviseRouterBenchmark(options: {
  entry: string;
  directory: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  shutdownTimeoutMs?: number;
  runTimeoutMs?: number;
  terminateGraceMs?: number;
  diagnosticGraceMs?: number;
}): Promise<RouterProcessOutcome> {
  if (process.platform === "win32")
    throw new Error("Router benchmark supervision requires POSIX process groups");
  // Fail before starting any resource-owning worker if observation is unavailable.
  try {
    await processSnapshot();
  } catch (error) {
    await writeJsonFile(join(options.directory, "router.process.json"), {
      status: "failed",
      phase: "preflight",
      error: String(error),
    });
    throw error;
  }
  const child = spawn(
    process.execPath,
    ["--import", "tsx", options.entry, ...(options.args ?? [])],
    {
      detached: true,
      env: {
        ...process.env,
        ...options.env,
        MREACT_BENCHMARK_RESULTS_DIR: options.directory,
        MREACT_ROUTER_BENCHMARK_SUPERVISED: "1",
      },
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    },
  );
  const workerPid = child.pid;
  if (workerPid === undefined) {
    await new Promise<void>((_resolve, reject) => child.once("error", reject));
    throw new Error("Benchmark worker did not expose a PID");
  }
  const groups = new Map<number, ProcessIdentity | undefined>([[workerPid, undefined]]);
  const owners = new Map<number, string>([[workerPid, "router benchmark worker"]]);
  const unverifiedGroups = new Set<number>();
  const observationErrors: string[] = [];
  const exited = Promise.withResolvers<void>();
  const interrupted = Promise.withResolvers<string>();
  let measurementsComplete = false;
  let diagnostics: LifecycleDiagnostics | undefined;
  let shutdownTimer: ReturnType<typeof setTimeout> | undefined;
  let pending = Promise.resolve();
  const totalTimer = setTimeout(
    () => interrupted.resolve("benchmark deadline exceeded"),
    options.runTimeoutMs ?? 2 * 60 * 60 * 1000,
  );
  const onSignal = () => interrupted.resolve("supervisor interrupted");
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  child.once("exit", () => exited.resolve());
  child.once("error", (error) => interrupted.resolve(`worker error: ${error.message}`));
  child.on("message", (message: unknown) => {
    if (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      message.type === "router:owned-group" &&
      "pid" in message &&
      Number.isSafeInteger(message.pid) &&
      Number(message.pid) > 1
    )
      unverifiedGroups.add(Number(message.pid));
    pending = pending
      .then(async () => {
        if (typeof message !== "object" || message === null || !("type" in message)) return;
        if (
          message.type === "router:owned-group" &&
          "pid" in message &&
          Number.isSafeInteger(message.pid) &&
          Number(message.pid) > 1
        ) {
          const identity = (await processSnapshot()).find((entry) => entry.pid === message.pid);
          // Only a direct worker child that leads its own group may register a detached group.
          if (identity?.parent === workerPid && identity.group === identity.pid) {
            groups.set(identity.pid, identity);
            unverifiedGroups.delete(identity.pid);
            owners.set(
              identity.pid,
              "owner" in message && typeof message.owner === "string"
                ? message.owner.slice(0, 200)
                : "detached worker child",
            );
          }
          if (child.connected)
            child.send(
              {
                type: "router:owned-group-ack",
                pid: message.pid,
                accepted: !unverifiedGroups.has(Number(message.pid)),
              },
              () => {},
            );
        } else if (message.type === "router:measurements-complete" && !measurementsComplete) {
          measurementsComplete = true;
          shutdownTimer = setTimeout(
            () => interrupted.resolve("shutdown deadline exceeded"),
            options.shutdownTimeoutMs ?? 30_000,
          );
          const snapshot = await processSnapshot();
          discoverGroups(snapshot);
          if (child.connected) child.send({ type: "router:measurements-ack" }, () => {});
        } else if (message.type === "router:diagnostics" && "diagnostics" in message) {
          diagnostics = sanitizeDiagnostics(message.diagnostics);
        }
      })
      .catch((error: unknown) =>
        interrupted.resolve(`lifecycle observation failed: ${String(error)}`),
      );
  });
  let reason: string | undefined;
  let forced = false;
  const signals: NodeJS.Signals[] = [];
  let remainingGroups: number[] = [];
  function discoverGroups(snapshot: ProcessIdentity[]): void {
    const descendants = new Set<number>();
    const worker = snapshot.find((entry) => entry.pid === workerPid);
    if (
      worker &&
      child.exitCode === null &&
      child.signalCode === null &&
      worker.parent === process.pid &&
      worker.group === workerPid
    ) {
      if (!groups.get(workerPid)) groups.set(workerPid, worker);
      descendants.add(workerPid);
    }
    for (const [pid, original] of groups) {
      if (
        original &&
        snapshot.some((entry) => entry.pid === pid && entry.started === original.started)
      )
        descendants.add(pid);
    }
    let previousSize = -1;
    while (previousSize !== descendants.size) {
      previousSize = descendants.size;
      for (const entry of snapshot) if (descendants.has(entry.parent)) descendants.add(entry.pid);
    }
    for (const entry of snapshot) {
      if (descendants.has(entry.pid) && entry.group === entry.pid && !groups.has(entry.pid)) {
        groups.set(entry.pid, entry);
        owners.set(entry.pid, "worker descendant");
      }
    }
  }
  async function observe(): Promise<ProcessIdentity[] | undefined> {
    try {
      return await processSnapshot();
    } catch (error) {
      observationErrors.push(String(error));
      return undefined;
    }
  }
  try {
    const initial = await observe();
    if (initial) discoverGroups(initial);
    else interrupted.resolve("initial process observation failed");
    const first = await Promise.race([exited.promise.then(() => undefined), interrupted.promise]);
    await pending;
    reason = first;
    remainingGroups = [...groups.keys()].filter(groupExists);
    if (reason === undefined && remainingGroups.length !== 0)
      reason = "owned processes remain after worker exit";
    if (reason !== undefined) {
      forced = true;
      const beforeStop = await observe();
      if (beforeStop) discoverGroups(beforeStop);
      if (child.connected) {
        child.send({ type: "router:diagnose" }, () => {});
        await delay(options.diagnosticGraceMs ?? 250);
        await pending;
      }
      // Keep the diagnosis even if termination or the parent itself subsequently fails.
      try {
        await writeJsonFile(join(options.directory, "router.process.json"), {
          status: "terminating",
          workerPid,
          reason,
          diagnostics,
          owners: [...owners].map(([pid, owner]) => ({ pid, owner })),
          unverifiedGroups: [...unverifiedGroups],
          observationErrors,
        });
      } catch (error) {
        observationErrors.push(`diagnostic persistence failed: ${String(error)}`);
      }
      for (const signal of ["SIGTERM", "SIGKILL"] as const) {
        const snapshot = await observe();
        if (snapshot) discoverGroups(snapshot);
        for (const pid of [...groups.keys()].reverse().filter(groupExists)) {
          const original = groups.get(pid);
          const current = snapshot?.find((entry) => entry.pid === pid);
          if (!snapshot || !original) {
            // Without an identity observation, only the retained live ChildProcess is safe.
            if (pid === workerPid && child.exitCode === null && child.signalCode === null)
              child.kill(signal);
            continue;
          }
          // Never signal a group leader whose PID has been reused since registration.
          if (original && current && original.started !== current.started) continue;
          try {
            process.kill(-pid, signal);
          } catch (error) {
            if (!isMissingProcess(error)) observationErrors.push(`group ${pid}: ${String(error)}`);
          }
        }
        signals.push(signal);
        const deadline = Date.now() + (options.terminateGraceMs ?? 5_000);
        do {
          remainingGroups = [...groups.keys()].filter(groupExists);
          if (remainingGroups.length === 0) break;
          await delay(20);
        } while (Date.now() < deadline);
        if (remainingGroups.length === 0) break;
      }
    }
    if (reason === undefined && unverifiedGroups.size !== 0)
      reason = "unverified process registrations remain; recovery is not confirmed";
    const status =
      reason === undefined && measurementsComplete && child.exitCode === 0 ? "completed" : "failed";
    const result: RouterProcessOutcome = {
      status,
      workerPid,
      ownedGroups: [...groups.keys()],
      owners: [...owners].map(([pid, owner]) => ({ pid, owner })),
      unverifiedGroups: [...unverifiedGroups],
      remainingGroups,
      exitCode: child.exitCode,
      signal: child.signalCode,
      forced,
      signals,
      observationErrors,
      ...(reason === undefined ? {} : { reason }),
      ...(diagnostics === undefined ? {} : { diagnostics }),
    };
    await writeJsonFile(join(options.directory, "router.process.json"), result);
    return result;
  } finally {
    clearTimeout(totalTimer);
    clearTimeout(shutdownTimer);
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    if (child.connected) child.disconnect();
    child.unref();
  }
}

async function processSnapshot(): Promise<ProcessIdentity[]> {
  const { stdout } = await execFileAsync("ps", ["-axo", "pid=,ppid=,pgid=,lstart=,comm="], {
    timeout: 2_000,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, LC_ALL: "C" },
  });
  return stdout
    .trim()
    .split("\n")
    .flatMap((line) => {
      const parts = line.trim().split(/\s+/u);
      if (parts.length < 9) return [];
      return [
        {
          pid: Number(parts[0]),
          parent: Number(parts[1]),
          group: Number(parts[2]),
          started: parts.slice(3, 8).join(" "),
          command: parts.slice(8).join(" "),
        },
      ];
    });
}

function groupExists(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return processMayExistAfterProbeError(error);
  }
}

export function processMayExistAfterProbeError(error: unknown): boolean {
  // EPERM (and unknown observation errors) cannot prove absence. Retain the
  // group for bounded cleanup and failed-run reporting instead of abandoning it.
  return !isMissingProcess(error);
}

function isMissingProcess(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ESRCH";
}

function sanitizeDiagnostics(value: unknown): LifecycleDiagnostics | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    !("resources" in value) ||
    !("handles" in value) ||
    !Array.isArray(value.resources) ||
    !Array.isArray(value.handles)
  )
    return undefined;
  return {
    resources: value.resources.filter((item): item is string => typeof item === "string"),
    handles: value.handles.flatMap((item: unknown) =>
      typeof item === "object" && item !== null && "type" in item && typeof item.type === "string"
        ? [
            {
              type: item.type,
              active: "active" in item && item.active === true,
              referenced: "referenced" in item && item.referenced === true,
            },
          ]
        : [],
    ),
  };
}
