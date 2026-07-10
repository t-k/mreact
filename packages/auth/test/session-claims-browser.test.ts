// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import {
  __MREACT_AUTH_SESSION_SCRIPT_ID,
  __resetAuthForTesting,
  configureAuth,
  createMemorySessionStore,
  getSession,
  getSessionClaims,
  refreshSession,
  revokeCurrentSession,
} from "../src/index.js";

describe("browser session claims hand-off", () => {
  it("hydrates explicitly serialized claims from the injected auth session script", () => {
    __resetAuthForTesting();
    document.body.innerHTML = "";
    const script = document.createElement("script");
    script.id = __MREACT_AUTH_SESSION_SCRIPT_ID;
    script.type = "application/json";
    script.textContent = JSON.stringify({ roles: ["admin"], userId: "ada" });
    document.body.append(script);

    expect(getSessionClaims()).toEqual({ roles: ["admin"], userId: "ada" });
    expect(getSessionClaims()).toEqual({ roles: ["admin"], userId: "ada" });
  });

  it("refreshes cached claims when the auth hand-off script changes", () => {
    __resetAuthForTesting();
    document.body.innerHTML = `<script id="${__MREACT_AUTH_SESSION_SCRIPT_ID}" type="application/json">{"userId":"ada"}</script>`;
    expect(getSessionClaims()).toEqual({ userId: "ada" });
    document.getElementById(__MREACT_AUTH_SESSION_SCRIPT_ID)!.textContent = JSON.stringify({ userId: "bea" });
    expect(getSessionClaims()).toEqual({ userId: "bea" });
    document.getElementById(__MREACT_AUTH_SESSION_SCRIPT_ID)?.remove();
    expect(getSessionClaims()).toBeUndefined();
  });

  it("keeps refreshed browser claims authoritative over the initial document hand-off", async () => {
    __resetAuthForTesting();
    document.body.innerHTML = `<script id="${__MREACT_AUTH_SESSION_SCRIPT_ID}" type="application/json">{"roles":["admin"]}</script>`;
    expect(getSessionClaims()).toEqual({ roles: ["admin"] });

    const store = createMemorySessionStore<{ roles: string[]; userId: string }>();
    await store.set({
      createdAt: Date.now(),
      data: { roles: ["member"], userId: "bea" },
      expiresAt: Date.now() + 60_000,
      id: "member-session",
    });
    const request = { headers: new Headers({ cookie: "session=member-session" }) } as Request;
    expect(await getSession(request, store, { cookieName: "session" })).toMatchObject({
      data: { roles: ["member"] },
    });

    await refreshSession(request, new Response(null), store, { cookieName: "session" });

    expect(getSessionClaims()).toEqual({ roles: ["member"] });
  });

  it("clears the browser hand-off script when a session is revoked", async () => {
    __resetAuthForTesting();
    document.body.innerHTML = `<script id="${__MREACT_AUTH_SESSION_SCRIPT_ID}" type="application/json">{"userId":"ada"}</script>`;
    expect(getSessionClaims()).toEqual({ userId: "ada" });

    await revokeCurrentSession(
      new Request("https://app.test/"),
      new Response(null),
      createMemorySessionStore(),
    );

    expect(document.getElementById(__MREACT_AUTH_SESSION_SCRIPT_ID)).toBeNull();
    expect(getSessionClaims()).toBeUndefined();
  });

  it("clears browser claims when a custom serializer cannot produce JSON", async () => {
    __resetAuthForTesting();
    document.body.innerHTML = `<script id="${__MREACT_AUTH_SESSION_SCRIPT_ID}" type="application/json">{"roles":["admin"]}</script>`;
    configureAuth({
      serializeClaims: () => ({ roles: ["member"], unsupported: 1n }),
    });
    const store = createMemorySessionStore<{ userId: string }>();
    await store.set({
      createdAt: Date.now(),
      data: { userId: "bea" },
      expiresAt: Date.now() + 60_000,
      id: "non-json-session",
    });
    const request = { headers: new Headers({ cookie: "session=non-json-session" }) } as Request;

    await refreshSession(request, new Response(null), store, { cookieName: "session" });

    expect(document.getElementById(__MREACT_AUTH_SESSION_SCRIPT_ID)).toBeNull();
    expect(getSessionClaims()).toBeUndefined();
  });

  it("returns undefined when the injected claims are absent, malformed, or invalid", () => {
    __resetAuthForTesting();
    document.body.innerHTML = `<script id="${__MREACT_AUTH_SESSION_SCRIPT_ID}" type="application/json">{bad json</script>`;

    expect(getSessionClaims()).toBeUndefined();

    __resetAuthForTesting();
    document.body.innerHTML = "";
    const script = document.createElement("script");
    script.id = __MREACT_AUTH_SESSION_SCRIPT_ID;
    script.type = "application/json";
    script.textContent = JSON.stringify({ roles: ["admin", 42] });
    document.body.append(script);

    expect(getSessionClaims()).toBeUndefined();
  });
});
