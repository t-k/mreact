// /counter — client interactivity.
//
// The compiler sees `cell(` + `onClick=` in this module, marks it as a
// client route, and:
//   1. server-renders the initial HTML (so the page works without JS),
//   2. emits /_mreact/client/routes/counter.js and a <script type="module">
//      tag that re-mounts the route into reactive DOM after hydration.
import { cell } from "@reckona/mreact-reactive-core";

export const metadata = {
  title: "Counter — mreact App Router",
  description: "Client interactivity inferred from cell + onClick.",
};

export default function Page() {
  const count = cell<number>(0);
  const tone = cell<"idle" | "hot">("idle");

  return (
    <main>
      <h1>Client counter</h1>
      <p>
        Using <code>cell</code> and <code>onClick</code> in this file is
        enough for the compiler to infer a client boundary. No manual{" "}
        <code>"use client"</code> marker is required.
      </p>
      <p>
        count: <strong class="counter-display">{count.get()}</strong>{" "}
        <span
          class={tone.get() === "hot" ? "counter-tone-hot" : "counter-tone-idle"}
        >
          ({tone.get()})
        </span>
      </p>
      <p>
        <button
          type="button"
          onClick={() => {
            count.set((value) => value + 1);
            tone.set(count.get() >= 5 ? "hot" : "idle");
          }}
        >
          +1
        </button>{" "}
        <button
          type="button"
          onClick={() => {
            count.set(0);
            tone.set("idle");
          }}
        >
          reset
        </button>
      </p>
      <p class="muted">
        Initial HTML arrives as <code>count: 0 (idle)</code>. After the
        client bundle loads, the buttons mutate the cell, which patches
        the matching text nodes directly — no virtual DOM diff.
      </p>
    </main>
  );
}
