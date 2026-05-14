import { createRoot } from "@reckona/mreact-reactive-dom";
import { App } from "./App";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("Root element was not found");
}

createRoot(root, () => App());
