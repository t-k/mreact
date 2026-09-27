import { performance } from "node:perf_hooks";
import { explainTransform, transform } from "../src/index.js";

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function measure(run: () => unknown): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

for (const children of [10, 100]) {
  const code = [
    'import { cell } from "@reckona/mreact-reactive-core";',
    "export function App() {",
    "  const value = cell(1);",
    "  return <main>",
    ...Array.from({ length: children }, () => "    <p>{value.get()}</p>"),
    "  </main>;",
    "}",
  ].join("\n");
  const input = { code, filename: "App.tsx", target: "client" as const, dev: false };
  const ordinary: number[] = [];
  const explained: number[] = [];

  for (let repeat = 0; repeat < 25; repeat += 1) {
    const transformMs = measure(() => transform(input));
    const reportMs = measure(() => explainTransform(input));
    if (repeat >= 5) {
      ordinary.push(transformMs);
      explained.push(reportMs);
    }
  }

  process.stdout.write(
    `${children} JSX children: transform ${median(ordinary).toFixed(2)} ms; explainTransform ${median(explained).toFixed(2)} ms\n`,
  );
}
