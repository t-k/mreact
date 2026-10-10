import { describe, expect, test, vi } from "vitest";
import {
  createRootRuntime,
  renderWithRootRuntime,
  runWithHostCommit,
  useEffect,
  useState,
  useSyncExternalStore,
} from "../src/hooks.js";

function stateRuntime() {
  const rerender = vi.fn();
  const runtime = createRootRuntime(rerender);
  let setValue!: (value: unknown) => void;
  runtime.beginRender();
  renderWithRootRuntime(runtime, "0", () => {
    [, setValue] = useState<unknown>(0);
  });
  runtime.endRender();
  const slot = runtime.instances.get("0")!.hooks[0]!;
  return { runtime, rerender, setValue, slot };
}

describe("commit rerender work", () => {
  test("host commits check dirty instances without materializing a root-sized array", () => {
    const { runtime, rerender, setValue } = stateRuntime();
    runWithHostCommit(() => setValue(1));
    const from = vi.spyOn(Array, "from");
    try {
      runtime.flushEffects();
      expect(rerender).toHaveBeenCalledOnce();
      expect(from).not.toHaveBeenCalled();
    } finally {
      from.mockRestore();
      runtime.dispose();
    }
  });

  test("effect callback updates check dirty instances without a root-sized array", () => {
    const { runtime, rerender, setValue } = stateRuntime();
    const from = vi.spyOn(Array, "from");
    try {
      runtime.beginRender();
      renderWithRootRuntime(runtime, "0", () => {
        useState(0);
        useEffect(() => setValue(1), []);
      });
      runtime.endRender();
      runtime.flushEffects();
      expect(rerender).toHaveBeenCalledOnce();
      expect(from).not.toHaveBeenCalled();
    } finally {
      from.mockRestore();
      runtime.dispose();
    }
  });
});
