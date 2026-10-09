import { describe, expect, test, vi } from "vitest";
import {
  createRootRuntime,
  renderWithProfiler,
  retainMountedProfilerPaths,
} from "../src/hooks.js";

describe("render attempt resource ownership", () => {
  test("empty effect queues avoid draining and still report mutation errors", () => {
    const runtime = createRootRuntime(() => {});
    const queues = [runtime.pendingInsertionEffects, runtime.pendingImperativeHandleEffects,
      runtime.pendingLayoutEffects, runtime.pendingEffects];
    const drains = queues.map(queue => vi.spyOn(queue, "splice"));
    const error = new Error("mutation failed");
    runtime.externalStoreUpdate = true;
    runtime.reportMutationEffectErrors([error]);
    expect(() => runtime.flushEffects()).toThrow(error);
    expect(runtime.externalStoreUpdate).toBe(false);
    expect(runtime.effectFlushPhase).toBeUndefined();
    expect(runtime.profilerFlushDepth).toBe(0);
    for (const drain of drains) expect(drain).not.toHaveBeenCalled();
    expect(() => runtime.flushEffects()).not.toThrow();
  });

  test("attempts without Profilers do not allocate a path set", () => {
    const runtime = createRootRuntime(() => {});
    const mounted = runtime.mountedProfilerPaths;
    runtime.beginRender();
    expect(runtime.activeProfilerPaths).toBeUndefined();
    runtime.endRender();
    expect(runtime.mountedProfilerPaths).toBe(mounted);
    expect([...mounted]).toEqual([]);
  });

  test("only committed attempts transfer Profiler ownership", () => {
    const runtime = createRootRuntime(() => {});
    const phases: string[] = [];
    const props = { id: "panel", onRender: (_id: string, phase: string) => phases.push(phase) };
    runtime.beginRender();
    renderWithProfiler(runtime, "0.panel", props, () => {});
    const firstAttempt = runtime.activeProfilerPaths;
    runtime.endRender();
    expect(runtime.mountedProfilerPaths).toBe(firstAttempt);
    expect(runtime.activeProfilerPaths).toBeUndefined();
    expect(phases).toEqual(["mount"]);

    runtime.beginRender();
    renderWithProfiler(runtime, "0.aborted", props, () => {});
    expect(runtime.activeProfilerPaths).not.toBe(firstAttempt);
    runtime.endRender(false);
    expect(runtime.mountedProfilerPaths).toBe(firstAttempt);
    expect([...runtime.mountedProfilerPaths]).toEqual(["0.panel"]);
    expect(phases).toEqual(["mount"]);

    runtime.beginRender();
    retainMountedProfilerPaths(runtime, "0");
    const retained = runtime.activeProfilerPaths;
    expect([...retained!]).toEqual(["0.panel"]);
    runtime.endRender();
    expect(runtime.mountedProfilerPaths).toBe(retained);

    runtime.beginRender();
    renderWithProfiler(runtime, "0.panel", props, () => {});
    runtime.endRender();
    expect(phases).toEqual(["mount", "update"]);
    runtime.beginRender();
    runtime.endRender();
    expect([...runtime.mountedProfilerPaths]).toEqual([]);
    expect([...firstAttempt!]).toEqual(["0.panel"]);
    runtime.beginRender();
    renderWithProfiler(runtime, "0.panel", props, () => {});
    runtime.endRender();
    expect(phases).toEqual(["mount", "update", "mount"]);
  });

  test("Profiler commit callbacks can start a fresh attempt on the same root", () => {
    const runtime = createRootRuntime(() => {});
    const phases: string[] = [];
    const props = { id: "panel", onRender: (_id: string, phase: string) => {
      phases.push(phase);
      expect(runtime.activeProfilerPaths).toBeUndefined();
      if (phase === "mount") {
        const mounted = runtime.mountedProfilerPaths;
        runtime.beginRender();
        renderWithProfiler(runtime, "0.panel", props, () => {});
        expect(runtime.activeProfilerPaths).not.toBe(mounted);
        runtime.endRender();
      }
    } };
    runtime.beginRender();
    renderWithProfiler(runtime, "0.panel", props, () => {});
    runtime.endRender();
    expect(phases).toEqual(["mount", "nested-update"]);
    expect([...runtime.mountedProfilerPaths]).toEqual(["0.panel"]);
  });

  test("recording outside an attempt cannot create active Profiler ownership", () => {
    const runtime = createRootRuntime(() => {});
    runtime.mountedProfilerPaths.add("0.panel");
    retainMountedProfilerPaths(runtime, "0");
    renderWithProfiler(runtime, "0.other", {}, () => {});
    expect(runtime.activeProfilerPaths).toBeUndefined();
    expect([...runtime.mountedProfilerPaths]).toEqual(["0.panel"]);
  });

  test("a bailout retains exactly its own Profiler path and descendants", () => {
    const runtime = createRootRuntime(() => {});
    const phases: Array<[string, string]> = [];
    const paths = ["0.panel", "0.panel.child", "0.panels", "0.sibling"];
    const render = (path: string) => renderWithProfiler(runtime, path, {
      id: path, onRender: (id: string, phase: string) => phases.push([id, phase]),
    }, () => {});
    runtime.beginRender();
    for (const path of paths) render(path);
    runtime.endRender();
    runtime.beginRender();
    retainMountedProfilerPaths(runtime, "0.panel");
    runtime.endRender();
    phases.length = 0;
    runtime.beginRender();
    for (const path of paths) render(path);
    runtime.endRender();
    expect(phases).toEqual([["0.panel", "update"], ["0.panel.child", "update"],
      ["0.panels", "mount"], ["0.sibling", "mount"]]);
  });
});
