import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

describe("effect manual disposal retention", () => {
  test("releases effect closures after a manual stop while the parent scope stays alive", () => {
    const script = String.raw`
      import { cell, createCleanupScope, effect, runWithCleanupScope } from ${JSON.stringify(new URL("../src/index.ts", import.meta.url).href)};

      const scope = createCleanupScope();
      const count = cell(0);
      const weakReferences = [];
      let heldStop;

      {
        const payload = { name: "dropped-handle" };
        weakReferences.push(new WeakRef(payload));
        runWithCleanupScope(scope, () => {
          const stop = effect(() => {
            count.get();
            void payload.name;
          });
          stop();
        });
      }

      {
        const payload = { name: "held-handle" };
        weakReferences.push(new WeakRef(payload));
        heldStop = runWithCleanupScope(scope, () =>
          effect(() => {
            count.get();
            void payload.name;
            return () => {
              void payload.name;
            };
          }),
        );
        heldStop();
      }

      {
        const payload = { name: "throwing-cleanup" };
        weakReferences.push(new WeakRef(payload));
        runWithCleanupScope(scope, () => {
          const stop = effect(() => {
            count.get();
            void payload.name;
            return () => {
              throw new Error("cleanup failed for " + payload.name);
            };
          });
          try {
            stop();
          } catch (error) {
            if (String(error.message) !== "cleanup failed for throwing-cleanup") {
              process.stderr.write("unexpected cleanup error: " + String(error.message) + "\n");
              process.exit(1);
            }
          }
        });
      }

      const control = { name: "strong-control" };
      const controlReference = new WeakRef(control);
      globalThis.__effectDisposeGcControl = control;

      for (let attempt = 0; attempt < 20; attempt += 1) {
        globalThis.gc();
        await new Promise((resolve) => setImmediate(resolve));
      }

      const retained = weakReferences
        .map((reference) => reference.deref())
        .filter((payload) => payload !== undefined)
        .map((payload) => payload.name);

      if (retained.length > 0) {
        process.stderr.write("stopped effect payload was retained: " + retained.join(", ") + "\n");
        process.exit(1);
      }

      if (controlReference.deref() === undefined) {
        process.stderr.write("strong reference control was collected\n");
        process.exit(1);
      }

      if (scope.disposed) {
        process.stderr.write("parent scope was disposed by a manual effect stop\n");
        process.exit(1);
      }

      void heldStop;
      void count;
      void scope;
    `;

    expect(() =>
      execFileSync(
        process.execPath,
        ["--expose-gc", "--import", "tsx", "--input-type=module", "-e", script],
        { cwd: process.cwd(), encoding: "utf8", stdio: "pipe" },
      ),
    ).not.toThrow();
  });
});
