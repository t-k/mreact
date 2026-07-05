import type { App, Ref } from "vue";
import { readPackageVersion } from "../../shared/env.js";
import {
  createReplacementRowsData,
  createRowsData,
  createRowsDataFrom,
  validateRows,
  validateRowsReversedWithNodeIdentity,
  validateSelectedRow,
} from "../fixtures/rows.js";
import type { RowFixture } from "../fixtures/rows.js";
import { validateEventTargets } from "../fixtures/event-targets.js";
import {
  calculateHeapDelta,
  forcedGcMemoryNote,
  memoryStressCycles,
  readHeapUsedAfterForcedGc,
} from "../memory.js";
import type { PrimitiveAdapter, PrimitiveCaseResult, PrimitiveRunContext } from "../types.js";
import { assertRenderedTextValues, sum, updateEveryTenth } from "./framework-runtime-utils.js";

interface RowsMount {
  app: App;
  rows: Ref<RowFixture[]>;
  selectedId: Ref<number>;
}

type VueRuntime = typeof import("vue");

let vueRuntimePromise: Promise<VueRuntime> | undefined;

export const vuePrimitiveAdapter: PrimitiveAdapter = {
  fixtureKind: "framework-runtime",
  name: "vue",
  version: readPackageVersion("vue"),
  cases: {
    "create 1k rows": runCreateRows,
    "replace all 1k rows": runReplaceAllRows,
    "update every 10th in 10k rows": runUpdateEveryTenth,
    "select row in 10k rows": runSelectRow,
    "append 1k rows to 10k rows": runAppendRows,
    "remove row from 1k rows": runRemoveRow,
    "clear 10k rows": runClearRows,
    "keyed reverse 1k rows": runKeyedReverse,
    "create 1k event targets": runCreateEventTargets,
    "text binding update 1k": runTextBindingUpdate,
    "computed fan-out 1k": runComputedFanOut,
    "computed fan-in 1k (single array write)": runComputedFanIn,
    "repeated create update clear memory": runRepeatedMemory,
  },
};

async function runCreateRows({ count, document }: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const vue = await getVueRuntime();
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const start = performance.now();
  const mounted = mountRows(vue, host, rows);
  await vue.nextTick();
  const duration = performance.now() - start;

  try {
    validateRows(host, rows);
    return { samples: [duration] };
  } finally {
    mounted.app.unmount();
  }
}

