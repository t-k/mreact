// /api/login — POST creates a session cookie and 303-redirects to
// /admin. Demo credentials are hardcoded; replace with a real
// authentication backend in production.
//
// Two demo users with different role sets demonstrate the
// role-gated `/admin/audit` route:
//   ada   / mreact → roles: ["admin", "editor"]
//   grace / mreact → roles: ["editor"]              (no admin role)
import { createSession } from "@reckona/mreact-auth";
import { sessions } from "../../session-store";

const ACCOUNTS: Record<string, { password: string; roles: readonly string[] }> = {
  ada: { password: "mreact", roles: ["admin", "editor"] },
  grace: { password: "mreact", roles: ["editor"] },
};

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const user = String(form.get("user") ?? "");
  const password = String(form.get("password") ?? "");

  const account = ACCOUNTS[user];
  if (account === undefined || account.password !== password) {
    return Response.json(
      { ok: false, error: "Invalid demo credentials." },
      { status: 401 },
    );
  }

  const response = new Response(null, {
    status: 303,
    headers: { location: "/admin" },
  });
  await createSession(response, sessions, { userId: user, roles: account.roles });
  return response;
}

export function GET(): Response {
  return Response.json(
    { ok: false, error: "Method not allowed." },
    { status: 405 },
  );
}
