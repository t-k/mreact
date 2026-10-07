import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { dispatchServerActionRequest } from "../src/actions.js";
import type { ServerActionValidationResult } from "@reckona/mreact-server";

const dirs: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function fixture(source: string) {
  const dir = await mkdtemp(join(tmpdir(), "mreact-action-errors-"));
  dirs.push(dir);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "actions.ts"), `'use server';\n${source}`);
  return dir;
}

function request(transport: string) {
  const headers = {
    origin: "http://app.test", cookie: `${process.env.NODE_ENV === "production" ? "__Host-mreact.csrf" : "mreact.csrf"}=csrf-token`,
    "x-mreact-csrf": "csrf-token", "x-mreact-action-nonce": crypto.randomUUID(),
  };
  return new Request("http://app.test/_mreact/actions", {
    method: "POST",
    headers: { ...headers, "content-type": transport === "json" ? "application/json" : "application/x-www-form-urlencoded" },
    body: transport === "json"
      ? JSON.stringify({ moduleId: "actions.ts", exportName: "save", args: [] })
      : new URLSearchParams({ __mreact_module_id: "actions.ts", __mreact_export_name: "save", __mreact_csrf: "csrf-token", __mreact_action_nonce: crypto.randomUUID() }),
  });
}

const allowedActions = [{ moduleId: "actions.ts", exportName: "save" }];
describe("router Server Action private failures", () => {
  test.each(["json", "form"])("denies a configured authorize without a result for %s", async (transport) => {
    const appDir = await fixture(`export function save() { throw new Error("must not execute"); }`);
    const response = await dispatchServerActionRequest({ appDir, request: request(transport), serverActions: {
      allowedActions, authorize: () => undefined as unknown as ServerActionValidationResult,
    } });
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({ ok: false, error: "Server action not authorized." });
  });

  test.each(["json", "form"])("contains authorization exceptions for %s", async (transport) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const appDir = await fixture(`export function save() { return "must not execute"; }`);
    const response = await dispatchServerActionRequest({ appDir, request: request(transport), serverActions: {
      allowedActions, authorize: () => { throw new Error("auth probe-secret"); },
    } });
    expect(response?.status).toBe(500);
    await expect(response?.json()).resolves.toEqual({ ok: false, error: "Server action failed.", errorId: expect.any(String) });
  });

  test.each(["json", "form"])("hides registry load errors for %s", async (transport) => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const appDir = await fixture(`throw new Error("registry probe-secret"); export function save() {}`);
    const response = await dispatchServerActionRequest({ appDir, request: request(transport), serverActions: { allowedActions } });
    expect(response?.status).toBe(500);
    const body = await response?.json();
    expect(body).toEqual({ ok: false, error: "Server action failed.", errorId: expect.any(String) });
    expect(log).toHaveBeenCalledWith("mreact-server: Server action failed.", { errorId: body.errorId, error: expect.any(Error) });
  });

  test.each(["json", "form"])("hides thrown errors and undefined for %s", async (transport) => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const thrown of ['new Error("action probe-secret")', '"action probe-secret"', "undefined"]) {
      const appDir = await fixture(`export function save() { throw ${thrown}; }`);
      const response = await dispatchServerActionRequest({ appDir, request: request(transport), serverActions: { allowedActions } });
      expect(response?.status).toBe(500);
      const body = await response?.json();
      expect(body).toEqual({ ok: false, error: "Server action failed.", errorId: expect.any(String) });
      expect(log).toHaveBeenCalledWith("mreact-server: Server action failed.", { errorId: body.errorId, error: thrown === "undefined" ? undefined : expect.anything() });
    }
  });
});
