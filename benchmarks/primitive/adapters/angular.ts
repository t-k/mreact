import "zone.js";
import "@angular/compiler";
import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  type ComponentRef,
  createComponent,
  signal,
} from "@angular/core";
import type { WritableSignal } from "@angular/core";
import { createApplication } from "@angular/platform-browser";
import type { ApplicationRef as BrowserApplicationRef } from "@angular/core";
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

interface AngularMount<T> {
  app: BrowserApplicationRef;
  ref: ComponentRef<T>;
}

interface RowsComponentShape {
  rows: WritableSignal<RowFixture[]>;
  selectedId: WritableSignal<number>;
}

interface ItemsComponentShape {
  items: WritableSignal<number[]>;
}

interface TextComponentShape extends ItemsComponentShape {
  value: WritableSignal<string>;
}

interface AggregateComponentShape {
  values: WritableSignal<number[]>;
  total(): number;
}

export const angularPrimitiveAdapter: PrimitiveAdapter = {
  fixtureKind: "framework-runtime",
  name: "angular",
  version: readPackageVersion("@angular/core"),
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

class RowsComponent implements RowsComponentShape {
  rows = signal<RowFixture[]>([]);
  selectedId = signal(-1);
}

Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  template: `@for (row of rows(); track row.id) {<div [attr.data-key]="row.id" [class.selected]="selectedId() === row.id" [attr.data-selected]="selectedId() === row.id ? 'true' : null">{{ row.label }}</div>}`,
})(RowsComponent);

class EventTargetsComponent implements ItemsComponentShape {
  items = signal<number[]>([]);
  onClick() {}
}

Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  template: `@for (item of items(); track item) {<button type="button" [attr.data-index]="item" (click)="onClick()">{{ item }}</button>}`,
})(EventTargetsComponent);

class TextComponent implements TextComponentShape {
  items = signal<number[]>([]);
  value = signal("0");
}

Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  template: `@for (item of items(); track item) {{{ value() }}}`,
})(TextComponent);

class FanOutComponent implements TextComponentShape {
  items = signal<number[]>([]);
  value = signal("0");
  output(): string {
    return String(Number(this.value()) * 2);
  }
}

Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  template: `@for (item of items(); track item) {{{ output() }}}`,
})(FanOutComponent);

class AggregateComponent implements AggregateComponentShape {
  values = signal<number[]>([]);
  total(): number {
    return sum(this.values());
  }
}

Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  template: `{{ total() }}`,
})(AggregateComponent);

async function runCreateRows({ count, document }: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("bench-angular-rows");
  const rows = createRowsData(count);
  const app = await createApplication({ providers: [] });
  const start = performance.now();
  const ref = createComponent(RowsComponent, {
    environmentInjector: app.injector,
    hostElement: host,
  });
  ref.instance.rows.set(rows);
  app.injector.get(ApplicationRef).attachView(ref.hostView);
  ref.changeDetectorRef.detectChanges();
  const duration = performance.now() - start;

  try {
    validateRows(host, rows);
    return { samples: [duration] };
  } finally {
    ref.destroy();
    app.destroy();
  }
}

