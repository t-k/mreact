import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, expect, test } from "vitest";
import {
  cell,
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
