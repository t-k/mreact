import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

describe("createCleanupScope callback retention", () => {
  test("releases callback payloads after unregistering with and without a held handle", () => {
    const script = String.raw`
      import { createCleanupScope } from ${JSON.stringify(new URL("../src/cleanup-scope.ts", import.meta.url).href)};

      const scope = createCleanupScope();
      const weakReferences = [];
      let heldHandle;

      {
        const payload = { name: "dropped-handle" };
        weakReferences.push(new WeakRef(payload));
        const unregister = scope.register(() => payload.name);
        unregister();
      }

      {
        const payload = { name: "held-handle" };
        weakReferences.push(new WeakRef(payload));
        heldHandle = scope.register(() => payload.name);
        heldHandle();
      }

      const control = { name: "strong-control" };
      const controlReference = new WeakRef(control);
      globalThis.__cleanupScopeGcControl = control;

      for (let attempt = 0; attempt < 20; attempt += 1) {
        globalThis.gc();
        await new Promise((resolve) => setImmediate(resolve));
      }

      if (weakReferences.some((reference) => reference.deref() !== undefined)) {
        process.stderr.write("unregistered callback payload was retained\n");
        process.exit(1);
      }

      if (controlReference.deref() === undefined) {
        process.stderr.write("strong reference control was collected\n");
        process.exit(1);
      }

      void heldHandle;
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
