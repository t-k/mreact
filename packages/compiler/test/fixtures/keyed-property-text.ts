export function keyedPropertyTextSource(count: number): string {
  const fields = Array.from({ length: count }, (_, index) => `p${index + 1}`);
  const plain = fields.map((field) => `${field}: prefix + ":${field}"`).join(", ");
  const getters = fields.map((field) => `get ${field}() { return suffix.get() + ":${field}"; }`).join(", ");
  const cells = fields.map((field) => `<td>{row.${field}}</td>`).join("");
  return `import { cell } from "@reckona/mreact-reactive-core";
const suffix = cell("getter");
const plain = (prefix) => ({ id: 1, ${plain} });
const reactive = { id: 1, ${getters} };
const rows = cell([plain("old")]);
export function App() {
  return <main>
    <button id="replace" onClick={() => rows.set([plain("new")])}>Replace</button>
    <button id="reactive" onClick={() => rows.set([reactive])}>Reactive</button>
    <button id="suffix" onClick={() => suffix.set(suffix.get() === "updated" ? "detached" : "updated")}>Update</button>
    <button id="clear" onClick={() => rows.set([])}>Clear</button>
    <table><tbody>{rows.get().map((row) => <tr key={row.id}>${cells}</tr>)}</tbody></table>
  </main>;
}`;
}
