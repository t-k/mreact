import "./globals.css";
import { sidebar } from "../nav.config.js";
import { sitePath } from "../site-path.js";

export const metadata = {
  title: "mreact Docs",
  description: "Documentation for building and deploying mreact applications.",
};

export default function RootLayout() {
  return (
    <html lang="en">
      <body>
        <a class="skip-link" href="#content">
          Skip to content
        </a>
        <div class="site-shell">
          <aside class="site-sidebar">
            <a class="site-brand" href={sitePath()}>
              mreact Docs
            </a>
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
          <main class="site-main" id="content" tabindex="-1">
            <Slot />
          </main>
        </div>
      </body>
    </html>
  );
}
