// /streaming — out-of-order streaming SSR with <Await>.
//
// `export const stream = true` switches this route to chunked HTTP. The
// shell flushes immediately with a placeholder; when the promise
// resolves, the runtime emits an OOB fragment that swaps the placeholder
// for the resolved markup. A second boundary with no placeholder is
// in-order: shell flush stops until the promise resolves.

export const stream = true;

export const metadata = {
  title: "Streaming SSR — mreact App Router",
  description: "<Await> placeholder + out-of-order chunk delivery.",
};

interface Article {
  title: string;
  body: string;
}

function delay<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function loadArticles(): Promise<Article[]> {
  return delay(
    [
      { title: "Streaming SSR primer", body: "Shell first, then OOB swaps." },
      { title: "Why out-of-order?", body: "Independent boundaries arrive in resolve order." },
      { title: "In-order vs OOB", body: "Drop the placeholder to gate the shell on the data." },
    ],
    600,
  );
}

function loadStat(): Promise<number> {
  return delay(42, 300);
}

export default function Page() {
  const articles = loadArticles();
  const stat = loadStat();

  return (
    <main>
      <h1>Streaming SSR</h1>
      <p>
        The shell renders instantly. The two <code>&lt;Await&gt;</code>{" "}
        boundaries below resolve independently — open DevTools → Network
        and watch the chunks arrive.
      </p>

      <h2>Out-of-order (with placeholder)</h2>
      <Await
        value={articles}
        placeholderAs="div"
        placeholder={
          <ul class="feed-loading">
            <li>loading article 1…</li>
            <li>loading article 2…</li>
            <li>loading article 3…</li>
          </ul>
        }
      >
        {(items) => (
          <ul>
            {items.map((article) => (
              <li key={article.title}>
                <strong>{article.title}</strong> — {article.body}
              </li>
            ))}
          </ul>
        )}
      </Await>

      <h2>In-order (no placeholder)</h2>
      <p class="muted">
        Shell flush stops here until the promise resolves. Useful for
        above-the-fold data where a placeholder would shift the layout.
      </p>
      <Await value={stat}>
        {(value) => (
          <p>
            critical stat: <code>{value}</code>
          </p>
        )}
      </Await>
    </main>
  );
}
