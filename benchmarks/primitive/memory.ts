export const forcedGcMemoryNote = "heapUsed raw delta after forced async GC";
export const memoryStressCycles = 20;

export function calculateHeapDelta(after: number, before: number): number {
  return after - before;
}

export async function forceBenchmarkGarbageCollection(): Promise<void> {
  if (typeof globalThis.gc !== "function") {
    throw new Error("Memory benchmarks require Node to run with --expose-gc");
  }

  for (let index = 0; index < 3; index += 1) {
    globalThis.gc();

    if (index < 2) {
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    }
  }
}

export async function readHeapUsedAfterForcedGc(): Promise<number> {
  await forceBenchmarkGarbageCollection();
  return process.memoryUsage().heapUsed;
}
