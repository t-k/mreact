// /forbidden — landing page for failed authorization checks.
//
// `@reckona/mreact-auth`'s `requireRole` / `requirePermission` helpers
// redirect here by default when the session is present but lacks the
// claim. This is a plain 200 page (not a 4xx) because the request
// itself succeeded; the failure was that the previous route is not
// available for this user.

export const metadata = {
  title: "Forbidden — mreact App Router",
  description: "Landing page for authorization failures.",
};

export default function Page() {
  return (
    <main>
      <h1>Forbidden</h1>
      <p>
        The page you tried to open requires a role or permission your
        session does not have. The redirect was issued by{" "}
        <code>requireRole</code> / <code>requirePermission</code> from{" "}
        <code>@reckona/mreact-auth</code>.
      </p>
      <p>
        Sign in as <strong>ada</strong> (roles{" "}
        <code>["admin", "editor"]</code>) to access the role-gated
        pages, or visit <a href="/admin">/admin</a> which only
        requires being signed in.
      </p>
      <p>
        <a href="/login">← Switch user</a>
      </p>
    </main>
  );
}
