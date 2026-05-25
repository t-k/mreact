import { describe, expect, test } from "vitest";
import { buildClientRouteOutput as buildClientRouteOutputFromClient } from "../src/client.js";
import { inferClientRouteModule as inferClientRouteModuleFromClient } from "../src/client.js";
import { inferClientRouteModule } from "../src/client-route-inference.js";
import { buildClientRouteOutput } from "../src/navigation-runtime.js";

describe("client module boundaries", () => {
  test("exposes client-route inference without importing the navigation runtime surface", async () => {
    const result = await inferClientRouteModule({
      code: `"use client";
export default function Page() { return <button onClick={() => undefined}>ok</button>; }`,
      filename: "/app/page.tsx",
      routePath: "/",
    });
    const legacyResult = await inferClientRouteModuleFromClient({
      code: `"use client";
export default function Page() { return <button onClick={() => undefined}>ok</button>; }`,
      filename: "/app/page.tsx",
      routePath: "/",
    });

    expect(result).toEqual(legacyResult);
    expect(result.client).toBe(true);
  });

  test("keeps navigation runtime route output byte-identical through the boundary module", async () => {
    const options = {
      code: `export default function Page() { return <main>ok</main>; }`,
      filename: "/app/page.tsx",
      routePath: "/",
    };

    await expect(buildClientRouteOutput(options)).resolves.toEqual(
      await buildClientRouteOutputFromClient(options),
    );
  });
});
