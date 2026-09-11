// @vitest-environment happy-dom
import { bench, describe } from "vitest";
import { createRoot } from "@reckona/mreact-reactive-dom";
import { transform } from "../src/index.js";
import { compileClientComponent, compileServerModule } from "./helpers.js";

const output = transform({
  code: `import { cell } from "@reckona/mreact-reactive-core";
function Item(props) {
  const label = cell(props.label);
  return <span>{label.get()}</span>;
}
export function App() {
  return <main>${Array.from({ length: 100 }, (_, i) => `<Item label="item ${i}" />`).join("")}</main>;
}`,
  filename: "App.tsx",
  target: "client",
  dev: false,
});
const App = compileClientComponent(output.code);
describe("compiled native components", () => {
  bench(
    "mount and dispose 100 components",
    () => {
      const host = document.createElement("div");
      const dispose = createRoot(host, App);
      if (host.querySelectorAll("span").length !== 100) throw new Error("missing components");
      dispose();
    },
    { time: 2000, warmupTime: 1000 },
  );
});
const shell = compileServerModule(
  transform({
    code: "export function Shell(props) { return <main>{props.children}</main>; }",
    filename: "Shell.tsx",
    target: "server",
    dev: false,
  }).code,
);
const server = compileServerModule(
  transform({
    code: `import { Shell } from "./Shell";
export function App(props) { return <Shell><section>${Array.from({ length: 100 }, () => "<p>{props.title}</p>").join("")}</section></Shell>; }`,
    filename: "App.tsx",
    target: "server",
    dev: false,
    clientBoundaryImports: ["./Shell"],
    clientBoundaryFallbackImports: ["./Shell"],
  }).code,
  shell,
);
describe("compiled server layout", () => {
  bench(
    "render layout boundary with 100 children",
    () => {
      const html = (server.App as (props: { title: string }) => string)({
        title: "Albums & photos",
      });
      if (!html.includes("<main>")) throw new Error("missing layout");
    },
    { time: 2000, warmupTime: 1000 },
  );
});
