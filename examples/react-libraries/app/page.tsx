// / — React libraries showcase index.
//
// A plain server component. Each demo below imports a real React-ecosystem
// library (Recharts, Lexical, conform) inside a `.compat.tsx`
// boundary. The router aliases `react` / `react-dom` / `react/jsx-runtime` to
// `@reckona/mreact-compat` automatically, so the libraries run unmodified; the
// server renders a placeholder and the client hydrates only each island.

export const metadata = {
  title: "React libraries on mreact",
  description:
    "Real React-ecosystem libraries (Recharts, Lexical, conform) running unmodified on mreact through .compat.tsx boundaries.",
};

interface Demo {
  href: string;
  library: string;
  title: string;
  blurb: string;
}

const demos: Demo[] = [
  {
    href: "/charts",
    library: "Recharts",
    title: "Charts",
    blurb:
      "SVG charts (bar / pie / line) fed by SQLite data. Exercises portals, refs, and SVG delegated events through the compat layer.",
  },
  {
    href: "/editor",
    library: "Lexical",
    title: "Rich text editor",
    blurb:
      "Meta's contentEditable editor with a full toolbar — headings, lists, links, bold/italic, and undo/redo with active-state tracking. Exercises editor roots, the node system, refs, and command dispatch.",
  },
  {
    href: "/forms",
    library: "conform",
    title: "Schema form",
    blurb:
      "Progressive-enhancement form validated by a Zod schema via @conform-to/react. Exercises form state hooks and FormData.",
  },
];

export default function Page() {
  return (
    <main>
      <h1>React libraries on mreact</h1>
      <p>
        Each demo imports a real React-ecosystem library inside a{" "}
        <code>.compat.tsx</code> client boundary. The router aliases{" "}
        <code>react</code>, <code>react-dom</code>, and{" "}
        <code>react/jsx-runtime</code> to <code>@reckona/mreact-compat</code>{" "}
        automatically, so the libraries run unmodified. The server renders a
        placeholder and the client hydrates only the island.
      </p>
      <div class="kpi-grid">
        {demos.map((demo) => (
          <a class="card" href={demo.href} key={demo.href} style="text-decoration: none; color: inherit;">
            <h2>
              {demo.title} <small style="color: #6b7280; font-weight: 400;">— {demo.library}</small>
            </h2>
            <p style="margin: 0; color: #4b5563; font-size: 0.9rem;">{demo.blurb}</p>
          </a>
        ))}
      </div>
    </main>
  );
}
