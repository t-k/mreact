// Drop-in react demo.
//
// The imports look exactly like upstream React, but the `react` and
// `react-dom` specifiers resolve to the @reckona/mreact* shim packages
// in this workspace. The compiler runs in compat mode and rewrites
// hooks / Suspense to mreact's reconciler.
import { Suspense, lazy, useEffect, useState } from "react";

const LazyAbout = lazy(() => import("./LazyAbout.compat.tsx"));

export function App() {
  const [count, setCount] = useState(0);
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    document.title = `count = ${count}`;
  }, [count]);

  return (
    <main>
      <h1>react-compat</h1>
      <p>
        count: <strong>{count}</strong>
      </p>
      <p>
        <button type="button" onClick={() => setCount((c) => c + 1)}>+1</button>{" "}
        <button type="button" onClick={() => setCount(0)}>reset</button>
      </p>
      <p>
        <button type="button" onClick={() => setShowAbout((v) => !v)}>
          {showAbout ? "Hide About" : "Show About"}
        </button>
      </p>
      {showAbout && (
        <Suspense fallback={<p>loading About…</p>}>
          <LazyAbout />
        </Suspense>
      )}
    </main>
  );
}
