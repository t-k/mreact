import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { register } from "node:module";
import { fileURLToPath } from "node:url";
import type { StandardSchemaV1 } from "../../packages/forms/src/standard-schema.js";

const currentFile = fileURLToPath(import.meta.url);
const workspaceRoot = join(dirname(currentFile), "..", "..");
const packageAliases = {
  "@reckona/mreact-devtools": packageSource("devtools", "index.ts"),
  "@reckona/mreact-reactive-core": packageSource("reactive-core", "index.ts"),
  "@reckona/mreact-reactive-core/internal": packageSource("reactive-core", "internal.ts"),
  "@reckona/mreact-reactive-core/runtime-state": packageSource(
    "reactive-core",
    "runtime-state-public.ts",
  ),
  "@reckona/mreact-router": `data:text/javascript,${encodeURIComponent(`
    export function redirect(location, init = {}) {
      const error = new Error("Redirect");
      error.location = location;
      error.status = init.status ?? 302;
      throw error;
    }
  `)}`,
  "@reckona/mreact-router/session": packageSource("router", "session.ts"),
};

register(
  `data:text/javascript,${encodeURIComponent(`
    const aliases = new Map(${JSON.stringify(Object.entries(packageAliases))});

    export async function resolve(specifier, context, nextResolve) {
      const url = aliases.get(specifier);

      if (url !== undefined) {
        return { url, shortCircuit: true };
      }

      return nextResolve(specifier, context);
    }
  `)}`,
  import.meta.url,
);

function packageSource(packageName: string, fileName: string): string {
  return new URL(`../../packages/${packageName}/src/${fileName}`, import.meta.url).href;
}

const { effect } = await import("@reckona/mreact-reactive-core");
const { withCleanupScope } = await import("@reckona/mreact-reactive-core/internal");
const { createMemorySessionStore, createSession, getCurrentSession } =
  await import("../../packages/auth/src/index.js");
const { createForm } = await import("../../packages/forms/src/index.js");
const { createInfiniteQuery, createQuery, createQueryClient } =
  await import("../../packages/query/src/index.js");
const { createStore } = await import("../../packages/store/src/index.js");
const { createVirtualList } = await import("../../packages/virtual/src/index.js");

interface BenchRow {
  name: string;
  unit: "ms" | "calls" | "count";
  value: number;
}

const rows: BenchRow[] = [];

function measure(name: string, fn: () => void): void {
  const startedAt = performance.now();
  fn();
  rows.push({ name, unit: "ms", value: performance.now() - startedAt });
}

async function measureAsync(name: string, fn: () => Promise<void>): Promise<void> {
  const startedAt = performance.now();
  await fn();
  rows.push({ name, unit: "ms", value: performance.now() - startedAt });
}

measure("store.select cleanup-scope churn then update", () => {
  const store = createStore({ count: 0, label: "Ada" });
  const disposers: Array<() => void> = [];
  let selectorCalls = 0;

  for (let index = 0; index < 10_000; index += 1) {
    withCleanupScope(
      (dispose) => {
        disposers.push(dispose);
      },
      () =>
        store.select((state) => {
          selectorCalls += 1;
          return state.count;
        }),
    ).get();
  }

  for (const dispose of disposers) {
    dispose();
  }

  store.set({ count: 1 });
  rows.push({
    name: "store.select selector calls after disposed scopes",
    unit: "calls",
    value: selectorCalls,
  });
});

measure("virtual measured tail refresh", () => {
  const items = Array.from({ length: 100_000 }, (_unused, index) => ({ id: `row-${index}` }));
  let offset = 2_300_000;
  const virtual = createVirtualList({
    estimateItemSize: () => 24,
    getKey: (item) => item.id,
    items: () => items,
    overscan: 2,
    scrollOffset: () => offset,
    viewportSize: () => 240,
  });

  virtual.measureItem("row-0", 32);

  for (let index = 0; index < 100; index += 1) {
    offset += 24;
    virtual.refresh();
  }
});

measure("virtual subscribed measured tail refresh", () => {
  const items = Array.from({ length: 100_000 }, (_unused, index) => ({ id: `row-${index}` }));
  let offset = 2_300_000;
  const virtual = createVirtualList({
    estimateItemSize: () => 24,
    getKey: (item) => item.id,
    items: () => items,
    overscan: 2,
    scrollOffset: () => offset,
    viewportSize: () => 240,
  });
  const disposeEntriesSubscriber = effect(() => {
    virtual.entries.get();
  });

  virtual.measureItem("row-0", 32);

  for (let index = 0; index < 100; index += 1) {
    offset += 24;
    virtual.refresh();
  }

  disposeEntriesSubscriber();
});

