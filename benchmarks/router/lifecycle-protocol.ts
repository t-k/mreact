import type { ChildProcess } from "node:child_process";

export interface LifecycleDiagnostics {
  resources: string[];
  handles: { type: string; active: boolean; referenced: boolean }[];
}

let acknowledgeMeasurements: (() => void) | undefined;
const groupAcknowledgements = new Map<number, { resolve(): void; reject(error: Error): void }>();
let acknowledgements = 0;

function retainChannel(): void {
  acknowledgements += 1;
  process.channel?.ref();
}
function releaseChannel(): void {
  if (--acknowledgements === 0) process.channel?.unref();
}

export function collectLifecycleDiagnostics(): LifecycleDiagnostics {
  const report = process.report.getReport() as {
    libuv?: { type?: unknown; is_active?: unknown; is_referenced?: unknown }[];
  };
  return {
    resources: process.getActiveResourcesInfo(),
    // Never persist the full report: it includes environment and command-line data.
    handles: (report.libuv ?? []).map((handle) => ({
      type: typeof handle.type === "string" ? handle.type : "unknown",
      active: handle.is_active === true,
      referenced: handle.is_referenced === true,
    })),
  };
}

export function installLifecycleDiagnostics(): void {
  if (process.env.MREACT_ROUTER_BENCHMARK_SUPERVISED !== "1") return;
  process.on("message", (message: unknown) => {
    if (typeof message !== "object" || message === null || !("type" in message)) return;
    if (message.type === "router:diagnose" && process.connected) {
      process.send?.({ type: "router:diagnostics", diagnostics: collectLifecycleDiagnostics() });
    } else if (message.type === "router:measurements-ack") {
      acknowledgeMeasurements?.();
    } else if (
      message.type === "router:owned-group-ack" &&
      "pid" in message &&
      typeof message.pid === "number"
    ) {
      const pending = groupAcknowledgements.get(message.pid);
      if ("accepted" in message && message.accepted === true) pending?.resolve();
      else pending?.reject(new Error(`Supervisor could not verify process group ${message.pid}`));
    }
  });
  // A diagnostics listener must not itself prevent natural worker termination.
  process.channel?.unref();
}

export async function notifyMeasurementsComplete(): Promise<void> {
  if (process.env.MREACT_ROUTER_BENCHMARK_SUPERVISED !== "1" || !process.send || !process.connected)
    return;
  retainChannel();
  try {
    await new Promise<void>((resolve, reject) => {
      acknowledgeMeasurements = resolve;
      process.send?.({ type: "router:measurements-complete" }, (error) => {
        if (error) reject(error);
      });
    });
  } finally {
    acknowledgeMeasurements = undefined;
    releaseChannel();
  }
}

export async function registerDetachedProcess(
  child: Pick<ChildProcess, "pid">,
  owner: string,
): Promise<void> {
  if (
    process.env.MREACT_ROUTER_BENCHMARK_SUPERVISED === "1" &&
    child.pid !== undefined &&
    process.connected
  ) {
    const pid = child.pid;
    retainChannel();
    try {
      await new Promise<void>((resolve, reject) => {
        groupAcknowledgements.set(pid, { resolve, reject });
        process.send?.({ type: "router:owned-group", pid, owner }, (error) => {
          if (error) reject(error);
        });
      });
    } finally {
      groupAcknowledgements.delete(pid);
      releaseChannel();
    }
  }
}
