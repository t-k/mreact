import type { PrimitiveCaseDefinition } from "./types.js";

export const primitiveCases: PrimitiveCaseDefinition[] = [
  {
    name: "create 1k rows",
    count: 1_000,
    metric: "duration",
    unit: "ms",
  },
  {
    name: "update every 10th in 10k rows",
    count: 10_000,
    metric: "duration",
    unit: "ms",
  },
  {
    name: "keyed reverse 1k rows",
    count: 1_000,
    metric: "duration",
    unit: "ms",
  },
  {
    name: "text binding update 1k",
    count: 1_000,
    metric: "duration",
    unit: "ms",
  },
];
