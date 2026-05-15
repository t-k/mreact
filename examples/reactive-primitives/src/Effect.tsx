// Effect — runs an imperative function when its dependencies change.
// Demonstrates: effect(() => ...). Use sparingly: effects are escape
// hatches; most updates should flow through cell / computed.
// See README.md > Tour.
import { cell, effect } from "@reckona/mreact-reactive-core";

export function App() {
  const tick = cell<number>(0);
  const log = cell<string[]>([]);

  effect(() => {
    const t = tick.get();
    log.set((entries) =>
      [`tick=${t} at ${Date.now()}`, ...entries].slice(0, 5),
    );
  });

  return (
    <main>
      <h1>effect</h1>
      <p>tick: <strong>{tick.get()}</strong></p>
      <p>
        <button type="button" onClick={() => tick.set((n) => n + 1)}>bump</button>
      </p>
      <ul>
        {log.get().map((entry) => <li key={entry}>{entry}</li>)}
      </ul>
      <p>
        <small>
          The effect logs every time `tick` changes. The list is capped
          at five entries to keep the demo readable.
        </small>
      </p>
      <p><a href="/index.html">← Back</a></p>
    </main>
  );
}
