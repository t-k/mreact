import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.compat.tsx";

const container = document.getElementById("root");
if (container === null) throw new Error("#root not found");
createRoot(container).render(createElement(App, {}));
