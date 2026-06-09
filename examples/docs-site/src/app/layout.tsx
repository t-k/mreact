import "./globals.css";
import { sidebar } from "../nav.config.js";
import { sitePath } from "../site-path.js";

export const metadata = {
  title: "Mreact Docs",
  description: "Documentation for building and deploying Mreact applications.",
};

export default function RootLayout() {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script src={sitePath("docs-copy.js")} defer></script>
        <script src={sitePath("docs-search.js")} defer></script>
        <script src={sitePath("docs-benchmarks.js")} defer></script>
      </head>
      <body>
        <a class="skip-link" href="#content">
          Skip to content
        </a>
        <div class="site-shell">
          <aside class="site-sidebar">
            <div class="site-sidebar-header">
              <a class="site-brand" href={sitePath()}>
                Mreact Docs
              </a>
              <a class="site-source-link" href="https://github.com/t-k/mreact">
                GitHub
              </a>
            </div>
            <search class="site-search" aria-label="Search documentation">
              <label class="site-search-label" for="site-search-input">
                Search
              </label>
              <input
                class="site-search-input"
                id="site-search-input"
                name="q"
                type="search"
                autocomplete="off"
                placeholder="Search docs"
              />
              <p class="site-search-status" id="site-search-status" aria-live="polite"></p>
              <ol class="site-search-results" aria-label="Search results"></ol>
            </search>
            <nav aria-label="Primary">
              {sidebar.map((group) => (
                <section class="nav-group" key={group.text}>
                  <p class="nav-group-title">{group.text}</p>
                  <ul class="nav-list">
                    {group.items.map((item) => (
                      <li key={item.slug}>
                        <a class="nav-link" href={sitePath(item.slug)}>
                          {item.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </nav>
          </aside>
          <main class="site-main" id="content" tabindex="-1" data-pagefind-body>
            <Slot />
          </main>
        </div>
      </body>
    </html>
  );
}
