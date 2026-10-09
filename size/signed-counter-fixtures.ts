import type { ClientDeliveryFixture } from "./fixtures.js";

/** An ordinary signed counter with the router's default capability inference. */
export const signedCounterFixtures: readonly ClientDeliveryFixture[] = [
  {
    name: "native-signed-counter",
    description: "A canonical negative integer cell with direct text and an increment event.",
    initialPath: "/",
    measuredHtmlPaths: [],
    sessionVisits: [],
    workspacePackages: ["reactive-core", "router"],
    files: {
      "src/app/layout.tsx":
        "export default function Layout() { return <html><body><Slot /></body></html>; }",
      "src/app/page.tsx": `import { cell } from "@reckona/mreact-reactive-core";
export default function Page() {
  const count = cell(-1);
  return <main><p>Signed counter</p><button type="button" data-action onClick={() => count.set(value => value + 1)}>{count.get()}</button></main>;
}`,
    },
  },
];
