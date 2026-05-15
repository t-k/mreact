// Selective-hydration entry. The streaming hydration root only attaches
// handlers and runs effects once the user interacts with a node listed
// in the event hydration manifest — until then, the page stays as
// pure static HTML.
import {
  createElement,
  createStreamingHydrationRoot,
} from "@reckona/mreact-compat";
import { App } from "./App.compat.tsx";

const root = document.getElementById("root");
if (root === null) throw new Error("#root not found");

createStreamingHydrationRoot(root, {
  selectiveHydration: {
    element: createElement(App, {}),
    options: { resumeId: "App" },
  },
});

console.log(
  "[selective] armed — page stays static until you click one of the buttons.",
);
