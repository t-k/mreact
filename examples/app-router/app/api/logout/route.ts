// /api/logout — POST clears the session cookie and 303-redirects to
// /login.
import { destroySession } from "@reckona/mreact-auth";
import { sessions } from "../../session-store";

export async function POST(request: Request): Promise<Response> {
  const response = new Response(null, {
    status: 303,
    headers: { location: "/login" },
  });
  await destroySession(request, response, sessions);
  return response;
}
