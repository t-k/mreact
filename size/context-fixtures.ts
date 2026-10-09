import type { ClientDeliveryFixture } from "./fixtures.js";

const layout =
  'export default function Layout() { return <html lang="en"><body><Slot /></body></html>; }';
const other =
  'import { Link } from "@reckona/mreact-router/link"; export default function Other() { return <main><h1>Other page</h1><Link href="/">Home</Link></main>; }';

/** Equivalent interactive UIs using ordinary native and Context-based compatibility code. */
export const contextDeliveryFixtures: readonly ClientDeliveryFixture[] = [
  {
    name: "native-context-ui",
    description:
      "Native cell state with the same visible controls as the Context compatibility tree.",
    initialPath: "/",
    measuredHtmlPaths: [],
    sessionVisits: [],
    workspacePackages: ["reactive-core", "router"],
    files: {
      "src/app/layout.tsx": layout,
      "src/app/other/page.tsx": other,
      "src/app/page.tsx": `import { cell } from "@reckona/mreact-reactive-core";
import { Link } from "@reckona/mreact-router/link";
export default function Page() {
  const value = cell("light");
  return <main><section><output data-value>{value.get()}</output><output data-nested>nested</output><input data-edit defaultValue="edit" /><button type="button" data-action onClick={() => value.set("dark")}>Change theme</button></section><p id="native">Native sibling</p><Link href="/other">Other</Link></main>;
}`,
    },
  },
  {
    name: "compat-context-ui",
    description:
      "Shared module Context, nested providers, and state with the same controls as the native UI.",
    initialPath: "/",
    measuredHtmlPaths: [],
    sessionVisits: [],
    workspacePackages: [
      "react",
      "react-compat",
      "reactive-core",
      "reactive-dom",
      "router",
      "shared",
    ],
    files: {
      "src/app/layout.tsx": layout,
      "src/app/other/page.tsx": other,
      "src/app/context.ts":
        'import { createContext } from "@reckona/mreact"; export const Theme = createContext<string | null>(null);',
      "src/app/Panel.compat.tsx": `import { useContext, useState } from "@reckona/mreact";
import { Theme } from "./context";
function Label() { return <output data-value>{useContext(Theme)}</output>; }
function NestedLabel() { return <output data-nested>{useContext(Theme)}</output>; }
export function Panel() {
  const [value, setValue] = useState("light");
  return <section><Theme.Provider value={value}><Label /><Theme.Provider value="nested"><NestedLabel /></Theme.Provider><input data-edit defaultValue="edit" /><button type="button" data-action onClick={() => setValue("dark")}>Change theme</button></Theme.Provider></section>;
}`,
      "src/app/page.tsx": `import { Panel } from "./Panel.compat";
import { Link } from "@reckona/mreact-router/link";
export default function Page() { return <main><Panel /><p id="native">Native sibling</p><Link href="/other">Other</Link></main>; }`,
    },
  },
];
