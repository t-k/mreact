export function assertPropsRows(rows, initialRows, kind, count, version) {
  if (rows.length !== count) throw new Error("DOM row count changed");
  for (let index = 0; index < count; index++) {
    const row = rows[index];
    if (row !== initialRows[index]) throw new Error("DOM identity changed");
    if (
      row.textContent !== "value-" + version ||
      (kind !== "single" && row.className !== (version % 2 ? "selected" : ""))
    )
      throw new Error("DOM values changed");
  }
}

export function validatePropsMeasurement(measurement) {
  measurement.verify();
  measurement.update();
  measurement.verify();
  measurement.update();
  measurement.verify();
}

export function createPropsBenchmarkEntry(kind = "mixed") {
  const components = { single: "SingleProp", multiple: "MultipleProps", object: "ObjectProps" };
  const imports = kind === "mixed" ? Object.values(components).join(", ") : components[kind];
  if (!imports) throw new Error(`Unknown props kind: ${kind}`);
  return `
import { createElement, createRoot, flushSync, useState } from "@reckona/mreact-compat";
import { ${imports} } from "./Rows.js";
${assertPropsRows.toString()}
${validatePropsMeasurement.toString()}
window.run = (kind, count) => {
  const root = createRoot(document.getElementById("app"));
  let setVersion;
  const Row = ${kind === "mixed" ? "{ single: SingleProp, multiple: MultipleProps, object: ObjectProps }[kind]" : components[kind]};
  function App() {
    const [version, set] = useState(0); setVersion = set;
    return Array.from({ length: count }, (_, id) => createElement(Row, kind === "single" ? { key: id, label: "value-" + version } : kind === "multiple" ? { key: id, label: "value-" + version, selected: version % 2 === 1 } : { key: id, row: { label: "value-" + version }, selected: version % 2 === 1 }));
  }
  const start = performance.now(); flushSync(() => root.render(createElement(App, null)));
  const mountMs = performance.now() - start;
  const initialRows = [...document.querySelectorAll("span")];
  let version = 0;
  return {
    mountMs,
    update() { flushSync(() => setVersion(++version)); },
    verify() { assertPropsRows(document.querySelectorAll("span"), initialRows, kind, count, version); },
    validate() { validatePropsMeasurement(this); },
    dispose() { root.unmount(); }
  };
};
`;
}
