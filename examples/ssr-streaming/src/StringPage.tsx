// Server-string target: the compiler emits a function that returns a
// single concatenated HTML string. No streaming.
export function App() {
  return (
    <main>
      <h1>Hello SSR</h1>
      <p>This is a static HTML page emitted by the server-string compiler.</p>
      <ul>
        <li>fully static markup</li>
        <li>no dynamic attributes</li>
        <li>no client runtime needed</li>
      </ul>
    </main>
  );
}