async function runReplaceAllRows({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const vue = await getVueRuntime();
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const replacementRows = createReplacementRowsData(count);
  const mounted = mountRows(vue, host, rows);

  try {
    await vue.nextTick();
    validateRows(host, rows);

    const start = performance.now();
    mounted.rows.value = replacementRows;
    await vue.nextTick();
    const duration = performance.now() - start;

    validateRows(host, replacementRows);
    return { samples: [duration] };
  } finally {
    mounted.app.unmount();
  }
}

async function runUpdateEveryTenth({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const vue = await getVueRuntime();
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const updatedRows = updateEveryTenth(rows);
  const mounted = mountRows(vue, host, rows);

  try {
    await vue.nextTick();
    validateRows(host, rows);

    const start = performance.now();
    mounted.rows.value = updatedRows;
    await vue.nextTick();
    const duration = performance.now() - start;

    validateRows(host, updatedRows);
    return { samples: [duration] };
  } finally {
    mounted.app.unmount();
  }
}

async function runSelectRow({ count, document }: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const vue = await getVueRuntime();
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const selectedId = Math.floor(count / 2);
  const mounted = mountRows(vue, host, rows);

  try {
    await vue.nextTick();
    validateRows(host, rows);

    const start = performance.now();
    mounted.selectedId.value = selectedId;
    await vue.nextTick();
    const duration = performance.now() - start;

    validateRows(host, rows);
    validateSelectedRow(host, selectedId);
    return { samples: [duration] };
  } finally {
    mounted.app.unmount();
  }
}

async function runAppendRows({ count, document }: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const vue = await getVueRuntime();
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const appendedRows = [...rows, ...createRowsDataFrom(count, 1_000)];
  const mounted = mountRows(vue, host, rows);

  try {
    await vue.nextTick();
    validateRows(host, rows);

    const start = performance.now();
    mounted.rows.value = appendedRows;
    await vue.nextTick();
    const duration = performance.now() - start;

    validateRows(host, appendedRows);
    return { samples: [duration] };
  } finally {
    mounted.app.unmount();
  }
}

async function runRemoveRow({ count, document }: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const vue = await getVueRuntime();
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const remainingRows = rows.filter((_, index) => index !== Math.floor(count / 2));
  const mounted = mountRows(vue, host, rows);

  try {
    await vue.nextTick();
    validateRows(host, rows);

    const start = performance.now();
    mounted.rows.value = remainingRows;
    await vue.nextTick();
    const duration = performance.now() - start;

    validateRows(host, remainingRows);
    return { samples: [duration] };
  } finally {
    mounted.app.unmount();
  }
}

async function runClearRows({ count, document }: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const vue = await getVueRuntime();
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const mounted = mountRows(vue, host, rows);

  try {
    await vue.nextTick();
    validateRows(host, rows);

    const start = performance.now();
    mounted.rows.value = [];
    await vue.nextTick();
    const duration = performance.now() - start;

    validateRows(host, []);
    return { samples: [duration] };
  } finally {
    mounted.app.unmount();
  }
}

async function runKeyedReverse({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const vue = await getVueRuntime();
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const mounted = mountRows(vue, host, rows);

  try {
    await vue.nextTick();
    validateRows(host, rows);
    const initialNodes = [...host.children];

    const start = performance.now();
    mounted.rows.value = [...rows].reverse();
    await vue.nextTick();
    const duration = performance.now() - start;

    validateRowsReversedWithNodeIdentity(host, rows, initialNodes);
    return { samples: [duration] };
  } finally {
    mounted.app.unmount();
  }
}

async function runCreateEventTargets({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const vue = await getVueRuntime();
  const host = document.createElement("div");
  const items = Array.from({ length: count }, (_, index) => index);
  const start = performance.now();
  const app = vue.createApp({
    setup() {
      return () =>
        vue.h(
          vue.Fragment,
          items.map((item) =>
            vue.h(
              "button",
              { "data-index": String(item), onClick: () => undefined, type: "button" },
              item,
            ),
          ),
        );
    },
  });
  app.mount(host);
  await vue.nextTick();
  const duration = performance.now() - start;

  try {
    validateEventTargets(host, count);
    return { samples: [duration] };
  } finally {
    app.unmount();
  }
}

async function runTextBindingUpdate({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const vue = await getVueRuntime();
  const host = document.createElement("div");
  const items = Array.from({ length: count }, (_, index) => index);
  const value = vue.ref("0");
  const app = mountText(vue, host, items, () => value.value);

  try {
    await vue.nextTick();
    assertRenderedTextValues(host, count, "0");

    const start = performance.now();
    value.value = "1";
    await vue.nextTick();
    const duration = performance.now() - start;

    assertRenderedTextValues(host, count, "1");
    return { samples: [duration] };
  } finally {
    app.unmount();
  }
}

async function runComputedFanOut({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const vue = await getVueRuntime();
  const host = document.createElement("div");
  const items = Array.from({ length: count }, (_, index) => index);
  const source = vue.ref(0);
  const app = mountText(vue, host, items, () => String(source.value * 2));

  try {
    await vue.nextTick();
    assertRenderedTextValues(host, count, "0");

    const start = performance.now();
    source.value = 1;
    await vue.nextTick();
    const duration = performance.now() - start;

    assertRenderedTextValues(host, count, "2");
    return { samples: [duration] };
  } finally {
    app.unmount();
  }
}

async function runComputedFanIn({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const vue = await getVueRuntime();
  const host = document.createElement("div");
  const values = vue.ref(Array.from({ length: count }, (_, index) => index));
  const app = vue.createApp({
    setup() {
      return () => String(sum(values.value));
    },
  });
  app.mount(host);

  try {
    await vue.nextTick();
    assertRenderedTextValues(host, 1, String(sum(values.value)));

    const updatedValues = values.value.map((value) => value + 1);
    const start = performance.now();
    values.value = updatedValues;
    await vue.nextTick();
    const duration = performance.now() - start;

    assertRenderedTextValues(host, 1, String(sum(updatedValues)));
    return { samples: [duration] };
  } finally {
    app.unmount();
  }
}

async function runRepeatedMemory({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const vue = await getVueRuntime();
  const before = await readHeapUsedAfterForcedGc();
  const host = document.createElement("div");
  const mounted = mountRows(vue, host, []);

  try {
    for (let cycle = 0; cycle < memoryStressCycles; cycle += 1) {
      const rows = createRowsData(count);
      mounted.rows.value = rows;
      await vue.nextTick();
      validateRows(host, rows);

      mounted.rows.value = createReplacementRowsData(count);
      await vue.nextTick();

      mounted.rows.value = [];
      await vue.nextTick();
    }
  } finally {
    mounted.app.unmount();
  }

  const after = await readHeapUsedAfterForcedGc();
  return {
    samples: [calculateHeapDelta(after, before)],
    notes: [forcedGcMemoryNote],
  };
}

async function getVueRuntime(): Promise<VueRuntime> {
  vueRuntimePromise ??= import("vue");
  return vueRuntimePromise;
}

function mountRows(vue: VueRuntime, host: Element, initialRows: RowFixture[]): RowsMount {
  const rows = vue.ref(initialRows);
  const selectedId = vue.ref(-1);
  const app = vue.createApp({
    setup() {
      return () =>
        vue.h(
          vue.Fragment,
          rows.value.map((row) =>
            vue.h(
              "div",
              {
                class: selectedId.value === row.id ? "selected" : undefined,
                "data-key": String(row.id),
                "data-selected": selectedId.value === row.id ? "true" : undefined,
                key: row.id,
              },
              row.label,
            ),
          ),
        );
    },
  });

  app.mount(host);
  return { app, rows, selectedId };
}

function mountText(
  vue: VueRuntime,
  host: Element,
  items: readonly number[],
  readValue: () => string,
): App {
  const app = vue.createApp({
    setup() {
      return () =>
        vue.h(
          vue.Fragment,
          items.map((item) => vue.h("span", { key: item }, readValue())),
        );
    },
  });
  app.mount(host);
  return app;
}
