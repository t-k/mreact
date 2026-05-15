// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import {
  __MREACT_AUTH_SESSION_SCRIPT_ID,
  __resetAuthForTesting,
  getSessionClaims,
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
