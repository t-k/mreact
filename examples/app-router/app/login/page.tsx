// /login — sign-in form. POSTs to /api/login, which sets a signed
// session cookie and 303-redirects to /admin.
//
// Two demo accounts exist:
//   ada   / mreact → roles: ["admin", "editor"]   (can access /admin/audit)
//   grace / mreact → roles: ["editor"]            (forbidden from /admin/audit)

export const metadata = {
  title: "Login — mreact App Router",
  description: "Cookie-based session demo.",
};

export default function LoginPage() {
  return (
    <main>
      <h1>Login</h1>
      <p>
        Demo accounts (same password <code>mreact</code> for both):
      </p>
      <ul>
        <li>
          <code>ada</code> — roles{" "}
          <code>["admin", "editor"]</code> (can access{" "}
          <a href="/admin/audit">/admin/audit</a>)
        </li>
        <li>
          <code>grace</code> — roles <code>["editor"]</code> (will be
          redirected to <a href="/forbidden">/forbidden</a> when
          visiting <code>/admin/audit</code>)
        </li>
      </ul>
      <form method="post" action="/api/login">
        <p>
          <label>
            User{" "}
            <input class="action-input" name="user" defaultValue="ada" required />
          </label>
        </p>
        <p>
          <label>
            Password{" "}
            <input
              class="action-input"
              name="password"
              type="password"
              defaultValue="mreact"
              required
            />
          </label>
        </p>
        <p>
          <button type="submit">Sign in</button>
        </p>
      </form>
    </main>
  );
}
