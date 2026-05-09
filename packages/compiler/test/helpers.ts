import {
  bindEvent,
  bindProp,
  bindText,
  createTemplate,
} from "@modular-react/reactive-dom";
import { flushEffects } from "@modular-react/reactive-core/testing";

export async function runClientComponent(code: string): Promise<Node> {
  const App = compileClientComponent(code);
  const node = App();
  await flushEffects();
  return node;
}

export function compileClientComponent(code: string): () => Node {
  const runnableCode = stripImports(code).replace(
    /export function /g,
    "function ",
  );

  return new Function(
    "createTemplate",
    "bindText",
    "bindProp",
    "bindEvent",
    `${runnableCode}\nreturn App;`,
  )(createTemplate, bindText, bindProp, bindEvent) as () => Node;
}

export function runServerComponent(code: string): string {
  const runnableCode = code.replace(/export function /g, "function ");
  const App = new Function(`${runnableCode}\nreturn App;`)() as () => string;
  return App();
}

function stripImports(code: string): string {
  return code.replace(/^import[^\n]+\n\n?/, "");
}
