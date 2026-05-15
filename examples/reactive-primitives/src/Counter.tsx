// Counter — the most basic cell.
// Demonstrates: cell<T>(initial), .get(), .set(updater).
// See README.md > Tour.
import { cell } from "@reckona/mreact-reactive-core";

export function App() {
  const count = cell<number>(0);
  return (
    <main>
      <h1>cell</h1>
      <p>count: <strong>{count.get()}</strong></p>
      <p>
        <button type="button" onClick={() => count.set((n) => n + 1)}>+1</button>{" "}
        <button type="button" onClick={() => count.set(0)}>reset</button>
      </p>
      <p><a href="/index.html">← Back</a></p>
    </main>
  );
}
