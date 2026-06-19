import { describe, expect, test } from "vitest";
import { startNodeRequestServer } from "../src/node-server.js";

describe("Node request server helper", () => {
  test("serves requests through the provided render callback and closes cleanly", async () => {
    const server = await startNodeRequestServer({
      port: 0,
      async render(request) {
        return new Response(new URL(request.url).pathname, {
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      },
    });

    try {
      const response = await fetch(`${server.url}/from-helper`);

      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe("/from-helper");
    } finally {
      await server.close();
    }
  });
});
