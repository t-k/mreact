import { createServer } from "node:http";
import { expect, it } from "vitest";
import {
  browserRowsFromTrials,
  collectBrowserRows,
  browserBenchmarkCases,
} from "./runner-browser.js";
import type { BrowserTrial } from "./browser-trials.js";

const adapter = { name: "mreact-app-router" as const, version: "test" };
const sample = (id: string, value = 10): BrowserTrial => ({
  methodologyVersion: 2,
  trialId: id,
  profile: "domcontentloaded",
  status: "completed",
  stage: "completed",
  target: { url: "http://localhost", counterPrefix: "count: " },
  timeoutMs: 1000,
  ssrVerified: true,
  initialContentMs: 2,
  domContentLoadedMs: 1,
  first: { dispatchMs: 10, domObservedMs: 10 + value, eventToDomMs: value, e2eMs: value + 2 },
  second: { dispatchMs: 30 + value, domObservedMs: 31 + value, eventToDomMs: 1, e2eMs: 2 },
  navigationToVerifiedMs: 10 + value,
  diagnostics: [],
});

it("derives phase metrics from the same trial IDs without repeating operations", () => {
  const trials = [sample("a", 30), sample("b", 10), sample("c", 20)];
  const rows = browserRowsFromTrials(adapter, "domcontentloaded", trials);
  expect(rows).toHaveLength(4);
  expect(
    rows.every(
      (row) =>
        row.caseName.startsWith("app browser v2 domcontentloaded ") &&
        row.metric === "duration" &&
        row.unit === "ms" &&
        row.samples?.unit === "ms",
    ),
  ).toBe(true);
  expect(rows[0]?.note).toContain("not paint, INP");
  expect(
    browserBenchmarkCases.every(
      (item) =>
        item.description.includes("SSR content") && item.description.includes("not paint or INP"),
    ),
  ).toBe(true);
  expect(rows.every((row) => row.status === "completed" && row.browserTrials === trials)).toBe(
    true,
  );
  expect(rows.find((row) => row.caseName.endsWith("first click event-to-DOM"))?.value).toBe(20);
});

it("preserves raw partial trials but fails every related metric", () => {
  const failed = {
    ...sample("failed"),
    status: "failed" as const,
    error: "no handler",
    first: undefined,
  };
  const rows = browserRowsFromTrials(adapter, "domcontentloaded", [sample("ok"), failed]);
  expect(rows.every((row) => row.status === "failed" && row.value === 0)).toBe(true);
  expect(rows[0]?.browserTrials?.[1]).toBe(failed);
  expect(rows[0]?.note).toContain("no handler");
  expect(rows[0]?.samples?.values).toEqual([2]);
});

it("rejects missing or nonfinite completed trial data", () => {
  for (const trial of [
    { ...sample("bad"), first: undefined },
    { ...sample("nan"), initialContentMs: NaN },
  ]) {
    expect(
      browserRowsFromTrials(adapter, "domcontentloaded", [trial]).every(
        (row) => row.status === "failed",
      ),
    ).toBe(true);
  }
});

it("does not infer browser support from legacy scalar getters", async () => {
  const rows = await collectBrowserRows([adapter]);
  expect(rows).toHaveLength(8);
  expect(rows.every((row) => row.status === "unsupported")).toBe(true);
});

it("requires successful network idle for that profile", () => {
  const trial = { ...sample("not-idle"), profile: "networkidle" as const };
  expect(
    browserRowsFromTrials(adapter, "networkidle", [trial]).every((row) => row.status === "failed"),
  ).toBe(true);
});

