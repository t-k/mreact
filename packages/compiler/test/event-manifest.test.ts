import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";

describe("compiler event hydration manifest metadata", () => {
  test("collects client event handlers from compiled JSX", () => {
    const output = transform({
      code: "export function App() { const handle = () => {}; return <button onClick={handle}>Save</button>; }",
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.eventHydrationManifest).toEqual({
      version: 1,
      events: [
        {
          id: "App:0",
          event: "click",
          handler: "handle",
        },
      ],
    });
  });
});
