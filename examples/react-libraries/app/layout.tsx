export default function Layout() {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>React libraries on mreact</title>
        <style>{`
          body { font-family: system-ui, sans-serif; margin: 0; padding: 0; color: #1f2937; background: #f9fafb; }
          .dashboard { max-width: 1100px; margin: 0 auto; padding: 1rem; }
          header.nav { background: white; border-bottom: 1px solid #e5e7eb; padding: 0.75rem 1rem; margin-bottom: 1rem; }
          header.nav a { margin-right: 1rem; color: #3b82f6; text-decoration: none; }
          header.nav a:hover { text-decoration: underline; }
          .card { background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1.25rem; margin-bottom: 1rem; }
          .card h2 { margin: 0 0 1rem; font-size: 1.1rem; color: #374151; }
          .chart-container { width: 100%; height: 300px; }
          .kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
          .kpi-card { background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1rem; text-align: center; }
          .kpi-value { font-size: 2rem; font-weight: 700; color: #1d4ed8; }
          .kpi-label { font-size: 0.85rem; color: #6b7280; margin-top: 0.25rem; }
          .form-group { margin-bottom: 0.75rem; }
          .form-group label { display: block; font-weight: 500; margin-bottom: 0.25rem; }
          .form-group input, .form-group select { padding: 0.4rem 0.6rem; font-size: 1rem; border: 1px solid #d1d5db; border-radius: 0.25rem; }
          .btn { padding: 0.4rem 1rem; font-size: 0.9rem; border: none; border-radius: 0.25rem; cursor: pointer; background: #3b82f6; color: white; }
          .btn:hover { background: #2563eb; }
          .btn:disabled { opacity: 0.5; }
          .editor-input h1 { font-size: 1.5rem; margin: 0.4rem 0; }
          .editor-input h2 { font-size: 1.2rem; margin: 0.4rem 0; }
          .editor-input ul { padding-left: 1.5rem; list-style: disc; }
          .editor-input ol { padding-left: 1.5rem; list-style: decimal; }
          .editor-input a { color: #2563eb; text-decoration: underline; }
          footer { border-top: 1px solid #e5e7eb; padding: 0.75rem 1rem; margin-top: 2rem; color: #6b7280; font-size: 0.85em; text-align: center; }
        `}</style>
      </head>
      <body>
        <header class="nav">
          <strong>React libraries on mreact</strong>{" "}
          <a href="/">Home</a>
          <a href="/charts">Charts</a>
          <a href="/sales">Sales</a>
          <a href="/metrics">Metrics</a>
          <a href="/editor">Editor</a>
          <a href="/forms">Forms</a>
          <a href="/dialog">Dialog</a>
        </header>
        <div class="dashboard">
          <Slot />
        </div>
        <footer>mreact dogfood — real React libraries via @reckona/mreact-compat</footer>
      </body>
    </html>
  );
}
