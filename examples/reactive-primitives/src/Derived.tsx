// Derived — a value computed from one or more cells.
// Demonstrates: computed(() => ...) returning a ReadonlyCell.
// See README.md > Tour.
import { cell, computed } from "@reckona/mreact-reactive-core";

export function App() {
  const first = cell<string>("Ada");
  const last = cell<string>("Lovelace");
  const full = computed(() => `${first.get()} ${last.get()}`);

  return (
    <main>
      <h1>computed</h1>
      <p>full: <strong>{full.get()}</strong></p>
      <p>
        first:{" "}
        <input
          value={first.get()}
          onInput={(event) =>
            first.set((event.target as HTMLInputElement).value)
          }
        />
      </p>
      <p>
        last:{" "}
        <input
          value={last.get()}
          onInput={(event) =>
            last.set((event.target as HTMLInputElement).value)
          }
        />
      </p>
      <p>
        <small>
          `full` only recomputes when one of its dependencies changes.
          Use DevTools → Elements to watch the text node update in place.
        </small>
      </p>
      <p><a href="/index.html">← Back</a></p>
    </main>
  );
}
