import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const output = process.argv[2];
if (!output) throw new Error("Pass a run-specific JSON output path");
const names = ["includes", "weak-threshold", "fiber-field", "local-set"];
const threshold = 32;
const weakMembership = new WeakMap();
const implementations = {
  includes(parent, child) {
    const deletions = parent.deletions ??= [];
    if (!deletions.includes(child)) deletions.push(child);
  },
  "weak-threshold"(parent, child) {
    const deletions = parent.deletions ??= [];
    if (deletions.length < threshold) {
      if (!deletions.includes(child)) deletions.push(child);
      return;
    }
    let membership = weakMembership.get(deletions);
    if (membership === undefined) {
      membership = new Set(deletions);
      weakMembership.set(deletions, membership);
    }
    if (!membership.has(child)) { membership.add(child); deletions.push(child); }
  },
  "fiber-field"(parent, child) {
    const deletions = parent.deletions ??= [];
    if (deletions.length < threshold) {
      if (!deletions.includes(child)) deletions.push(child);
      return;
    }
    const membership = parent.membership ??= new Set(deletions);
    if (!membership.has(child)) { membership.add(child); deletions.push(child); }
  },
  "local-set"(parent, child) {
    if (!parent.membership.has(child)) { parent.membership.add(child); parent.deletions.push(child); }
  },
};
const sizes = [1, 8, 32, 1000, 10000, 20000, 50000];
const cases = [];
const quantile = (values, p) => values.toSorted((a, b) => a - b)[Math.ceil(values.length * p) - 1];
for (const size of sizes) {
  const children = Array.from({ length: size }, () => ({}));
  const samples = Object.fromEntries(names.map(name => [name, []]));
  const iterations = Math.max(1, Math.floor(10000 / size));
  for (let round = 0; round < 24; round++) {
    for (const name of round % 2 ? names.toReversed() : names) {
      const start = performance.now();
      for (let iteration = 0; iteration < iterations; iteration++) {
        const parent = name === "local-set" ? { deletions: [], membership: new Set() } : {};
        for (const child of children) implementations[name](parent, child);
        for (const child of children) implementations[name](parent, child);
        if (parent.deletions.length !== size || parent.deletions.some((child, i) => child !== children[i])) throw new Error("Deletion identity/order changed");
      }
      if (round >= 3) samples[name].push((performance.now() - start) / iterations);
    }
  }
  cases.push({ size, duplicatePass: true, samples, summary: Object.fromEntries(names.map(name => [name, { median: quantile(samples[name], .5), p95: quantile(samples[name], .95) }])) });
}
writeFileSync(output, JSON.stringify({ node: process.version, at: new Date().toISOString(), threshold, note: "Registration helper candidates, not full reconciliation or DOM commit", cases }, null, 2));
console.log(JSON.stringify(cases.map(({size,summary}) => ({size,summary})), null, 2));
