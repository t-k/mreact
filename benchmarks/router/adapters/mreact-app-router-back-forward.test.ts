import { expect, it } from "vitest";
import { mreactAppRouterReactCompatAdapter } from "./mreact-app-router.js";

it("measures compat back-forward navigation with the production fixture", async () => {
  try {
    expect(await mreactAppRouterReactCompatAdapter.measureBackForwardRestoreMs?.()).toBeGreaterThan(
      0,
    );
  } finally {
    await mreactAppRouterReactCompatAdapter.teardown?.();
  }
}, 20_000);
