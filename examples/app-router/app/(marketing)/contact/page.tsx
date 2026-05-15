// /contact — route group.
//
// This file lives at app/(marketing)/contact/page.tsx, but the
// (marketing) segment is wrapped in parentheses, which tells the
// router to omit it from the URL. Use route groups to share an
// organizational folder (or a future shared layout) without changing
// the URL.

export const metadata = {
  title: "Contact — mreact App Router",
  description: "Route group demonstration.",
};

export default function Contact() {
  return (
    <main>
      <h1>Contact</h1>
      <p>
        The file path is{" "}
        <code>app/(marketing)/contact/page.tsx</code>, but the URL is{" "}
        <code>/contact</code>. The parenthesized segment never appears
        in the URL.
      </p>
      <p>
        Same semantics as Next.js App Router{" "}
        <code>(group)</code> directories.
      </p>
      <p>
        <a href="/">← Back to Home</a>
      </p>
    </main>
  );
}
