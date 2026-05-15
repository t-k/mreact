import { createRoot } from "@reckona/mreact-reactive-dom";
import { App } from "./Selectors.tsx";

const root = document.getElementById("root");
if (root === null) throw new Error("#root not found");
createRoot(root, () => App());
