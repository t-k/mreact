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
    expect(client.getQueryData(key)).toEqual({ name: "new", status: "done" });
    expect(client.getQueryEntry(key)?.stale).toBe(true);
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
    const write = vi.spyOn(client, "setQueryData");
    const secondSubmission = second.submit();
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual({ name: "second" }));
    secondServer.resolve({ ok: true, data: "second" });
    await expect(secondSubmission).resolves.toMatchObject({ status: "success" });
    firstServer.resolve({ ok: false, errors: { formErrors: ["Rejected"] } });
    await expect(firstSubmission).resolves.toMatchObject({ status: "server-errors" });

    expect(client.getQueryData(key)).toEqual({ name: "second" });
    expect(write).toHaveBeenCalledTimes(1);
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
    const sibling = ["unrelated"] as const;
    client.setQueryData(key, { name: "base" });
    client.setQueryData(sibling, { untouched: true });
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
    expect(client.getQueryEntry(sibling)?.stale).toBe(false);
  });

  it("does not roll back an external same-value write after a failed mutation", async () => {
    const client = createQueryClient();
    const form = createForm({ initialValues: { name: "new" } });
    const key = ["project", 1] as const;
    client.setQueryData(key, { name: "old", status: "open" });
    const server = deferred<{ ok: false; errors: { formErrors: string[] } }>();
    const flow = createFormMutationFlow(client, form, {
      server: () => server.promise,
      optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
    });

    const submission = flow.submit();
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual({ name: "new", status: "open" }));
    client.setQueryData(key, { name: "new", status: "fresh" });
    server.resolve({ ok: false, errors: { formErrors: ["Rejected"] } });
    await submission;

    expect(client.getQueryData(key)).toEqual({ name: "new", status: "fresh" });
    expect(client.getQueryEntry(key)?.stale).toBe(true);
  });

  it("detects an external write even when the cache structurally reuses its data", async () => {
    const client = createQueryClient();
    const key = ["project", 11] as const;
    client.setQueryData(key, { name: "old" });
    const server = deferred<{ ok: false; errors: { formErrors: string[] } }>();
    const flow = createFormMutationFlow(client, createForm({ initialValues: { name: "new" } }), {
      server: () => server.promise,
      optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
    });

    const submission = flow.submit();
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual({ name: "new" }));
    const beforeWrite = client.getQueryEntry(key)!.revision;
    client.setQueryData(key, { name: "new" });
    expect(client.getQueryEntry(key)!.revision).toBeGreaterThan(beforeWrite);
    server.resolve({ ok: false, errors: { formErrors: ["Rejected"] } });
    await submission;

    expect(client.getQueryData(key)).toEqual({ name: "new" });
    expect(client.getQueryEntry(key)?.stale).toBe(true);
  });

  it("does not absorb a cache write reentered from the optimistic notification", async () => {
    const client = createQueryClient();
    const key = ["project", 12] as const;
    client.setQueryData(key, { name: "old" });
    const server = deferred<{ ok: false; errors: { formErrors: string[] } }>();
    const flow = createFormMutationFlow(client, createForm({ initialValues: { name: "new" } }), {
      server: () => server.promise,
      optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
    });
    let replaced = false;
    const unsubscribe = client.subscribe<{ name: string }>(key, (entry) => {
      if (entry.data?.name === "new" && !replaced) {
        replaced = true;
        client.setQueryData(key, { name: "new" });
      }
    }, { exact: true });

    const submission = flow.submit();
    await vi.waitFor(() => expect(replaced).toBe(true));
    server.resolve({ ok: false, errors: { formErrors: ["Rejected"] } });
    await submission;

    expect(client.getQueryData(key)).toEqual({ name: "new" });
    expect(client.getQueryEntry(key)?.stale).toBe(true);
    unsubscribe();
  });

  it("keeps the later flow revision when its optimistic write reenters an earlier write", async () => {
    const client = createQueryClient();
    const key = ["project", 15] as const;
    client.setQueryData(key, { name: "base" });
    const firstServer = deferred<{ ok: false; errors: { formErrors: string[] } }>();
    const secondServer = deferred<{ ok: false; errors: { formErrors: string[] } }>();
    const first = createFormMutationFlow(client, createForm({ initialValues: { name: "first" } }), {
      server: () => firstServer.promise,
      optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
    });
    const second = createFormMutationFlow(client, createForm({ initialValues: { name: "second" } }), {
      server: () => secondServer.promise,
      optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
    });
    let later: Promise<unknown> | undefined;
    const unsubscribe = client.subscribe<{ name: string }>(key, (entry) => {
      if (entry.data?.name === "first" && later === undefined) {
        later = second.mutation.mutate({ name: "second" });
      }
    }, { exact: true });

    const earlier = first.mutation.mutate({ name: "first" });
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual({ name: "second" }));
    secondServer.resolve({ ok: false, errors: { formErrors: ["Second failed"] } });
    await expect(later).rejects.toThrow("Server validation failed");
    expect(client.getQueryData(key)).toEqual({ name: "first" });
    firstServer.resolve({ ok: false, errors: { formErrors: ["First failed"] } });
    await expect(earlier).rejects.toThrow("Server validation failed");

    expect(client.getQueryData(key)).toEqual({ name: "base" });
    unsubscribe();
  });

  it("rolls back after a refetch starts and then fails without replacing cache data", async () => {
    const client = createQueryClient();
    const key = ["project", 13] as const;
    client.setQueryData(key, { name: "old" });
    const mutationServer = deferred<{ ok: false; errors: { formErrors: string[] } }>();
    const fetchServer = deferred<{ name: string }>();
    const flow = createFormMutationFlow(client, createForm({ initialValues: { name: "new" } }), {
      server: () => mutationServer.promise,
      optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
    });

    const submission = flow.submit();
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual({ name: "new" }));
    const dataRevision = client.getQueryEntry(key)!.revision;
    client.invalidateQueries({ queryKey: key });
    const refetch = client.fetchQuery({ queryKey: key, queryFn: () => fetchServer.promise, retry: false });
    await vi.waitFor(() => expect(client.getQueryEntry(key)?.isFetching).toBe(true));
    expect(client.getQueryEntry(key)?.revision).toBe(dataRevision);
    fetchServer.reject(new Error("offline"));
    await expect(refetch).rejects.toThrow("offline");
    mutationServer.resolve({ ok: false, errors: { formErrors: ["Rejected"] } });
    await submission;

    expect(client.getQueryData(key)).toEqual({ name: "old" });
  });

  it("does not confuse a recreated cache entry with an older matching revision", async () => {
    const client = createQueryClient();
    const key = ["project", 14] as const;
    client.setQueryData(key, { name: "old" });
    const server = deferred<{ ok: false; errors: { formErrors: string[] } }>();
    const flow = createFormMutationFlow(client, createForm({ initialValues: { name: "new" } }), {
      server: () => server.promise,
      optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
    });

    const submission = flow.submit();
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual({ name: "new" }));
    const oldRevision = client.getQueryEntry(key)!.revision;
    client.removeQueries({ queryKey: key });
    client.setQueryData(key, { name: "draft" });
    client.setQueryData(key, { name: "new", stamp: 2 });
    expect(client.getQueryEntry(key)!.revision).toBeGreaterThan(oldRevision);
    server.resolve({ ok: false, errors: { formErrors: ["Rejected"] } });
    await submission;

    expect(client.getQueryData(key)).toEqual({ name: "new", stamp: 2 });
    expect(client.getQueryEntry(key)?.stale).toBe(true);
  });

  it("does not apply server errors to a form reset during the request", async () => {
    const client = createQueryClient();
    const form = createForm({ initialValues: { name: "old" } });
    const server = deferred<{ ok: false; errors: { formErrors: string[] } }>();
    const flow = createFormMutationFlow(client, form, { server: () => server.promise });

    const submission = flow.submit();
    await vi.waitFor(() => expect(form.state.get().submitting).toBe(true));
    form.reset({ name: "reset" });
    server.resolve({ ok: false, errors: { formErrors: ["Old request"] } });

    await expect(submission).resolves.toEqual({ status: "duplicate" });
    expect(form.state.get().values.name).toBe("reset");
    expect(form.state.get().errors.root).toBeUndefined();
  });

  it("does not report a completed request as the result of a reset form", async () => {
    const client = createQueryClient();
    const form = createForm({ initialValues: { name: "old" } });
    const server = deferred<{ ok: true; data: string }>();
    const flow = createFormMutationFlow(client, form, { server: () => server.promise });

    const submission = flow.submit();
    await vi.waitFor(() => expect(form.state.get().submitting).toBe(true));
    form.reset({ name: "reset" });
    server.resolve({ ok: true, data: "saved" });

    await expect(submission).resolves.toEqual({ status: "duplicate" });
    expect(form.state.get().values.name).toBe("reset");
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

  it("preserves all fields of an external cache write after a conflicting mutation", async () => {
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
    expect(client.getQueryData(key)).toEqual({ name: "external", status: "closed" });
    expect(client.getQueryEntry(key)?.stale).toBe(true);
  });

  it("does not resurrect a record removed while a mutation is pending", async () => {
    const client = createQueryClient();
    const key = ["project", 9] as const;
    const sibling = ["unrelated", 9] as const;
    client.setQueryData(key, { name: "old" });
    client.setQueryData(sibling, { untouched: true });
    const server = deferred<{ ok: false; errors: { formErrors: string[] } }>();
    const flow = createFormMutationFlow(client, createForm({ initialValues: { name: "new" } }), {
      server: () => server.promise,
      optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
    });

    const submission = flow.submit();
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual({ name: "new" }));
    client.removeQueries({ queryKey: key });
    server.resolve({ ok: false, errors: { formErrors: ["Rejected"] } });
    await expect(submission).resolves.toMatchObject({ status: "server-errors" });
    expect(client.getQueryEntry(key)).toBeUndefined();
    expect(client.getQueryEntry(sibling)?.stale).toBe(false);
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
    const server = vi.fn(async (values: { name: string }) => ({
      ok: true as const,
      data: values.name,
    }));
    const flow = createFormMutationFlow(client, createForm({ initialValues: { name: "saved" } }), {
      server,
    });

    await expect(flow.submit()).resolves.toEqual({ status: "success", data: "saved" });
    expect(server).toHaveBeenCalledWith({ name: "saved" });
  });

  it("restores an older successful edit when a newer edit fails", async () => {
    const client = createQueryClient();
    const key = ["project", 11] as const;
    client.setQueryData(key, { name: "base" });
    const olderServer = deferred<{ ok: true; data: string }>();
    const newerServer = deferred<{ ok: false; errors: { formErrors: string[] } }>();
    const older = createFormMutationFlow(client, createForm({ initialValues: { name: "older" } }), {
      server: () => olderServer.promise,
      optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
    });
    const newer = createFormMutationFlow(client, createForm({ initialValues: { name: "newer" } }), {
      server: () => newerServer.promise,
      optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
    });

    const olderSubmission = older.submit();
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual({ name: "older" }));
    const newerSubmission = newer.submit();
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual({ name: "newer" }));
    olderServer.resolve({ ok: true, data: "older" });
    await olderSubmission;
    newerServer.resolve({ ok: false, errors: { formErrors: ["Rejected"] } });
    await newerSubmission;
    expect(client.getQueryData(key)).toEqual({ name: "older" });
  });

  it("keeps a successful middle edit after later and earlier edits fail", async () => {
    const client = createQueryClient();
    const key = ["project", 12] as const;
    client.setQueryData(key, { name: "base" });
    const firstServer = deferred<{ ok: false; errors: { formErrors: string[] } }>();
    const middleServer = deferred<{ ok: true; data: string }>();
    const lastServer = deferred<{ ok: false; errors: { formErrors: string[] } }>();
    const createFlow = (
      name: string,
      server: () => Promise<
        { ok: true; data: string } | { ok: false; errors: { formErrors: string[] } }
      >,
    ) =>
      createFormMutationFlow(client, createForm({ initialValues: { name } }), {
        server,
        optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
      });
    const first = createFlow("first", () => firstServer.promise);
    const middle = createFlow("middle", () => middleServer.promise);
    const last = createFlow("last", () => lastServer.promise);

    const firstSubmission = first.submit();
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual({ name: "first" }));
    const middleSubmission = middle.submit();
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual({ name: "middle" }));
    const lastSubmission = last.submit();
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual({ name: "last" }));
    middleServer.resolve({ ok: true, data: "middle" });
    await middleSubmission;
    lastServer.resolve({ ok: false, errors: { formErrors: ["Last failed"] } });
    await lastSubmission;
    expect(client.getQueryData(key)).toEqual({ name: "middle" });
    firstServer.resolve({ ok: false, errors: { formErrors: ["First failed"] } });
    await firstSubmission;
    expect(client.getQueryData(key)).toEqual({ name: "middle" });
  });

  it("uses an external value as the baseline for a later failed edit", async () => {
    const client = createQueryClient();
    const key = ["project", 13] as const;
    client.setQueryData(key, { name: "base" });
    const olderServer = deferred<{ ok: false; errors: { formErrors: string[] } }>();
    const newerServer = deferred<{ ok: false; errors: { formErrors: string[] } }>();
    const older = createFormMutationFlow(client, createForm({ initialValues: { name: "older" } }), {
      server: () => olderServer.promise,
      optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
    });
    const newer = createFormMutationFlow(client, createForm({ initialValues: { name: "newer" } }), {
      server: () => newerServer.promise,
      optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
    });

    const olderSubmission = older.submit();
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual({ name: "older" }));
    client.setQueryData(key, { name: "external" });
    const newerSubmission = newer.submit();
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual({ name: "newer" }));
    olderServer.resolve({ ok: false, errors: { formErrors: ["Older failed"] } });
    await olderSubmission;
    expect(client.getQueryData(key)).toEqual({ name: "newer" });
    newerServer.resolve({ ok: false, errors: { formErrors: ["Newer failed"] } });
    await newerSubmission;
    expect(client.getQueryData(key)).toEqual({ name: "external" });
  });

  it("does not roll back a replacement ledger whose visible value matches the old edit", async () => {
    const client = createQueryClient();
    const key = ["project", 17] as const;
    client.setQueryData(key, { name: "base" });
    const olderServer = deferred<{ ok: false; errors: { formErrors: string[] } }>();
    const newerServer = deferred<{ ok: false; errors: { formErrors: string[] } }>();
    const createFlow = (server: () => Promise<{ ok: false; errors: { formErrors: string[] } }>) =>
      createFormMutationFlow(client, createForm({ initialValues: { name: "same" } }), {
        server,
        optimistic: { queryKey: key, patch: (values: { name: string }) => ({ name: values.name }) },
      });
    const older = createFlow(() => olderServer.promise);
    const newer = createFlow(() => newerServer.promise);

    const olderSubmission = older.submit();
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual({ name: "same" }));
    client.setQueryData(key, { name: "external" });
    const newerSubmission = newer.submit();
    await vi.waitFor(() => expect(client.getQueryData(key)).toEqual({ name: "same" }));
    olderServer.resolve({ ok: false, errors: { formErrors: ["Older failed"] } });
    await olderSubmission;
    expect(client.getQueryData(key)).toEqual({ name: "same" });
    newerServer.resolve({ ok: false, errors: { formErrors: ["Newer failed"] } });
    await newerSubmission;
    expect(client.getQueryData(key)).toEqual({ name: "external" });
  });

  it("accepts a null-prototype record as a shallow patch", async () => {
    const client = createQueryClient();
    const key = ["project", 14] as const;
    client.setQueryData(key, { name: "old" });
    const patch = Object.assign(Object.create(null) as Record<string, unknown>, { name: "new" });
    const flow = createFormMutationFlow(client, createForm({ initialValues: { name: "new" } }), {
      server: async () => ({ ok: true as const, data: 14 }),
      optimistic: { queryKey: key, patch: () => patch },
    });

    await expect(flow.submit()).resolves.toMatchObject({ status: "success" });
    expect(client.getQueryData(key)).toEqual({ name: "new" });
  });

  it("rejects class instances as optimistic patches", async () => {
    const client = createQueryClient();
    const key = ["project", 15] as const;
    client.setQueryData(key, { name: "old" });
    const server = vi.fn(async () => ({ ok: true as const, data: 15 }));
    const flow = createFormMutationFlow(client, createForm({ initialValues: { name: "new" } }), {
      server,
      optimistic: { queryKey: key, patch: () => new Date() as never },
    });

    await expect(flow.submit()).resolves.toMatchObject({ status: "error" });
    expect(server).not.toHaveBeenCalled();
    expect(client.getQueryData(key)).toEqual({ name: "old" });
  });

  it("skips optimistic patching for array cache data", async () => {
    const client = createQueryClient();
    const key = ["projects"] as const;
    client.setQueryData(key, ["old"]);
    const patch = vi.fn(() => ({ name: "new" }));
    const flow = createFormMutationFlow(client, createForm({ initialValues: { name: "new" } }), {
      server: async () => ({ ok: true as const, data: 1 }),
      optimistic: { queryKey: key, patch },
    });

    await expect(flow.submit()).resolves.toMatchObject({ status: "success" });
    expect(patch).not.toHaveBeenCalled();
    expect(client.getQueryData(key)).toEqual(["old"]);
  });

  it("does not write to the cache for an empty optimistic patch", async () => {
    const client = createQueryClient();
    const key = ["project", 16] as const;
    client.setQueryData(key, { name: "old" });
    const write = vi.spyOn(client, "setQueryData");
    const flow = createFormMutationFlow(client, createForm({ initialValues: { name: "new" } }), {
      server: async () => ({ ok: true as const, data: 16 }),
      optimistic: { queryKey: key, patch: () => ({}) },
    });

    await expect(flow.submit()).resolves.toMatchObject({ status: "success" });
    expect(write).not.toHaveBeenCalled();
    expect(client.getQueryData(key)).toEqual({ name: "old" });
  });
});
