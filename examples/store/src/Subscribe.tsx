// Subscribe — non-reactive listener for side effects (logging,
// persistence, analytics, etc.). Demonstrates: store.subscribe.
// The listener receives `(next, previous)` and runs outside the
// reactive graph. See README.md > Tour.
import { cell } from "@reckona/mreact-reactive-core";
import { cartStore } from "./store.ts";

const log = cell<string[]>([]);

cartStore.subscribe((next, previous) => {
  const previousItems = previous.lines.reduce(
    (sum, line) => sum + line.quantity,
    0,
  );
  const nextItems = next.lines.reduce(
    (sum, line) => sum + line.quantity,
    0,
  );
  if (nextItems !== previousItems) {
    const time = new Date().toISOString().slice(11, 19);
    log.set((entries) =>
      [`${time} items ${previousItems} → ${nextItems}`, ...entries].slice(0, 10),
    );
  }
});

export function App() {
  return (
    <main>
      <h1>subscribe</h1>
      <p>
        A subscriber outside the reactive graph appends a line to this
        log every time the cart's item count changes. Open
        <a href="/cart.html"> /cart.html</a> in a second tab and adjust
        quantities — the log below reflects each transition.
      </p>
      <ol>
        {log.get().map((entry) => <li key={entry}><code>{entry}</code></li>)}
      </ol>
      <p><a href="/index.html">← Back</a></p>
    </main>
  );
}
