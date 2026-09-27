import { describe, expect, it, vi } from "vitest";
import { createForm } from "../../forms/src/index.js";
import { createFormMutationFlow, createQueryClient } from "../src/index.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("form mutation flow", () => {
  it("validates before optimistic patching, then returns server data and invalidates queries", async () => {
    const client = createQueryClient();
    const form = createForm({
      initialValues: { name: "old" },
      validate: { name: (name) => (name.length > 0 ? [] : ["Required"]) },
    });
    const projectKey = ["project", 1] as const;
    const listKey = ["projects"] as const;
    client.setQueryData(projectKey, { id: 1, name: "old", status: "open" });
    client.setQueryData(listKey, [1]);
    await form.setValue("name", "new");
    const server = deferred<{ ok: true; data: { savedName: string } }>();
    const execute = vi.fn(() => server.promise);
    const flow = createFormMutationFlow(client, form, {
      server: execute,
      invalidate: [listKey],
      optimistic: {
        queryKey: projectKey,
        patch: (values: { name: string }) => ({ name: values.name }),
      },
    });

    const submission = flow.submit();
    await vi.waitFor(() =>
      expect(client.getQueryData(projectKey)).toEqual({ id: 1, name: "new", status: "open" }),
    );
    expect(execute).toHaveBeenCalledWith({ name: "new" });
    expect(client.getQueryEntry(listKey)?.stale).toBe(false);
    server.resolve({ ok: true, data: { savedName: "new" } });

    await expect(submission).resolves.toEqual({ status: "success", data: { savedName: "new" } });
    expect(client.getQueryEntry(listKey)?.stale).toBe(true);
  });

  it("does not call the server or patch cache when form validation fails", async () => {
    const client = createQueryClient();
    const form = createForm({
      initialValues: { name: "" },
      validate: { name: (name) => (name.length > 0 ? [] : ["Required"]) },
    });
    const key = ["project", 1] as const;
    client.setQueryData(key, { name: "old" });
    const server = vi.fn(async (_values: { name: string }) => ({ ok: true as const, data: 1 }));
    const flow = createFormMutationFlow(client, form, {
      server,
      optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
    });

    await expect(flow.submit()).resolves.toMatchObject({ status: "invalid" });
    expect(server).not.toHaveBeenCalled();
    expect(client.getQueryData(key)).toEqual({ name: "old" });
  });

  it("rolls back only its own field delta and returns server field errors", async () => {
    const client = createQueryClient();
    const form = createForm({ initialValues: { name: "new" } });
    const key = ["project", 1] as const;
    client.setQueryData(key, { name: "old", status: "open" });
    const server = deferred<{ ok: false; errors: { fieldErrors: { name: string[] } } }>();
    const flow = createFormMutationFlow(client, form, {
      server: () => server.promise,
      optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
    });

    const submission = flow.submit();
    await vi.waitFor(() =>
      expect(client.getQueryData(key)).toEqual({ name: "new", status: "open" }),
    );
    client.setQueryData(key, (previous: { name: string; status: string } | undefined) => ({
      ...previous!,
      status: "done",
    }));
    server.resolve({ ok: false, errors: { fieldErrors: { name: ["Already used"] } } });

    await expect(submission).resolves.toEqual({
      status: "server-errors",
      errors: { fieldErrors: { name: ["Already used"] } },
    });
    expect(client.getQueryData(key)).toEqual({ name: "old", status: "done" });
    expect(form.state.get().errors.name).toEqual(["Already used"]);
  });

  it("preserves a later success on the same field when an older mutation fails", async () => {
    const client = createQueryClient();
    const key = ["project", 1] as const;
    client.setQueryData(key, { name: "base" });
    const firstServer = deferred<{ ok: false; errors: { formErrors: string[] } }>();
    const secondServer = deferred<{ ok: true; data: string }>();
    const first = createFormMutationFlow(client, createForm({ initialValues: { name: "first" } }), {
      server: () => firstServer.promise,
      optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
    });
    const second = createFormMutationFlow(
      client,
      createForm({ initialValues: { name: "second" } }),
      {
        server: () => secondServer.promise,
        optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
      },
    );

    const firstSubmission = first.submit();
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual({ name: "first" }));
    const secondSubmission = second.submit();
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual({ name: "second" }));
    secondServer.resolve({ ok: true, data: "second" });
    await expect(secondSubmission).resolves.toMatchObject({ status: "success" });
    firstServer.resolve({ ok: false, errors: { formErrors: ["Rejected"] } });
    await expect(firstSubmission).resolves.toMatchObject({ status: "server-errors" });

    expect(client.getQueryData(key)).toEqual({ name: "second" });
  });

  it("removes both failed optimistic edits on one field regardless of failure order", async () => {
    const client = createQueryClient();
    const key = ["project", 1] as const;
    client.setQueryData(key, { name: "base" });
    const firstServer = deferred<{ ok: false; errors: { formErrors: string[] } }>();
    const secondServer = deferred<{ ok: false; errors: { formErrors: string[] } }>();
    const first = createFormMutationFlow(client, createForm({ initialValues: { name: "first" } }), {
      server: () => firstServer.promise,
      optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
    });
    const second = createFormMutationFlow(
      client,
      createForm({ initialValues: { name: "second" } }),
      {
        server: () => secondServer.promise,
        optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
      },
    );

    const firstSubmission = first.submit();
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual({ name: "first" }));
    const secondSubmission = second.submit();
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual({ name: "second" }));
    firstServer.resolve({ ok: false, errors: { formErrors: ["First failed"] } });
    await firstSubmission;
    expect(client.getQueryData(key)).toEqual({ name: "second" });
    secondServer.resolve({ ok: false, errors: { formErrors: ["Second failed"] } });
    await secondSubmission;

    expect(client.getQueryData(key)).toEqual({ name: "base" });
  });

  it("does not overwrite an unrelated external update to its optimistic field", async () => {
    const client = createQueryClient();
    const form = createForm({ initialValues: { name: "optimistic" } });
    const key = ["project", 1] as const;
    client.setQueryData(key, { name: "base" });
    const server = deferred<{ ok: false; errors: { formErrors: string[] } }>();
    const flow = createFormMutationFlow(client, form, {
      server: () => server.promise,
      optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
    });

    const submission = flow.submit();
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual({ name: "optimistic" }));
    client.setQueryData(key, { name: "external" });
    server.resolve({ ok: false, errors: { formErrors: ["Rejected"] } });
    await submission;

    expect(client.getQueryData(key)).toEqual({ name: "external" });
    expect(client.getQueryEntry(key)?.stale).toBe(true);
  });

  it("restores the base value when two same-field mutations fail in reverse order", async () => {
    const client = createQueryClient();
    const key = ["project", 2] as const;
    client.setQueryData(key, { name: "base" });
    const firstServer = deferred<{ ok: false; errors: { formErrors: string[] } }>();
    const secondServer = deferred<{ ok: false; errors: { formErrors: string[] } }>();
    const first = createFormMutationFlow(client, createForm({ initialValues: { name: "first" } }), {
      server: () => firstServer.promise,
      optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
    });
    const second = createFormMutationFlow(
      client,
      createForm({ initialValues: { name: "second" } }),
      {
        server: () => secondServer.promise,
        optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
      },
    );

    const firstSubmission = first.submit();
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual({ name: "first" }));
    const secondSubmission = second.submit();
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual({ name: "second" }));
    secondServer.resolve({ ok: false, errors: { formErrors: ["Second failed"] } });
    await secondSubmission;
    expect(client.getQueryData(key)).toEqual({ name: "first" });
    firstServer.resolve({ ok: false, errors: { formErrors: ["First failed"] } });
    await firstSubmission;
    expect(client.getQueryData(key)).toEqual({ name: "base" });
  });

  it("suppresses duplicate submits and keeps a single optimistic edit", async () => {
    const client = createQueryClient();
    const form = createForm({ initialValues: { name: "new" } });
    const key = ["project", 3] as const;
    client.setQueryData(key, { name: "old" });
    const server = deferred<{ ok: true; data: number }>();
    const execute = vi.fn(() => server.promise);
    const patch = vi.fn((values: { name: string }) => ({ name: values.name }));
    const flow = createFormMutationFlow(client, form, {
      server: execute,
      optimistic: { queryKey: key, patch },
    });

    const firstSubmission = flow.submit();
    await expect(flow.submit()).resolves.toEqual({ status: "duplicate" });
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual({ name: "new" }));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledTimes(1);
    server.resolve({ ok: true, data: 1 });
    await expect(firstSubmission).resolves.toEqual({ status: "success", data: 1 });
  });

  it("does not patch absent records and still performs the server mutation", async () => {
    const client = createQueryClient();
    const form = createForm({ initialValues: { name: "new" } });
    const key = ["missing"] as const;
    const patch = vi.fn(() => ({ name: "new" }));
    const flow = createFormMutationFlow(client, form, {
      server: async () => ({ ok: true as const, data: 1 }),
      optimistic: { queryKey: key, patch },
    });

    await expect(flow.submit()).resolves.toEqual({ status: "success", data: 1 });
    expect(patch).not.toHaveBeenCalled();
    expect(client.getQueryEntry(key)).toBeUndefined();
  });

  it("rejects dangerous patch keys before calling the server", async () => {
    const client = createQueryClient();
    const form = createForm({ initialValues: { name: "new" } });
    const key = ["project", 4] as const;
    client.setQueryData(key, { name: "old" });
    const server = vi.fn(async () => ({ ok: true as const, data: 1 }));
    const patch = JSON.parse('{"__proto__":{"polluted":true}}') as Record<string, unknown>;
    const flow = createFormMutationFlow(client, form, {
      server,
      optimistic: { queryKey: key, patch: () => patch },
    });

    await expect(flow.submit()).resolves.toMatchObject({ status: "error" });
    expect(server).not.toHaveBeenCalled();
    expect(client.getQueryData(key)).toEqual({ name: "old" });
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("rolls back when the server throws a non-validation error", async () => {
    const client = createQueryClient();
    const form = createForm({ initialValues: { name: "new" } });
    const key = ["project", 5] as const;
    client.setQueryData(key, { name: "old" });
    const failure = new Error("offline");
    const flow = createFormMutationFlow(client, form, {
      server: async () => {
        throw failure;
      },
      optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
    });

    await expect(flow.submit()).resolves.toEqual({ status: "error", error: failure });
    expect(client.getQueryData(key)).toEqual({ name: "old" });
  });

  it("rolls back an added field by deleting it", async () => {
    const client = createQueryClient();
    const key = ["project", 6] as const;
    client.setQueryData(key, { id: 6 });
    const flow = createFormMutationFlow(client, createForm({ initialValues: { name: "new" } }), {
      server: async () => ({ ok: false as const, errors: { formErrors: ["Rejected"] } }),
      optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
    });

    await expect(flow.submit()).resolves.toMatchObject({ status: "server-errors" });
    expect(client.getQueryData(key)).toEqual({ id: 6 });
    expect(Object.hasOwn(client.getQueryData(key)!, "name")).toBe(false);
  });

  it("rejects non-object patches without running the server", async () => {
    const client = createQueryClient();
    const key = ["project", 7] as const;
    client.setQueryData(key, { name: "old" });
    const server = vi.fn(async () => ({ ok: true as const, data: 1 }));
    const flow = createFormMutationFlow(client, createForm({ initialValues: { name: "new" } }), {
      server,
      optimistic: { queryKey: key, patch: () => null as never },
    });

    await expect(flow.submit()).resolves.toMatchObject({
      status: "error",
      error: new TypeError("An optimistic patch must be a plain object"),
    });
    expect(server).not.toHaveBeenCalled();
    expect(client.getQueryData(key)).toEqual({ name: "old" });
  });

  it.each(["constructor", "prototype"])("rejects the %s patch key", async (field) => {
    const client = createQueryClient();
    const key = ["project", field] as const;
    client.setQueryData(key, { name: "old" });
    const server = vi.fn(async () => ({ ok: true as const, data: 1 }));
    const flow = createFormMutationFlow(client, createForm({ initialValues: { name: "new" } }), {
      server,
      optimistic: { queryKey: key, patch: () => ({ [field]: "bad" }) },
    });

    await expect(flow.submit()).resolves.toMatchObject({ status: "error" });
    expect(server).not.toHaveBeenCalled();
    expect(client.getQueryData(key)).toEqual({ name: "old" });
  });

  it("rolls back an unaffected field when an external update conflicts with another field", async () => {
    const client = createQueryClient();
    const key = ["project", 8] as const;
    client.setQueryData(key, { name: "base", status: "open" });
    const server = deferred<{ ok: false; errors: { formErrors: string[] } }>();
    const flow = createFormMutationFlow(client, createForm({ initialValues: { name: "new" } }), {
      server: () => server.promise,
      optimistic: {
        queryKey: key,
        patch: (values: { name: string }) => ({ name: values.name, status: "closed" }),
      },
    });

    const submission = flow.submit();
    await vi.waitFor(() =>
      expect(client.getQueryData(key)).toEqual({ name: "new", status: "closed" }),
    );
    client.setQueryData(key, { name: "external", status: "closed" });
    server.resolve({ ok: false, errors: { formErrors: ["Rejected"] } });
    await submission;
    expect(client.getQueryData(key)).toEqual({ name: "external", status: "open" });
  });

  it("does not resurrect a record removed while a mutation is pending", async () => {
    const client = createQueryClient();
    const key = ["project", 9] as const;
    client.setQueryData(key, { name: "old" });
    const server = deferred<{ ok: false; errors: { formErrors: string[] } }>();
    const flow = createFormMutationFlow(client, createForm({ initialValues: { name: "new" } }), {
      server: () => server.promise,
      optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
    });

    const submission = flow.submit();
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual({ name: "new" }));
    client.removeQueries({ queryKey: key });
    server.resolve({ ok: false, errors: { formErrors: ["Rejected"] } });
    await submission;
    expect(client.getQueryEntry(key)).toBeUndefined();
  });

  it("keeps an uncontested successful patch fresh without a second cache write", async () => {
    const client = createQueryClient();
    const key = ["project", 10] as const;
    client.setQueryData(key, { name: "old" });
    const write = vi.spyOn(client, "setQueryData");
    const flow = createFormMutationFlow(client, createForm({ initialValues: { name: "new" } }), {
      server: async () => ({ ok: true as const, data: 10 }),
      optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
    });

    await expect(flow.submit()).resolves.toEqual({ status: "success", data: 10 });
    expect(client.getQueryData(key)).toEqual({ name: "new" });
    expect(client.getQueryEntry(key)?.stale).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("submits successfully without an optimistic policy", async () => {
    const client = createQueryClient();
    const server = vi.fn(async (values: { name: string }) => ({ ok: true as const, data: values.name }));
    const flow = createFormMutationFlow(client, createForm({ initialValues: { name: "saved" } }), {
      server,
    });

    await expect(flow.submit()).resolves.toEqual({ status: "success", data: "saved" });
    expect(server).toHaveBeenCalledWith({ name: "saved" });
  });
});
