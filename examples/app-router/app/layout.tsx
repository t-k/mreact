// Root layout. Wraps every page with the HTML shell, the top nav, and
// the global footer. The router target does not accept dynamic
// `style={{...}}` props on server-rendered nodes, so all CSS lives in a
// single `<style>` block applied via class names.

export default function Layout() {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>mreact App Router example</title>
        <style>{`
          body { font-family: system-ui, sans-serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; color: #1f2937; }
          header.site-nav { border-bottom: 1px solid #e5e7eb; padding-bottom: 0.75rem; margin-bottom: 1rem; font-size: 0.9em; }
          header.site-nav a { margin-right: 0.5rem; }
          footer.site-foot { border-top: 1px solid #e5e7eb; padding-top: 0.75rem; margin-top: 2rem; color: #6b7280; font-size: 0.85em; }
          pre.code-block { background: #f3f4f6; padding: 0.75rem; border-radius: 0.25rem; overflow: auto; }
          dl.kv { display: grid; grid-template-columns: 8rem 1fr; gap: 0.25rem 1rem; background: #f3f4f6; padding: 0.75rem; border-radius: 0.25rem; }
          dl.kv dt { font-weight: 600; }
          dl.kv dd { margin: 0; }
          section.docs-layout { display: grid; grid-template-columns: 12rem 1fr; gap: 1rem; padding: 0.5rem 0; }
          aside.docs-sidebar { border-right: 1px solid #e5e7eb; padding-right: 0.75rem; }
          aside.docs-sidebar h3 { margin-top: 0; }
          aside.docs-sidebar ul { padding-left: 1rem; margin-bottom: 0; }
          .docs-aside-box { margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid #e5e7eb; font-size: 0.85em; color: #4b5563; }
          .docs-aside-box h4 { margin: 0 0 0.25rem; font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; }
          .docs-aside-box ul { padding-left: 1rem; margin: 0; }
          .counter-display { font-size: 1.5em; }
          .counter-tone-idle { color: #9ca3af; font-size: 0.85em; }
          .counter-tone-hot { color: #dc2626; font-size: 0.85em; }
          .muted { color: #6b7280; font-size: 0.85em; }
          ul.feed-loading li { color: #9ca3af; }
          .action-input { font-size: 1rem; padding: 0.4rem 0.6rem; margin-right: 0.5rem; min-width: 18rem; }
          form.inline-form { display: inline; }
        `}</style>
      </head>
      <body>
        <header class="site-nav">
          <strong>mreact app-router</strong> —{" "}
          <a href="/">Home</a> |{" "}
          <a href="/about">About</a> |{" "}
          <a href="/counter">Counter</a> |{" "}
          <a href="/streaming">Streaming</a> |{" "}
          <a href="/server-actions">Server actions</a> |{" "}
          <a href="/query">Query</a> |{" "}
          <a href="/forms">Forms</a> |{" "}
          <a href="/forms/valibot">Valibot form</a> |{" "}
          <a href="/i18n">i18n</a> |{" "}
          <a href="/users/ada">Users</a> |{" "}
          <a href="/files/readme.md">Files</a> |{" "}
          <a href="/docs">Docs</a> |{" "}
          <a href="/contact">Contact</a> |{" "}
          <a href="/blocked">Blocked</a> |{" "}
          <a href="/api/time">/api/time</a> |{" "}
          <a href="/login">Login</a> |{" "}
          <a href="/admin">Admin</a>
        </header>
        <Slot />
        <footer class="site-foot">
          File-based routing without React — page.tsx / layout.tsx /
          template.tsx / loading.tsx / error.tsx / not-found.tsx / route.ts.
        </footer>
      </body>
    </html>
  );
}
