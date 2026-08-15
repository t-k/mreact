// /forms — server page that renders the conform form island.
//
// Plain server component. It imports the `.compat.tsx` form and renders it as
// JSX, so the compiler records it as a client boundary. The prose is static
// server HTML; only the form island hydrates and validates on the client.
import SignupForm from "./SignupForm.compat.js";

export const metadata = {
  title: "conform — React libraries on mreact",
  description: "A conform + Zod form running unmodified on mreact via .compat.tsx.",
};

export default function Page() {
  return (
    <main>
      <h1>Schema form</h1>
      <p>
        <a href="https://conform.guide" target="_blank" rel="noreferrer">
          conform
        </a>{" "}
        validates this form against a <code>zod</code> schema. It runs unmodified: the router
        aliases <code>react</code> to <code>@reckona/mreact-compat</code>, and the form lives in a{" "}
        <code>.compat.tsx</code> client boundary.
      </p>
      <div className="card">
        <h2>Sign up</h2>
        <SignupForm />
      </div>
    </main>
  );
}
