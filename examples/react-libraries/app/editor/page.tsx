// /editor — server page that renders the Lexical editor island.
//
// Plain server component. It imports the `.compat.tsx` editor and renders it as
// JSX, so the compiler records it as a client boundary. The page prose is static
// server HTML; only the editor island ships JavaScript and hydrates.
import LexicalEditor from "./LexicalEditor.compat.js";

export const metadata = {
  title: "Lexical — React libraries on mreact",
  description: "Meta's Lexical rich-text editor running unmodified on mreact via .compat.tsx.",
};

export default function Page() {
  return (
    <main>
      <h1>Rich text editor</h1>
      <p>
        <a href="https://lexical.dev" target="_blank" rel="noreferrer">Lexical</a>{" "}
        is Meta's extensible rich-text framework. It runs unmodified here: the
        router aliases <code>react</code> / <code>react-dom</code> to{" "}
        <code>@reckona/mreact-compat</code>, and the editor lives in a{" "}
        <code>.compat.tsx</code> client boundary.
      </p>
      <div class="card">
        <h2>Editor</h2>
        <LexicalEditor />
      </div>
    </main>
  );
}
