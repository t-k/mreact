// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import {
  __MREACT_QUERY_STATE_SCRIPT_ID,
  __resetQueryClientForTesting,
  dehydrate,
  createQueryClient,
  getQueryClient,
} from "../src/index.js";

describe("browser query client hand-off", () => {
  it("hydrates a client singleton from the injected query state script", () => {
    __resetQueryClientForTesting();
    document.body.innerHTML = "";
    const serverClient = createQueryClient();
    serverClient.setQueryData(["profile"], { name: "Grace" });
    const script = document.createElement("script");
    script.id = __MREACT_QUERY_STATE_SCRIPT_ID;
    script.type = "application/json";
    script.textContent = JSON.stringify(dehydrate(serverClient));
    document.body.append(script);

    const first = getQueryClient();
    const second = getQueryClient();

    expect(second).toBe(first);
    expect(first.getQueryData(["profile"])).toEqual({ name: "Grace" });
  });

  it("ignores malformed injected query state", () => {
    __resetQueryClientForTesting();
    document.body.innerHTML = `<script id="${__MREACT_QUERY_STATE_SCRIPT_ID}" type="application/json">{bad json</script>`;

    const client = getQueryClient();

    expect(client.entries()).toEqual([]);
  });
});
