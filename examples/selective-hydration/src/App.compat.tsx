// The page rendered on both the server and the client. The `.compat.tsx`
// extension tells the compiler to use the compat lowering. The server
// emits HTML; the client receives the same JSX after hydration captures
// the first user click.
import { useEffect, useState } from "@reckona/mreact-compat";

export function App() {
  const [count, setCount] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <main>
      <h1>Selective hydration</h1>
      <p>
        The HTML you are reading was rendered on the server. The client runtime
        is ready, but this boundary stays static until the first time you click{" "}
        <code>+1</code>. That click triggers hydration and is replayed against the
        freshly-hydrated tree.
      </p>
      <p data-status>
        status:{" "}
        <strong>{hydrated ? "hydrated" : "static SSR"}</strong>
      </p>
      <p>
        count: <strong>{count}</strong>
      </p>
      <p>
        <button type="button" onClick={() => setCount((c) => c + 1)}>+1</button>{" "}
        <button type="button" onClick={() => setCount(0)}>reset</button>
      </p>
    </main>
  );
}
