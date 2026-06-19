import { describe, expect, test } from "vitest";
import { pageRouteMethodResponse } from "../src/route-dispatch.js";

describe("route dispatch helpers", () => {
  test("lets GET and HEAD page route requests continue to render", () => {
    expect(pageRouteMethodResponse("GET")).toBeUndefined();
    expect(pageRouteMethodResponse("HEAD")).toBeUndefined();
  });

  test("handles OPTIONS page route requests with an Allow response", () => {
    const response = pageRouteMethodResponse("OPTIONS");

    expect(response?.status).toBe(204);
    expect(response?.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
  });

  test("rejects unsupported page route methods with 405", async () => {
    const response = pageRouteMethodResponse("POST");

    expect(response?.status).toBe(405);
    expect(response?.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    await expect(response?.text()).resolves.toBe("Method Not Allowed");
  });
});
