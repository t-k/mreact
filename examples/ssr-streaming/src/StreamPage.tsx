// Server-stream target: the compiler emits a function App($sink) that
// pushes chunks into the sink as it runs.
export function App() {
  const tag = "stream";
  const today = new Date().toISOString().slice(0, 10);
  return (
    <main>
      <h1>Server-stream output</h1>
      <p>Mode: <strong>{tag}</strong></p>
      <p>Generated at: <em>{today}</em></p>
      <p>Special characters are HTML-escaped: {"<script>alert(1)</script>"}</p>
    </main>
  );
}
