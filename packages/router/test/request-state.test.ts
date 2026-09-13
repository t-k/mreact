import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, expect, test } from "vitest";
import {
  cell,
  computed,
  effect,
  requestState,
  installRequestStateStorage,
  type RequestStateScope,
} from "@reckona/mreact-reactive-core";
import { runWithRequestStateResponse } from "../src/request-state.js";

afterEach(() => installRequestStateStorage(undefined));
const useState = requestState(() => cell("empty"));
const encoder = new TextEncoder();

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("repeated responses leave no module-cell effect subscriptions", async () => {
  installRequestStateStorage(new AsyncLocalStorage<RequestStateScope>());
  const moduleCell = cell(0);
  let runs = 0;
  const useResource = requestState(() =>
    effect(() => {
      moduleCell.get();
      runs++;
    }),
  );
  for (let i = 0; i < 50; i++) {
    const response = await runWithRequestStateResponse(async () => {
      useResource();
      return new Response("ok");
    });
    expect(await response.text()).toBe("ok");
  }
  expect(runs).toBe(50);
  moduleCell.set(1);
  await Promise.resolve();
  expect(runs).toBe(50);
});

test.each(["null", "eof", "cancel", "body-error", "cancel-error", "render-error"])(
  "propagates cleanup failures without hiding a %s failure",
  async (exit) => {
    installRequestStateStorage(new AsyncLocalStorage<RequestStateScope>());
    const cleaned: number[] = [];
    const useResource = requestState(() => {
      effect(() => () => {
        cleaned.push(1);
      });
      effect(() => () => {
        cleaned.push(2);
        throw new Error("cleanup");
      });
    });
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    let source!: ReadableStream<Uint8Array>;
    const rendered = runWithRequestStateResponse(async () => {
      useResource();
      if (exit === "null") return new Response(null, { status: 204 });
      if (exit === "render-error") throw new Error("primary");
      source = new ReadableStream({
        start(value) {
          controller = value;
        },
        cancel() {
          if (exit === "cancel-error") throw new Error("primary");
        },
      });
      return new Response(source);
    });
    if (exit === "null" || exit === "render-error") {
      await expect(rendered).rejects.toThrow(exit === "null" ? "cleanup" : "primary");
    } else {
      const response = await rendered;
      if (exit === "eof") controller.close();
      if (exit === "body-error") controller.error(new Error("primary"));
      const result = exit.startsWith("cancel") ? response.body!.cancel() : response.text();
      await expect(result).rejects.toThrow(exit.endsWith("error") ? "primary" : "cleanup");
      expect(source.locked).toBe(false);
    }
    expect(cleaned).toEqual([2, 1]);
  },
);

test.each(["eof", "error", "cancel", "cancel-error", "null", "render-error"])(
  "disposes request effects once after %s",
  async (exit) => {
    installRequestStateStorage(new AsyncLocalStorage<RequestStateScope>());
    const sourceCell = cell(0);
    let runs = 0;
    const cleaned: string[] = [];
    const useResource = requestState(() => {
      effect(() => {
        sourceCell.get();
        runs++;
        return () => {
          cleaned.push(useState().get());
        };
      });
      return computed(() => sourceCell.get());
    });
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    let source!: ReadableStream<Uint8Array>;
    const rendered = runWithRequestStateResponse(async () => {
      useState().set("alice");
      useResource();
      if (exit === "render-error") throw new Error("render");
      if (exit === "null") return new Response(null, { status: 204 });
      source = new ReadableStream({
        start(value) {
          controller = value;
        },
        cancel() {
          expect(useResource().get()).toBe(0);
          if (exit === "cancel-error") throw new Error("cancel");
        },
      });
      return new Response(source);
    });
    if (exit === "render-error") await expect(rendered).rejects.toThrow("render");
    else {
      const response = await rendered;
      if (exit !== "null") {
        expect(cleaned).toEqual([]);
        if (exit === "eof") {
          controller.enqueue(encoder.encode("ok"));
          controller.close();
          expect(await response.text()).toBe("ok");
        } else if (exit === "error") {
          controller.error(new Error("body"));
          await expect(response.text()).rejects.toThrow("body");
        } else if (exit === "cancel-error") {
          await expect(response.body!.cancel()).rejects.toThrow("cancel");
        } else await response.body!.cancel();
        expect(source.locked).toBe(false);
      }
    }
    expect(cleaned).toEqual(["alice"]);
    sourceCell.set(1);
    await Promise.resolve();
    expect(runs).toBe(1);
  },
);

