// app/middleware.ts — runs before every page render that matches the
// `config.matcher` entries below.
//
// Return value semantics:
//   - Response  → short-circuit the request; the page does not render.
//   - undefined → fall through to the normal render path.
import { redirect } from "@reckona/mreact-router";
import { getSession } from "@reckona/mreact-auth";
import { sessions } from "./session-store";

// This sample short-circuits /blocked with HTTP 451 and gates /admin
// behind a session cookie. Requests to other paths are not matched and
// do not invoke this function at all.
export const config = { matcher: ["/blocked", "/admin/:path*"] };

export async function middleware(
  request: Request,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (url.pathname === "/blocked") {
    return new Response(
      "<!DOCTYPE html><html><body><main><h1>Blocked</h1><p>This path is intentionally blocked by middleware (demo).</p></main></body></html>",
      {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "x-mreact-middleware": "hit",
        },
        status: 451,
      },
    );
  }

  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
    const session = await getSession(request, sessions);
    if (session === undefined) {
      redirect("/login");
    }
  }

  return undefined;
}
