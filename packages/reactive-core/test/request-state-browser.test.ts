// @vitest-environment happy-dom
import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, expect, test } from "vitest";
import {
  cell,
  computed,
  effect,
  requestState,
  runWithRequestState,
  installRequestStateStorage,
  type RequestStateScope,
} from "../src/index.js";

afterEach(() => installRequestStateStorage(undefined));

test("creates one lazy browser graph with ordinary reactive cell behavior", () => {
  let calls = 0;
  const useState = requestState(() => {
    calls++;
    const count = cell(0);
    return { count, doubled: computed(() => count.get() * 2) };
  });
  expect(calls).toBe(0);
  const state = useState();
  const seen: number[] = [];
  const dispose = effect(() => {
    seen.push(state.doubled.get());
  });
  state.count.set(1);
  state.count.update((n) => n + 1);
  state.count.setValue(3);
  expect(state.doubled.get()).toBe(6);
  expect(useState()).toBe(state);
  expect(calls).toBe(1);
  dispose();
  expect(seen[0]).toBe(0);
});

test("prefers an explicit server scope even when a document is present", () => {
  const useState = requestState(() => cell("initial"));
  useState().set("browser");
  installRequestStateStorage(new AsyncLocalStorage<RequestStateScope>());
  runWithRequestState(() => {
    expect(useState().get()).toBe("initial");
    useState().set("server");
  });
  expect(() => useState()).toThrow(/scope/);
  installRequestStateStorage(undefined);
  expect(useState().get()).toBe("browser");
});