async function runReplaceAllRows({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("bench-angular-rows");
  const rows = createRowsData(count);
  const replacementRows = createReplacementRowsData(count);
  const mounted = await mountRows(host, rows);

  try {
    validateRows(host, rows);

    const start = performance.now();
    mounted.ref.instance.rows.set(replacementRows);
    mounted.ref.changeDetectorRef.detectChanges();
    const duration = performance.now() - start;

    validateRows(host, replacementRows);
    return { samples: [duration] };
  } finally {
    destroyAngularMount(mounted);
  }
}

async function runUpdateEveryTenth({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("bench-angular-rows");
  const rows = createRowsData(count);
  const updatedRows = updateEveryTenth(rows);
  const mounted = await mountRows(host, rows);

  try {
    validateRows(host, rows);

    const start = performance.now();
    mounted.ref.instance.rows.set(updatedRows);
    mounted.ref.changeDetectorRef.detectChanges();
    const duration = performance.now() - start;

    validateRows(host, updatedRows);
    return { samples: [duration] };
  } finally {
    destroyAngularMount(mounted);
  }
}

async function runSelectRow({ count, document }: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("bench-angular-rows");
  const rows = createRowsData(count);
  const selectedId = Math.floor(count / 2);
  const mounted = await mountRows(host, rows);

  try {
    validateRows(host, rows);

    const start = performance.now();
    mounted.ref.instance.selectedId.set(selectedId);
    mounted.ref.changeDetectorRef.detectChanges();
    const duration = performance.now() - start;

    validateRows(host, rows);
    validateSelectedRow(host, selectedId);
    return { samples: [duration] };
  } finally {
    destroyAngularMount(mounted);
  }
}

async function runAppendRows({ count, document }: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("bench-angular-rows");
  const rows = createRowsData(count);
  const appendedRows = [...rows, ...createRowsDataFrom(count, 1_000)];
  const mounted = await mountRows(host, rows);

  try {
    validateRows(host, rows);

    const start = performance.now();
    mounted.ref.instance.rows.set(appendedRows);
    mounted.ref.changeDetectorRef.detectChanges();
    const duration = performance.now() - start;

    validateRows(host, appendedRows);
    return { samples: [duration] };
  } finally {
    destroyAngularMount(mounted);
  }
}

async function runRemoveRow({ count, document }: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("bench-angular-rows");
  const rows = createRowsData(count);
  const remainingRows = rows.filter((_, index) => index !== Math.floor(count / 2));
  const mounted = await mountRows(host, rows);

  try {
    validateRows(host, rows);

    const start = performance.now();
    mounted.ref.instance.rows.set(remainingRows);
    mounted.ref.changeDetectorRef.detectChanges();
    const duration = performance.now() - start;

    validateRows(host, remainingRows);
    return { samples: [duration] };
  } finally {
    destroyAngularMount(mounted);
  }
}

async function runClearRows({ count, document }: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("bench-angular-rows");
  const rows = createRowsData(count);
  const mounted = await mountRows(host, rows);

  try {
    validateRows(host, rows);

    const start = performance.now();
    mounted.ref.instance.rows.set([]);
    mounted.ref.changeDetectorRef.detectChanges();
    const duration = performance.now() - start;

    validateRows(host, []);
    return { samples: [duration] };
  } finally {
    destroyAngularMount(mounted);
  }
}

async function runKeyedReverse({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("bench-angular-rows");
  const rows = createRowsData(count);
  const mounted = await mountRows(host, rows);

  try {
    validateRows(host, rows);
    const initialNodes = [...host.children];

    const start = performance.now();
    mounted.ref.instance.rows.set([...rows].reverse());
    mounted.ref.changeDetectorRef.detectChanges();
    const duration = performance.now() - start;

    validateRowsReversedWithNodeIdentity(host, rows, initialNodes);
    return { samples: [duration] };
  } finally {
    destroyAngularMount(mounted);
  }
}

async function runCreateEventTargets({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("bench-angular-events");
  const items = Array.from({ length: count }, (_, index) => index);
  const app = await createApplication({ providers: [] });
  const start = performance.now();
  const ref = createComponent(EventTargetsComponent, {
    environmentInjector: app.injector,
    hostElement: host,
  });
  ref.instance.items.set(items);
  app.injector.get(ApplicationRef).attachView(ref.hostView);
  ref.changeDetectorRef.detectChanges();
  const duration = performance.now() - start;

  try {
    validateEventTargets(host, count);
    return { samples: [duration] };
  } finally {
    ref.destroy();
    app.destroy();
  }
}

async function runTextBindingUpdate({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("bench-angular-text");
  const items = Array.from({ length: count }, (_, index) => index);
  const mounted = await mountText(host, TextComponent, items);

  try {
    assertRenderedTextValues(host, count, "0");

    const start = performance.now();
    mounted.ref.instance.value.set("1");
    mounted.ref.changeDetectorRef.detectChanges();
    const duration = performance.now() - start;

    assertRenderedTextValues(host, count, "1");
    return { samples: [duration] };
  } finally {
    destroyAngularMount(mounted);
  }
}

async function runComputedFanOut({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("bench-angular-fan-out");
  const items = Array.from({ length: count }, (_, index) => index);
  const mounted = await mountText(host, FanOutComponent, items);

  try {
    assertRenderedTextValues(host, count, "0");

    const start = performance.now();
    mounted.ref.instance.value.set("1");
    mounted.ref.changeDetectorRef.detectChanges();
    const duration = performance.now() - start;

    assertRenderedTextValues(host, count, "2");
    return { samples: [duration] };
  } finally {
    destroyAngularMount(mounted);
  }
}

async function runComputedFanIn({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("bench-angular-aggregate");
  const values = Array.from({ length: count }, (_, index) => index);
  const mounted = await mountAggregate(host, values);

  try {
    assertRenderedTextValues(host, 1, String(sum(values)));

    const updatedValues = values.map((value) => value + 1);
    const start = performance.now();
    mounted.ref.instance.values.set(updatedValues);
    mounted.ref.changeDetectorRef.detectChanges();
    const duration = performance.now() - start;

    assertRenderedTextValues(host, 1, String(sum(updatedValues)));
    return { samples: [duration] };
  } finally {
    destroyAngularMount(mounted);
  }
}

async function runRepeatedMemory({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const before = await readHeapUsedAfterForcedGc();
  const host = document.createElement("bench-angular-memory");
  const mounted = await mountRows(host, []);

  try {
    for (let cycle = 0; cycle < memoryStressCycles; cycle += 1) {
      const rows = createRowsData(count);
      mounted.ref.instance.rows.set(rows);
      mounted.ref.changeDetectorRef.detectChanges();
      validateRows(host, rows);

      mounted.ref.instance.rows.set(createReplacementRowsData(count));
      mounted.ref.changeDetectorRef.detectChanges();

      mounted.ref.instance.rows.set([]);
      mounted.ref.changeDetectorRef.detectChanges();
    }
  } finally {
    destroyAngularMount(mounted);
  }

  const after = await readHeapUsedAfterForcedGc();
  return {
    samples: [calculateHeapDelta(after, before)],
    notes: [forcedGcMemoryNote],
  };
}

async function mountRows(
  host: Element,
  rows: RowFixture[],
): Promise<AngularMount<RowsComponentShape>> {
  const app = await createApplication({ providers: [] });
  const ref = createComponent(RowsComponent, {
    environmentInjector: app.injector,
    hostElement: host,
  }) as ComponentRef<RowsComponentShape>;

  ref.instance.rows.set(rows);
  app.injector.get(ApplicationRef).attachView(ref.hostView);
  ref.changeDetectorRef.detectChanges();
  return { app, ref };
}

async function mountText<T extends TextComponentShape>(
  host: Element,
  componentType: new () => T,
  items: number[],
): Promise<AngularMount<T>> {
  const app = await createApplication({ providers: [] });
  const ref = createComponent(componentType, {
    environmentInjector: app.injector,
    hostElement: host,
  });

  ref.instance.items.set(items);
  app.injector.get(ApplicationRef).attachView(ref.hostView);
  ref.changeDetectorRef.detectChanges();
  return { app, ref };
}

async function mountAggregate(
  host: Element,
  values: number[],
): Promise<AngularMount<AggregateComponentShape>> {
  const app = await createApplication({ providers: [] });
  const ref = createComponent(AggregateComponent, {
    environmentInjector: app.injector,
    hostElement: host,
  }) as ComponentRef<AggregateComponentShape>;

  ref.instance.values.set(values);
  app.injector.get(ApplicationRef).attachView(ref.hostView);
  ref.changeDetectorRef.detectChanges();
  return { app, ref };
}

function destroyAngularMount(mount: AngularMount<unknown>): void {
  mount.ref.destroy();
  mount.app.destroy();
}