test.each([false, true])(
  "waits for asynchronous cancellation despite a pending read (reject=%s)",
  async (fail) => {
    installRequestStateStorage(new AsyncLocalStorage<RequestStateScope>());
    const gate = deferred();
    const started = deferred();
    let cleanups = 0;
    const useResource = requestState(() => {
      effect(() => () => {
        cleanups++;
      });
      return computed(() => "alive");
    });
    let source!: ReadableStream<Uint8Array>;
    const response = await runWithRequestStateResponse(async () => {
      useResource();
      source = new ReadableStream({
        async cancel() {
          started.resolve();
          await gate.promise;
          expect(cleanups).toBe(0);
          expect(useResource().get()).toBe("alive");
          if (fail) throw new Error("cancel");
        },
      });
      return new Response(source);
    });
    const reader = response.body!.getReader();
    const pending = reader.read();
    const cancelled = reader.cancel("disconnect");
    await started.promise;
    expect(await pending).toEqual({ done: true, value: undefined });
    expect(cleanups).toBe(0);
    expect(source.locked).toBe(true);
    gate.resolve();
    if (fail) await expect(cancelled).rejects.toThrow("cancel");
    else await cancelled;
    expect(cleanups).toBe(1);
    expect(source.locked).toBe(false);
    reader.releaseLock();
  },
);

test("binds delayed stream pulls to the original native request scope", async () => {
  installRequestStateStorage(new AsyncLocalStorage<RequestStateScope>());
  const gate = deferred();
  const response = await runWithRequestStateResponse(async () => {
    useState().set("alice");
    return new Response(
      new ReadableStream({
        async pull(controller) {
          await gate.promise;
          controller.enqueue(encoder.encode(useState().get()));
          controller.close();
        },
      }),
    );
  });
  const other = await runWithRequestStateResponse(async () => {
    expect(useState().get()).toBe("empty");
    useState().set("bob");
    return new Response(useState().get());
  });
  gate.resolve();
  expect(await response.text()).toBe("alice");
  expect(await other.text()).toBe("bob");
});

test("fails closed without async context while preserving unrelated open streams", async () => {
  installRequestStateStorage(undefined);
  await expect(
    runWithRequestStateResponse(async () => {
      useState().set("alice");
      return new Response(useState().get());
    }),
  ).rejects.toThrow(/scope/);
  const stream = new ReadableStream<Uint8Array>();
  const response = await runWithRequestStateResponse(async () => new Response(stream));
  expect(response.body).toBe(stream);
  const health = await runWithRequestStateResponse(async () => new Response("ok"));
  expect(await health.text()).toBe("ok");
  await response.body!.cancel();
});

test("keeps detached work from a completed native request out of the next request", async () => {
  installRequestStateStorage(new AsyncLocalStorage<RequestStateScope>());
  const gate = deferred();
  let background!: Promise<void>;
  const first = await runWithRequestStateResponse(async () => {
    useState().set("alice");
    background = gate.promise.then(() => {
      expect(useState().get()).toBe("alice");
      useState().set("alice-signed-url");
    });
    return new Response("done");
  });
  await first.text();
  const second = await runWithRequestStateResponse(async () => {
    useState().set("bob");
    gate.resolve();
    await background;
    return new Response(useState().get());
  });
  expect(await second.text()).toBe("bob");
});

test("preserves null bodies, status and headers in a native scope", async () => {
  installRequestStateStorage(new AsyncLocalStorage<RequestStateScope>());
  const original = new Response(null, { status: 302, headers: { location: "/login" } });
  expect(await runWithRequestStateResponse(async () => original)).toBe(original);
  const response = await runWithRequestStateResponse(
    async () => new Response("body", { status: 201, headers: { "x-test": "preserved" } }),
  );
  expect(response.status).toBe(201);
  expect(response.headers.get("x-test")).toBe("preserved");
  expect(await response.text()).toBe("body");
});

test("runs stream cancellation in its original request scope and unlocks the source", async () => {
  installRequestStateStorage(new AsyncLocalStorage<RequestStateScope>());
  let source!: ReadableStream<Uint8Array>;
  const reasons: unknown[] = [];
  const response = await runWithRequestStateResponse(async () => {
    useState().set("alice");
    source = new ReadableStream({
      cancel(reason) {
        reasons.push([reason, useState().get()]);
      },
    });
    return new Response(source);
  });
  await response.body!.cancel("disconnected");
  expect(reasons).toEqual([["disconnected", "alice"]]);
  expect(source.locked).toBe(false);
});

test("propagates body and cancellation failures without retaining reader locks", async () => {
  installRequestStateStorage(new AsyncLocalStorage<RequestStateScope>());
  let source!: ReadableStream<Uint8Array>;
  const response = await runWithRequestStateResponse(async () => {
    source = new ReadableStream({
      start(controller) {
        controller.error(new Error("broken"));
      },
    });
    return new Response(source);
  });
  await expect(response.text()).rejects.toThrow("broken");
  expect(source.locked).toBe(false);
  const cancelled = await runWithRequestStateResponse(async () => {
    source = new ReadableStream({
      cancel() {
        throw new Error("cancelled");
      },
    });
    return new Response(source);
  });
  await expect(cancelled.body!.cancel()).rejects.toThrow("cancelled");
  expect(source.locked).toBe(false);
});
