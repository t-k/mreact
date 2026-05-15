// Server-stream target + <Await> boundary.
//
// Without a placeholder, <Await> is in-order: the chunk flushes around
// it stay queued until the promise resolves. The flaky boundary shows
// the `catch` renderer firing for a rejected promise.
export function App() {
  const slowName = new Promise<string>((resolve) => {
    setTimeout(() => resolve("Ada Lovelace"), 50);
  });
  const flaky = new Promise<string>((_resolve, reject) => {
    setTimeout(() => reject(new Error("network down")), 50);
  });
  return (
    <main>
      <h1>&lt;Await&gt; out-of-order demo</h1>
      <p>
        Before ·{" "}
        <Await value={slowName}>
          {(name) => <strong>{name}</strong>}
        </Await>
        {" "}· After
      </p>
      <p>
        With catch:{" "}
        <Await
          value={flaky}
          catch={(error) => <em>failed: {error.message}</em>}
        >
          {(value) => <strong>{value}</strong>}
        </Await>
      </p>
    </main>
  );
}