it("rejects inconsistent clocks, profile, SSR and interaction data", () => {
  const base = sample("bad");
  const invalid: BrowserTrial[] = [
    { ...base, status: "failed" },
    { ...base, error: "deadline exceeded" },
    { ...base, diagnostics: ["uncaught page error"] },
    { ...base, profile: "networkidle" },
    { ...base, ssrVerified: false },
    { ...base, domContentLoadedMs: -1 },
    { ...base, domContentLoadedMs: Infinity },
    { ...base, initialContentMs: "2" as unknown as number },
    { ...base, first: { ...base.first!, e2eMs: Infinity } },
    { ...base, second: undefined },
    { ...base, navigationToVerifiedMs: 99 },
    { ...base, initialContentMs: 11 },
    { ...base, first: { ...base.first!, eventToDomMs: 9 } },
    { ...base, first: { ...base.first!, e2eMs: 1 } },
    { ...base, first: { ...base.first!, dispatchMs: Infinity } },
    { ...base, second: { dispatchMs: 0, domObservedMs: 1, eventToDomMs: 1, e2eMs: 2 } },
  ];
  for (const trial of invalid)
    expect(
      browserRowsFromTrials(adapter, "domcontentloaded", [trial]).every(
        (row) =>
          row.status === "failed" &&
          row.note === (trial.error ?? "Invalid completed browser trial"),
      ),
    ).toBe(true);
});

it("allows equal timestamp boundaries without inventing negative durations", () => {
  const trial = {
    ...sample("zero"),
    initialContentMs: 0,
    domContentLoadedMs: 0,
    navigationToVerifiedMs: 0,
    first: { dispatchMs: 0, domObservedMs: 0, eventToDomMs: 0, e2eMs: 0 },
    second: { dispatchMs: 0, domObservedMs: 0, eventToDomMs: 0, e2eMs: 0 },
  };
  expect(
    browserRowsFromTrials(adapter, "domcontentloaded", [trial]).every(
      (row) => row.status === "completed" && row.value === 0,
    ),
  ).toBe(true);
});

it("retains target setup errors and stops retrying each failed profile", async () => {
  let attempts = 0;
  const rows = await collectBrowserRows(
    [
      {
        ...adapter,
        async getBrowserTarget() {
          attempts++;
          throw new Error("unavailable fixture");
        },
      },
    ],
    { rounds: 3 },
  );
  expect(attempts).toBe(2);
  expect(
    rows.every((row) => row.status === "failed" && row.note?.includes("unavailable fixture")),
  ).toBe(true);
});

it("uses an even median and retains explicit setup errors", () => {
  const rows = browserRowsFromTrials(adapter, "domcontentloaded", [
    sample("a", 20),
    sample("b", 10),
  ]);
  expect(rows.find((row) => row.caseName.endsWith("first click event-to-DOM"))?.value).toBe(15);
  const failed = browserRowsFromTrials(adapter, "domcontentloaded", [], "fixture failed");
  expect(
    failed.every(
      (row) => row.status === "failed" && row.value === 0 && row.note === "fixture failed",
    ),
  ).toBe(true);
});

it("collects rotated real browser trials with shared metrics and distinct IDs", async () => {
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "text/html");
    res.end(
      "<!doctype html><button>count: 0</button><script>let n=0;document.querySelector('button').onclick=e=>e.target.textContent='count: '+(++n)</script>",
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No address");
    const rows = await collectBrowserRows(
      [
        {
          ...adapter,
          async getBrowserTarget() {
            return { url: `http://127.0.0.1:${address.port}`, counterPrefix: "count: " };
          },
        },
      ],
      { rounds: 2, timeoutMs: 1500 },
    );
    expect(rows).toHaveLength(8);
    expect(
      rows.every((row) => row.status === "completed" && row.samples?.values.length === 2),
    ).toBe(true);
    const dcl = rows[0]!.browserTrials!;
    const idle = rows[4]!.browserTrials!;
    expect(dcl.map((t) => t.executionOrder)).toEqual([
      { round: 0, position: 0 },
      { round: 1, position: 1 },
    ]);
    expect(idle.map((t) => t.executionOrder)).toEqual([
      { round: 0, position: 1 },
      { round: 1, position: 0 },
    ]);
    expect(new Set([...dcl, ...idle].map((t) => t.trialId)).size).toBe(4);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
  }
}, 15000);

it("rejects invalid round counts before allocating resources", async () => {
  expect(await collectBrowserRows([], { rounds: 1 })).toEqual([]);
  expect(await collectBrowserRows([], { rounds: 20 })).toEqual([]);
  for (const rounds of [0, 21, 1.5, NaN])
    await expect(collectBrowserRows([], { rounds })).rejects.toThrow(
      "Invalid browser trial rounds",
    );
});
