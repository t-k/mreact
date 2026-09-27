import { cell } from "@reckona/mreact-reactive-core";

export function App() {
  const text = cell("A");
  const branch = cell(true);
  const title = cell("A");
  const selection = cell("a");
  globalThis.__specializationAblationControls = {
    setText: (value) => text.set(value),
    setBranch: (value) => branch.set(value),
    setTitle: (value) => title.set(value),
    setSelection: (value) => selection.set(value),
  };
  return <main><span>{text.get()}</span>{branch.get() ? <b>yes</b> : <i>no</i>}<div title={title.get()} /><select value={selection.get()}><option value="a">A</option><option value="b">B</option></select></main>;
}
