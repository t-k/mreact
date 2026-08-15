// /dialog — server page that renders the Radix dialog island.
//
// Plain server component. It imports the `.compat.tsx` dialog and renders it as
// JSX, so the compiler records it as a client boundary. The prose is static
// server HTML; only the dialog island hydrates and portals its content.
import DialogDemo from "./DialogDemo.compat.js";

export const metadata = {
  title: "Radix UI — React libraries on mreact",
  description: "A Radix UI modal dialog running unmodified on mreact via .compat.tsx.",
};

export default function Page() {
  return (
    <main>
      <h1>Dialog</h1>
      <p>
        <a href="https://www.radix-ui.com" target="_blank" rel="noreferrer">
          Radix UI
        </a>{" "}
        provides an accessible modal dialog with a portal and focus trap. It runs unmodified: the
        router aliases <code>react</code> / <code>react-dom</code> to{" "}
        <code>@reckona/mreact-compat</code>, and the dialog lives in a <code>.compat.tsx</code>{" "}
        client boundary.
      </p>
      <div className="card">
        <h2>Modal</h2>
        <DialogDemo />
      </div>
    </main>
  );
}
