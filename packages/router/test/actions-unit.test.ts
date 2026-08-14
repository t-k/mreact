import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  __clearDefaultReplayStore,
  __readDefaultReplayStore,
  prepareRouteServerActions,
  serverActionCookie,
} from "../src/actions.js";

describe("router actions helpers", () => {
  test("serverActionCookie emits the documented HttpOnly + SameSite=Lax shape", () => {
    const cookie = serverActionCookie(
      "deadbeef-dead-beef-dead-beefdeadbeef",
    );
    expect(cookie).toContain("=deadbeef-dead-beef-dead-beefdeadbeef");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("HttpOnly");
  });

  test("serverActionCookie url-encodes the token bytes", () => {
    const cookie = serverActionCookie("a+b/c");
    expect(cookie).toContain("=a%2Bb%2Fc");
  });

  test("__readDefaultReplayStore returns the bounded store and __clearDefaultReplayStore empties it", () => {
    const store = __readDefaultReplayStore();
    expect(store).toBeDefined();
    expect(typeof store.claim).toBe("function");

    const first = store.claim("anything");
    expect(first.status).toBe("claimed");

    __clearDefaultReplayStore();
    expect(store.claim("anything").status).toBe("claimed");
  });

  test("__readDefaultReplayStore.claim lazily evicts an entry whose TTL has elapsed", () => {
    __clearDefaultReplayStore();
    const store = __readDefaultReplayStore();
    // The default TTL is 10 minutes; we cannot wait that long, so simulate
    // an expired entry by reaching into the internal map.
    const internal = store as unknown as {
      entries: Map<string, { state: "completed"; expiresAt: number }>;
    };
    internal.entries.set("expired-nonce", {
      state: "completed",
      expiresAt: Date.now() - 1,
    });
    expect(store.claim("expired-nonce").status).toBe("claimed");
  });

  test("__readDefaultReplayStore.claim rejects an unexpired completed entry", () => {
    __clearDefaultReplayStore();
    const store = __readDefaultReplayStore();
    const first = store.claim("live-nonce");
    expect(first.status).toBe("claimed");
    if (first.status !== "claimed") throw new Error("expected nonce claim");
    first.finalize();
    expect(store.claim("live-nonce").status).toBe("replay");
  });

  test("prepareRouteServerActions skips import resolution when there is no form action", async () => {
    const code = `import { save } from "./missing-action";

export default function Page() {
  return <main>No form action</main>;
}`;

    await expect(
      prepareRouteServerActions({
        appDir: "/tmp/mreact-actions",
        code,
        pageFile: "/tmp/mreact-actions/page.tsx",
      }),
    ).resolves.toEqual({ code, hasFormActions: false });
  });

  test("prepareRouteServerActions trusts empty built form action references", async () => {
    const code = `import { save } from "./missing-action";

export default function Page() {
  return <main><form action={save}><button type="submit">Save</button></form></main>;
}`;

    await expect(
      prepareRouteServerActions({
        appDir: "/tmp/mreact-actions",
        code,
        formActionReferences: [],
        pageFile: "/tmp/mreact-actions/page.tsx",
      }),
    ).resolves.toEqual({ code, hasFormActions: false });
  });

  test("prepareRouteServerActions does not parse route code when built form action references are empty", async () => {
    const code = `export default function Page() {
  return <main><form action={save}></main>;
}`;

    await expect(
      prepareRouteServerActions({
        appDir: "/tmp/mreact-actions",
        code,
        formActionReferences: [],
        pageFile: "/tmp/mreact-actions/page.tsx",
      }),
    ).resolves.toEqual({ code, hasFormActions: false });
  });

  test("prepareRouteServerActions resolves a typed const action registry property", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-actions-registry-"));
    const pageFile = join(appDir, "page.tsx");
    const code = `import { save } from "./actions";

const actions = { save } satisfies Record<string, (formData: FormData) => Promise<void>>;

export default function Page() {
  return <form action={actions.save}><button type="submit">Save</button></form>;
}`;

    await writeFile(
      join(appDir, "actions.ts"),
      `export async function save(_formData: FormData) {}`,
    );
    await writeFile(pageFile, code);

    const prepared = await prepareRouteServerActions({
      appDir,
      code,
      pageFile,
    });

    expect(prepared).toMatchObject({
      diagnostics: [],
      hasFormActions: true,
    });
    expect(prepared.code).toContain('action="/_mreact/actions"');
    expect(prepared.code).toContain('name="__mreact_module_id" value="actions.ts"');
    expect(prepared.code).toContain('name="__mreact_export_name" value="save"');
  });

  test("prepareRouteServerActions resolves local action aliases through barrel imports", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-actions-barrel-alias-"));
    const pageFile = join(appDir, "page.tsx");
    const code = `import { save } from "./barrel";

const action = save;

export default function Page() {
  return <form action={action}><button type="submit">Save</button></form>;
}`;

    await writeFile(
      join(appDir, "actions.ts"),
      `export async function save(_formData: FormData) {}`,
    );
    await writeFile(join(appDir, "barrel.ts"), `export { save } from "./actions";`);
    await writeFile(pageFile, code);

    const prepared = await prepareRouteServerActions({
      appDir,
      code,
      pageFile,
    });

    expect(prepared).toMatchObject({
      diagnostics: [],
      hasFormActions: true,
    });
    expect(prepared.code).toContain('action="/_mreact/actions"');
    expect(prepared.code).toContain('name="__mreact_module_id" value="barrel.ts"');
    expect(prepared.code).toContain('name="__mreact_export_name" value="save"');
  });

  test("prepareRouteServerActions analyzes the provided route code instead of stale disk contents", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-actions-memory-code-"));
    const pageFile = join(appDir, "page.tsx");
    const code = `import { save } from "./actions";

export default function Page() {
  return <form action={save}><button type="submit">Save</button></form>;
}`;

    await writeFile(
      join(appDir, "actions.ts"),
      `export async function save(_formData: FormData) {}`,
    );
    await writeFile(
      pageFile,
      `import { save } from "./actions";

export default function Page() {
  return <main>No form action yet</main>;
}`,
    );

    const prepared = await prepareRouteServerActions({
      appDir,
      code,
      pageFile,
    });

    expect(prepared).toMatchObject({
      diagnostics: [],
      hasFormActions: true,
    });
    expect(prepared.code).toContain('name="__mreact_module_id" value="actions.ts"');
    expect(prepared.code).toContain('name="__mreact_export_name" value="save"');
  });

  test("prepareRouteServerActions reports dynamic form action selection", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-actions-dynamic-"));
    const pageFile = join(appDir, "page.tsx");
    const code = `import { deleteAll, save } from "./actions";

const action = Math.random() > 0.5 ? save : deleteAll;

export default function Page() {
  return <form action={action}><button type="submit">Save</button></form>;
}`;

    await writeFile(
      join(appDir, "actions.ts"),
      `export async function save() {}
export async function deleteAll() {}`,
    );
    await writeFile(pageFile, code);

    await expect(
      prepareRouteServerActions({
        appDir,
        code,
        pageFile,
      }),
    ).resolves.toMatchObject({
      diagnostics: [
        {
          code: "MR_SERVER_ACTION_INFERENCE_DYNAMIC_FORM_ACTION",
          level: "warn",
          message:
            "mreact could not infer a single server action from this form action expression. Pass the action function directly or use an explicit escape hatch.",
        },
      ],
      hasFormActions: false,
    });
  });
});
