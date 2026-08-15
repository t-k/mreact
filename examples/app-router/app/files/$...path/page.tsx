// /files/$...path — catch-all segment.
//
// $...path matches everything after /files/ and binds each segment
// to `params.path` (string[]). With no extension restriction the route
// matches /files/a, /files/a/b, /files/a/b/c.md, etc.

export const metadata = {
  title: "Files — mreact App Router",
  description: "Catch-all dynamic segment.",
};

export default function Page(props: { params: { path: readonly string[] | string } }) {
  const parts =
    typeof props.params.path === "string" ? props.params.path.split("/") : props.params.path;
  const joinedPath = parts.join("/");
  return (
    <main>
      <h1>Catch-all segment</h1>
      <dl class="kv">
        <dt>Pattern</dt>
        <dd>
          <code>app/files/$...path/page.tsx</code>
        </dd>
        <dt>params.path</dt>
        <dd>
          <code>{joinedPath}</code>
        </dd>
        <dt>Segments</dt>
        <dd>{parts.length}</dd>
      </dl>
      <ol>
        {parts.map((part, index) => (
          <li key={index}>
            <code>{part}</code>
          </li>
        ))}
      </ol>
      <p>
        Try other URLs: <a href="/files/readme.md">/files/readme.md</a>,{" "}
        <a href="/files/docs/api/index.md">/files/docs/api/index.md</a>,{" "}
        <a href="/files/a/b/c/d/e">/files/a/b/c/d/e</a>.
      </p>
    </main>
  );
}
