export const forcedGcMemoryNote = "heapUsed delta after forced GC";

export function forceBenchmarkGarbageCollection(): void {
  if (typeof globalThis.gc !== "function") {
    throw new Error("Memory benchmarks require Node to run with --expose-gc");
  }

  for (let index = 0; index < 3; index += 1) {
    globalThis.gc();
  }
}

export function readHeapUsedAfterForcedGc(): number {
  forceBenchmarkGarbageCollection();
  return process.memoryUsage().heapUsed;
}
