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

export function createHostCommitBenchmarkEntry() {
  return `
import { createElement, createRoot, flushSync, memo, useRef, useState } from "@reckona/mreact-compat";
window.run = (_kind, count) => {
  const root = createRoot(document.getElementById("app"));
  const Row = memo(function Row({ id }) {
    useState(id); useRef(id);
    return createElement("span", null, "row-" + id);
  });
  function Observer({ version }) {
    const [value, setValue] = useState(0);
    return createElement("button", { ref: node => { if (node) setValue(version); } }, "commit-" + value);
  }
  const children = Array.from({ length: count }, (_, id) => createElement(Row, { key: id, id }));
  function App({ version }) { return [createElement(Observer, { key: "observer", version }), ...children]; }
  let version = 0;
  const start = performance.now();
  flushSync(() => root.render(createElement(App, { version })));
  const mountMs = performance.now() - start;
  const initialRows = [...document.querySelectorAll("span")];
  return {
    mountMs,
    update() { flushSync(() => root.render(createElement(App, { version: ++version }))); },
    verify() {
      const rows = document.querySelectorAll("span");
      if (rows.length !== count || document.querySelector("button").textContent !== "commit-" + version)
        throw new Error("Commit state or row count changed");
      for (let i = 0; i < count; i++)
        if (rows[i] !== initialRows[i] || rows[i].textContent !== "row-" + i)
          throw new Error("Commit row identity or values changed");
    },
    validate() { (${validatePropsMeasurement.toString()})(this); },
    dispose() { root.unmount(); }
  };
};
`;
}
