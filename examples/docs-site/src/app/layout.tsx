import "./globals.css";
import { Link } from "@reckona/mreact-router/link";
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
        <meta name="color-scheme" content="light dark" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{const theme=localStorage.getItem("mreact:docs:theme");if(theme==="light"||theme==="dark"){document.documentElement.dataset.theme=theme;const meta=document.querySelector(\'meta[name="color-scheme"]\');if(meta)meta.setAttribute("content",theme);}}catch{}',
          }}
        ></script>
        <script src={sitePath("docs-sidebar.js")} defer></script>
        <script src={sitePath("docs-menu.js")} defer></script>
        <script src={sitePath("docs-copy.js")} defer></script>
        <script src={sitePath("docs-search.js")} defer></script>
        <script src={sitePath("docs-benchmarks.js")} defer></script>
        <script src={sitePath("docs-theme.js")} defer></script>
      </head>
      <body>
        <a class="skip-link" href="#content">
          Skip to content
        </a>
        <div class="site-shell">
          <header class="site-header">
            <a class="site-brand" href={sitePath()}>
              Mreact Docs
            </a>
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
                role="combobox"
                aria-autocomplete="list"
                aria-controls="site-search-results"
                aria-expanded="false"
                aria-activedescendant=""
                placeholder="Search docs"
              />
              <p class="site-search-status" id="site-search-status" aria-live="polite"></p>
              <ol
                class="site-search-results"
                id="site-search-results"
                role="listbox"
                aria-label="Search results"
                hidden
              ></ol>
            </search>
            <div class="site-header-actions">
              <a
                class="site-icon-control"
                href="https://github.com/t-k/mreact"
                aria-label="GitHub repository"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.14c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.75 2.69 1.24 3.35.95.1-.74.4-1.24.73-1.53-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.47.11-3.06 0 0 .97-.31 3.16 1.18A10.9 10.9 0 0 1 12 6c.98 0 1.95.13 2.87.39 2.19-1.49 3.15-1.18 3.15-1.18.63 1.59.24 2.77.12 3.06.74.81 1.18 1.84 1.18 3.1 0 4.43-2.7 5.4-5.26 5.69.41.36.78 1.06.78 2.14v3.15c0 .31.21.67.79.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"
                  />
                </svg>
              </a>
              <button
                class="site-icon-control theme-toggle"
                type="button"
                data-theme-toggle
                data-theme-next="dark"
                aria-label="Switch to dark theme"
                aria-pressed="false"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" data-theme-icon="dark">
                  <path
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z"
                  />
                </svg>
                <svg aria-hidden="true" viewBox="0 0 24 24" data-theme-icon="light">
                  <path
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 4V2m0 20v-2m5.66-14.66 1.41-1.41M4.93 19.07l1.41-1.41M20 12h2M2 12h2m14.66 5.66 1.41 1.41M4.93 4.93l1.41 1.41M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"
                  />
                </svg>
              </button>
              <button
                class="site-icon-control site-menu-toggle"
                type="button"
                data-menu-toggle
                aria-controls="site-sidebar-menu"
                aria-expanded="false"
                aria-label="Open navigation"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-width="2"
                    d="M4 7h16M4 12h16M4 17h16"
                  />
                </svg>
              </button>
            </div>
          </header>
          <aside class="site-sidebar">
            <div class="site-sidebar-body" id="site-sidebar-menu" tabindex="-1">
              <nav aria-label="Primary">
                {sidebar.map((group) => (
                  <section class="nav-group" key={group.text}>
                    <p class="nav-group-title">{group.text}</p>
                    <ul class="nav-list">
                      {group.items.map((item) => (
                        <li key={item.slug}>
                          <Link class="nav-link" href={sitePath(item.slug)} prefetch="intent">
                            {item.text}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </nav>
            </div>
          </aside>
          <main class="site-main" id="content" tabindex="-1" data-pagefind-body>
            <Slot />
          </main>
        </div>
      </body>
    </html>
  );
}
