import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { cpus, platform, release } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [baselinePath, outputPath, roundsInput = "8"] = process.argv.slice(2);
assert(baselinePath && outputPath, "Usage: run.ts <built-baseline> <output-directory> [rounds]");
const rounds = Number(roundsInput);
assert(Number.isSafeInteger(rounds) && rounds >= 1, "Rounds must be a positive integer");
const output = resolve(outputPath);
await mkdir(output, { recursive: true });

const variants = [
  { name: "baseline", root: resolve(baselinePath) },
  { name: "candidate", root: process.cwd() },
];
await writeFile(join(output, "environment.json"), JSON.stringify({
  node: process.version,
  platform: platform(),
  release: release(),
  cpu: cpus()[0]?.model,
  cpuCount: cpus().length,
  rounds,
  revisions: Object.fromEntries(variants.map(({ name, root }) => [
    name,
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  ])),
}, null, 2));

const loader = import.meta.resolve("tsx");
const measure = fileURLToPath(new URL("./measure.ts", import.meta.url));
for (const mode of ["non-router", "stream", "browser"] as const) {
  for (let round = 0; round < rounds; round += 1) {
    const order = round % 2 === 0 ? variants : [...variants].reverse();
    for (const { name, root } of order) {
      console.log(`${mode} ${round + 1}/${rounds} ${name}`);
      const path = join(output, `${mode}-${round + 1}-${name}`);
      const args = mode === "non-router" ? ["benchmarks/non-router/run.ts"] : [measure, mode];
      const stdout = execFileSync(process.execPath, ["--import", loader, ...args], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, NODE_ENV: "production", MREACT_NON_ROUTER_BENCH_OUT: `${path}.md` },
        maxBuffer: 1_048_576,
        timeout: 180_000,
      });
      if (mode !== "non-router") {
        JSON.parse(stdout);
        await writeFile(`${path}.json`, stdout);
      }
    }
  }
}
