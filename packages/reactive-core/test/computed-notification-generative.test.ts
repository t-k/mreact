import { describe, expect, test } from "vitest";
import { batch, cell, computed, effect, untrack } from "../src/index.js";
import { createReactiveTestRuntime, flushEffects } from "../src/testing.js";

// Seeded generator: random DAGs of cells and computeds, including branch
// computeds that switch dependencies, primed while unobserved, subscribed in
// random order, and driven through random writes. Every node value and every
// value each effect observed is compared with a pure reference model.

type Node =
  | { kind: "cell"; index: number }
  | { kind: "sum"; deps: number[] }
  | { kind: "branch"; guard: number; threshold: number; then: number; else: number }
  // Reads a node created later, so creation order is not dependency order.
  | { kind: "forward"; target: number; dep: number };

interface Graph {
  cellCount: number;
  nodes: Node[];
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

function pick(random: () => number, max: number): number {
  return Math.floor(random() * max);
}

function generateGraph(random: () => number): Graph {
  const cellCount = 1 + pick(random, 3);
  const nodes: Node[] = [];
  for (let index = 0; index < cellCount; index++) {
    nodes.push({ kind: "cell", index });
  }
  const computedCount = 4 + pick(random, 8);
  const forwards: number[] = [];
  for (let i = 0; i < computedCount; i++) {
    const available = nodes.length;
    if (i < computedCount - 1 && random() < 0.15) {
      forwards.push(nodes.length);
      nodes.push({ kind: "forward", target: -1, dep: pick(random, available) });
    } else if (available >= 3 && random() < 0.35) {
      nodes.push({
        kind: "branch",
        guard: pick(random, available),
        threshold: pick(random, 4),
        then: pick(random, available),
        else: pick(random, available),
      });
    } else {
      const count = 1 + pick(random, Math.min(3, available));
      const deps = new Set<number>();
      while (deps.size < count) {
        deps.add(pick(random, available));
      }
      nodes.push({ kind: "sum", deps: [...deps] });
    }
  }
  // Resolve forward targets to later nodes that do not depend on the forward
  // node itself, so the graph stays acyclic.
  const dependsOn = (index: number, needle: number, seen = new Set<number>()): boolean => {
    if (index === needle) return true;
    if (seen.has(index)) return false;
    seen.add(index);
    const node = nodes[index] as Node;
    const deps =
      node.kind === "cell"
        ? []
        : node.kind === "sum"
          ? node.deps
          : node.kind === "branch"
            ? [node.guard, node.then, node.else]
            : [node.dep, node.target];
    return deps.some((dep) => dep >= 0 && dependsOn(dep, needle, seen));
  };
  for (const index of forwards) {
    const candidates: number[] = [];
    for (let target = index + 1; target < nodes.length; target++) {
      if (!dependsOn(target, index)) candidates.push(target);
    }
    const node = nodes[index] as Extract<Node, { kind: "forward" }>;
    node.target =
      candidates.length === 0 ? node.dep : (candidates[pick(random, candidates.length)] as number);
  }
  return { cellCount, nodes };
}

function evaluate(graph: Graph, values: number[]): number[] {
  const results: number[] = [];
  const valueOf = (index: number): number => {
    if (results[index] !== undefined) return results[index] as number;
    const node = graph.nodes[index] as Node;
    let result: number;
    switch (node.kind) {
      case "cell":
        result = values[node.index] as number;
        break;
      case "sum":
        result = node.deps.reduce((sum, dep) => sum + valueOf(dep), 0);
        break;
      case "branch":
        result = valueOf(node.guard) > node.threshold ? valueOf(node.then) : valueOf(node.else);
        break;
      case "forward":
        result = valueOf(node.dep) + valueOf(node.target);
        break;
    }
    results[index] = result;
    return result;
  };
  for (let index = 0; index < graph.nodes.length; index++) valueOf(index);
  return results;
}

async function runScenario(
  seed: number,
  randomCreation = false,
  batchReads = false,
): Promise<void> {
  const runtime = randomCreation ? createReactiveTestRuntime() : undefined;
  const random = createRandom(seed);
  const graph = generateGraph(random);
  const label = `seed ${seed}`;
  const trace: string[] = [];
  (globalThis as any).__trace = process.env.MREACT_GENERATIVE_TRACE === String(seed);
  if (process.env.MREACT_GENERATIVE_TRACE === String(seed)) {
    trace.push(JSON.stringify(graph));
  }
  const values = Array.from({ length: graph.cellCount }, () => pick(random, 5));
  const cells = values.map((value) => cell(value));
  const live: Array<{ get(): number }> = [];
  const creationOrder = graph.nodes.map((_, index) => index);
  if (randomCreation) {
    for (let i = creationOrder.length - 1; i > 0; i--) {
      const j = pick(random, i + 1);
      [creationOrder[i], creationOrder[j]] = [creationOrder[j]!, creationOrder[i]!];
    }
  }
  for (const index of creationOrder) {
    const node = graph.nodes[index] as Node;
    const read = (dep: number) => (live[dep] as { get(): number }).get();
    switch (node.kind) {
      case "cell":
        live[index] = cells[node.index] as { get(): number };
        break;
      case "sum":
        live[index] = computed(() => node.deps.reduce((sum, dep) => sum + read(dep), 0));
        break;
      case "branch":
        live[index] = computed(() =>
          read(node.guard) > node.threshold ? read(node.then) : read(node.else),
        );
        break;
      case "forward":
        live[index] = computed(() => read(node.dep) + read(node.target));
        break;
    }
  }

  const computedIndexes = graph.nodes
    .map((node, index) => (node.kind === "cell" ? -1 : index))
    .filter((index) => index >= 0);

  // Prime a random subset of caches while nothing subscribes.
  for (const index of computedIndexes) {
    if (random() < 0.6) {
      trace.push(`prime ${index}`);
      untrack(() => (live[index] as { get(): number }).get());
    }
  }

  const seen = new Map<number, number[]>();
  const disposers = new Map<number, () => void>();
  const subscribe = (index: number) => {
    trace.push(`subscribe ${index}`);
    const history = seen.get(index) ?? [];
    seen.set(index, history);
    disposers.set(
      index,
      effect(() => {
        history.push((live[index] as { get(): number }).get());
      }),
    );
  };
  const expectedHistories = new Map<number, number[]>();

  const shuffled = [...computedIndexes].sort(() => random() - 0.5);
  const subscribeCount = 1 + pick(random, shuffled.length);
  let reference = evaluate(graph, values);
  for (const index of shuffled.slice(0, subscribeCount)) {
    subscribe(index);
    expectedHistories.set(index, [reference[index] as number]);
  }

  try {
    const steps = 3 + pick(random, 6);
    for (let step = 0; step < steps; step++) {
      // Occasionally change the observer set mid-run.
      if (random() < 0.25) {
        const index = shuffled[pick(random, shuffled.length)] as number;
        if (disposers.has(index)) {
          trace.push(`unsubscribe ${index}`);
          disposers.get(index)?.();
          disposers.delete(index);
        } else {
          subscribe(index);
          expectedHistories.set(index, [
            ...(expectedHistories.get(index) ?? []),
            reference[index] as number,
          ]);
        }
      }

      const writeCount = 1 + pick(random, graph.cellCount);
      const writes: Array<[number, number]> = [];
      for (let i = 0; i < writeCount; i++) {
        writes.push([pick(random, graph.cellCount), pick(random, 5)]);
      }
      trace.push(`write ${JSON.stringify(writes)} -> values ${JSON.stringify(values)}`);
      if ((globalThis as any).__trace) console.log("--- write", JSON.stringify(writes));
      const write = () => {
        for (const [index, value] of writes) {
          values[index] = value;
          cells[index]?.setValue(value);
          if (batchReads) {
            const expected = evaluate(graph, values);
            // Read consumers first so an upstream read cannot repair stale caches.
            for (const node of [...computedIndexes].reverse()) {
              expect(live[node]!.get(), `${label} batch node ${node}`).toBe(expected[node]);
            }
            values[index] = value + 1;
            cells[index]?.setValue(value + 1);
          }
        }
      };
      if (randomCreation && !batchReads && step % 2 === 0) write();
      else batch(write);
      const previous = reference;
      reference = evaluate(graph, values);

      // Pull reads before the flush must already be fresh.
      if (random() < 0.5 && !randomCreation) {
        const index = computedIndexes[pick(random, computedIndexes.length)] as number;
        trace.push(`preread ${index}`);
        expect(
          untrack(() => (live[index] as { get(): number }).get()),
          label,
        ).toBe(reference[index]);
      }

      if (runtime) runtime.flushAll();
      else await flushEffects();

      // Check delivery before any pull read can repair a missed notification.
      for (const index of disposers.keys()) {
        expect(seen.get(index)?.at(-1), `${label} observer ${index} step ${step}`).toBe(
          reference[index],
        );
      }

      for (const index of computedIndexes) {
        expect(
          untrack(() => (live[index] as { get(): number }).get()),
          label,
        ).toBe(reference[index]);
      }
      for (const index of disposers.keys()) {
        const history = expectedHistories.get(index) as number[];
        if (previous[index] !== reference[index]) {
          history.push(reference[index] as number);
        }
      }
    }

    // Publishes run in creation order, which is dependency order unless a
    // computed reads a node created after it. Such forward graphs can still
    // announce a transient value and then the settled one, so only their
    // consecutive duplicates are tolerated; values and non-forward histories
    // must match the reference model exactly.
    const hasForward = graph.nodes.some((node) => node.kind === "forward");
    const normalize = (history: number[]) =>
      hasForward ? history.filter((value, i) => i === 0 || value !== history[i - 1]) : history;
    for (const [index, history] of randomCreation ? [] : seen) {
      expect(normalize(history), `${label} node ${index}`).toEqual(
        normalize(expectedHistories.get(index) as number[]),
      );
    }
  } finally {
    if (trace.length > 0) {
      console.log(trace.join("\n"));
    }
    for (const dispose of disposers.values()) {
      dispose();
    }
    runtime?.dispose();
  }
}

describe("computed notification generative model", () => {
  const seedCount = Number(process.env.MREACT_GENERATIVE_SEEDS ?? 400);
  test(`matches the reference model for ${seedCount} random graphs`, async () => {
    for (let seed = 1; seed <= seedCount; seed++) {
      await runScenario(seed);
    }
  });

  test(`delivers through scheduled callbacks for ${seedCount} randomly created graphs`, async () => {
    for (let seed = 1; seed <= seedCount; seed++) {
      await runScenario(seed, true);
    }
  });

  test(`keeps batch reads and subsequent writes fresh for ${seedCount} random graphs`, async () => {
    for (let seed = 1; seed <= seedCount; seed++) {
      await runScenario(seed, true, true);
    }
  });

  // Seeds that each fail when one of the publish safeguards is removed:
  // 30 needs the early-read publish to existing subscribers, 688 needs a
  // reader to flush a queued dependency first, 1964 needs that pull to run
  // inside a batch, 10097 and 63509 need the flush to merge a lower-id
  // computed queued mid-pass ahead of later consumers, 30830 needs a pull to
  // preserve the outer reader's stamped dependencies, 28090 needs an
  // invalidation that arrives mid-recompute to survive that recompute, and
  // 20199 and 40270 need the read of a queued computed to refresh its
  // publish baseline.
  test.each([30, 688, 1964, 10097, 63509, 30830, 28090, 20199, 40270])(
    "keeps the reference model on pinned seed %d",
    async (seed) => {
      await runScenario(seed);
    },
  );
});
