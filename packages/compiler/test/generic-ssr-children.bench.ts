import { bench, describe } from "vitest";
import { transform } from "../src/index.js";
import { compileServerModule } from "./helpers.js";

const source = `function Item(props) { return <p>{props.children}</p>; }
export function App(props) { return <main>${Array.from({ length: 100 }, () => "<Item>{props.title}</Item>").join("")}</main>; }`;
const output = transform({ code: source, filename: "App.tsx", target: "server", dev: false });
const { App } = compileServerModule(output.code) as { App: (props: { title: string }) => string };
describe("generic SSR children", () => {
  bench(
    "render 100 components with expression children",
    () => {
      const html = App({ title: "Albums & photos" });
      if (!html.includes("<p>Albums &amp; photos</p>")) throw new Error("missing escaped children");
    },
    { time: 2000, warmupTime: 1000 },
  );
});
