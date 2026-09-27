import { performance } from "node:perf_hooks";
import { createCollection } from "../src/index.js";

interface Row {
  id: number;
  status: "open" | "done";
}

const sizes = [100, 1_000, 10_000];
const updates = 2_000;

function time(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

for (const size of sizes) {
  const initial: Row[] = Array.from({ length: size }, (_, id) => ({ id, status: "open" }));
  const target = size >> 1;
  const arrayTimes: number[] = [];
  const collectionTimes: number[] = [];

  for (let repeat = 0; repeat < 4; repeat += 1) {
    let ordinary = initial;
    const collection = createCollection(initial, { key: (item) => item.id });
    const updateStatus = (index: number): Row["status"] => (index % 2 === 0 ? "done" : "open");

    const arrayMs = time(() => {
      for (let index = 0; index < updates; index += 1) {
        const status = updateStatus(index);
        ordinary = ordinary.map((item) => (item.id === target ? { ...item, status } : item));
      }
    });
    const collectionMs = time(() => {
      for (let index = 0; index < updates; index += 1) {
        collection.patch(target, { status: updateStatus(index) });
      }
    });

    if (ordinary[target]?.status !== collection.row(target)?.get()?.status) {
      throw new Error("The workloads produced different row values");
    }
    if (repeat > 0) {
      arrayTimes.push(arrayMs);
      collectionTimes.push(collectionMs);
    }
  }

  const median = (samples: number[]): number =>
    [...samples].sort((left, right) => left - right)[1]!;
  process.stdout.write(
    `${size} rows, ${updates} updates: ordinary array ${median(arrayTimes).toFixed(2)} ms; collection.patch ${median(collectionTimes).toFixed(2)} ms\n`,
  );
}
