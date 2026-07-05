import type {
  PrimitiveCase,
  PrimitiveCaseResult,
  PrimitiveRunContext,
} from "./types.js";
import { closeBenchmarkDom } from "./dom.js";

export const primitiveRunnerDefaults = {
  warmupRuns: 5,
  measuredRuns: 25,
} as const;

export async function collectPrimitiveCaseSamples(
  createContext: () => PrimitiveRunContext,
  runCase: PrimitiveCase,
  options: {
    warmupRuns?: number;
    measuredRuns?: number;
    sampleBatchSize?: number;
  } = {},
): Promise<PrimitiveCaseResult> {
  const warmupRuns = options.warmupRuns ?? primitiveRunnerDefaults.warmupRuns;
  const measuredRuns =
    options.measuredRuns ?? primitiveRunnerDefaults.measuredRuns;
  const sampleBatchSize = options.sampleBatchSize ?? 1;
  const samples: number[] = [];
  const notes: string[] = sampleBatchSize > 1 ? [`sampleBatchSize=${sampleBatchSize}`] : [];

  for (let index = 0; index < warmupRuns + measuredRuns; index += 1) {
    const result = await collectOnePrimitiveSampleBatch(createContext, runCase, sampleBatchSize);

    if (index < warmupRuns) {
      continue;
    }

    samples.push(...result.samples);
    notes.push(...(result.notes ?? []));
  }

  return {
    samples,
    notes: notes.length > 0 ? notes : undefined,
  };
}

async function collectOnePrimitiveSampleBatch(
  createContext: () => PrimitiveRunContext,
  runCase: PrimitiveCase,
  sampleBatchSize: number,
): Promise<PrimitiveCaseResult> {
  const samples: number[] = [];
  const notes: string[] = [];

  for (let index = 0; index < sampleBatchSize; index += 1) {
    let result: PrimitiveCaseResult;

    try {
      result = await runCase(createContext());
    } finally {
      await closeBenchmarkDom();
    }

    samples.push(...result.samples);
    notes.push(...(result.notes ?? []));
  }

  if (sampleBatchSize === 1) {
    return {
      samples,
      notes: notes.length > 0 ? notes : undefined,
    };
  }

  const mean = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
  return {
    samples: [mean],
    notes: notes.length > 0 ? notes : undefined,
  };
}
