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
  } = {},
): Promise<PrimitiveCaseResult> {
  const warmupRuns = options.warmupRuns ?? primitiveRunnerDefaults.warmupRuns;
  const measuredRuns =
    options.measuredRuns ?? primitiveRunnerDefaults.measuredRuns;
  const samples: number[] = [];
  const notes: string[] = [];

  for (let index = 0; index < warmupRuns + measuredRuns; index += 1) {
    let result: PrimitiveCaseResult;

    try {
      result = await runCase(createContext());
    } finally {
      closeBenchmarkDom();
    }

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