measure("virtual stale measured refresh", () => {
  const firstItems = Array.from({ length: 100_000 }, (_unused, index) => ({ id: `old-${index}` }));
  const nextItems = Array.from({ length: 100_000 }, (_unused, index) => ({ id: `new-${index}` }));
  let items = firstItems;
  const virtual = createVirtualList({
    estimateItemSize: () => 24,
    getKey: (item) => item.id,
    items: () => items,
    overscan: 2,
    scrollOffset: () => 24_000,
    viewportSize: () => 240,
  });

  virtual.measureItem("old-0", 32);
  items = nextItems;

  for (let index = 0; index < 100; index += 1) {
    virtual.refresh();
  }
});

measure("virtual repeated scrollToKey large list head middle tail", () => {
  const items = Array.from({ length: 100_000 }, (_unused, index) => ({ id: `jump-${index}` }));
  const virtual = createVirtualList({
    estimateItemSize: () => 24,
    getKey: (item) => item.id,
    items: () => items,
    overscan: 0,
    scrollOffset: () => 0,
    viewportSize: () => 240,
  });
  const keys = ["jump-0", "jump-50000", "jump-99999"];

  for (let index = 0; index < 1_000; index += 1) {
    for (const key of keys) {
      virtual.scrollToKey(key);
    }
  }
});

await measureAsync("query deep-key observer updates", async () => {
  const client = createQueryClient();
  const queryKey = ["profile", { filters: { active: true, roles: ["admin", "editor"] } }];
  const observers = Array.from({ length: 1_000 }, () =>
    createQuery(client, {
      autoFetch: false,
      queryFn: () => 0,
      queryKey,
    }),
  );

  for (let index = 0; index < 1_000; index += 1) {
    client.setQueryData(queryKey, index);
  }

  for (const observer of observers) {
    observer.dispose();
  }
});

await measureAsync("query infinite fetch 500 pages", async () => {
  const client = createQueryClient();
  const query = createInfiniteQuery<{ payload: string; nextCursor?: number }, number>(client, {
    autoFetch: false,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => ({
      nextCursor: pageParam < 499 ? pageParam + 1 : undefined,
      payload: `page-${pageParam}-${"x".repeat(1_000)}`,
    }),
    queryKey: ["bench-infinite"],
  });

  await query.refetch();
  while (query.result.get().hasNextPage) {
    await query.fetchNextPage();
  }

  rows.push({
    name: "query infinite retained cache entries after 500 pages",
    unit: "count",
    value: client.entries().length,
  });
});

await measureAsync("forms many schema issues on one field", async () => {
  const schema: StandardSchemaV1<{ email: string }, { email: string }> = {
    "~standard": {
      validate() {
        return {
          issues: Array.from({ length: 10_000 }, (_unused, index) => ({
            message: `Issue ${index}`,
            path: ["email"],
          })),
        };
      },
      vendor: "bench",
      version: 1,
    },
  };
  const form = createForm({
    initialValues: { email: "" },
    schema,
  });

  await form.validate();
});

await measureAsync("auth current session with large payload", async () => {
  const store = createMemorySessionStore<Record<string, unknown>>();
  const response = new Response(null);
  const payload = Object.fromEntries(
    Array.from({ length: 10_000 }, (_unused, index) => [`claim${index}`, index]),
  );
  payload.roles = ["member"];
  payload.permissions = ["profile:read"];
  await createSession(response, store, payload);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const request = new Request("https://app.test/", {
    headers: { cookie },
  });

  for (let index = 0; index < 1_000; index += 1) {
    await getCurrentSession(request, store);
  }
});

const output = [
  "| Benchmark | Value | Unit |",
  "| --- | ---: | --- |",
  ...rows.map((row) => `| ${row.name} | ${row.value.toFixed(3)} | ${row.unit} |`),
  "",
].join("\n");

const outputFile = process.env.MREACT_NON_ROUTER_BENCH_OUT;
if (outputFile !== undefined && outputFile !== "") {
  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, output);
}

console.log(output);

void workspaceRoot;
