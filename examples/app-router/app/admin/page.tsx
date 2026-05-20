// /admin — protected page.
//
// Two layers of gating:
//   1. `app/middleware.ts` short-circuits unauthenticated requests to
//      `/admin/*` and 303-redirects them to /login before the loader
//      even runs. Coarse-grained route gating belongs in middleware.
//   2. The loader uses `getCurrentSession` from `@reckona/mreact-auth`
//      to read the (guaranteed-present) session.
//
// `export const auth = "include-claims"` opts this route into the
// claims hand-off — the router injects a
// `<script id="__mreact_auth_session">` tag with the session's
// userId / roles / permissions so that **client-side** code can
// call `getSessionClaims()` to read them without re-fetching.
//
// For fine-grained checks (role / permission) see
// `app/admin/audit/page.tsx`, which uses `requireRole("admin")`.
import {
  getCurrentSession,
  getSessionClaims,
  tryRequireRole,
} from "@reckona/mreact-auth";
import type { LoaderContext } from "@reckona/mreact-router";
import { sessions, type DemoSessionData } from "../session-store";

export const metadata = {
  title: "Admin — mreact App Router",
  description: "Middleware-protected page that reads the current session.",
};

export const auth = "include-claims";

interface AdminData {
  userId: string;
  roles: readonly string[];
  hasAdmin: boolean;
  signedInAtIso: string;
  expiresAtIso: string;
}

export async function loader(context: LoaderContext): Promise<AdminData> {
  const session = await getCurrentSession<DemoSessionData>(
    context.request,
    sessions,
  );
  // tryRequireRole resolves to a result rather than redirecting, so the
  // page renders for everyone and we render different UI based on the
  // outcome. (requireRole, by contrast, hard-redirects on failure.)
  const adminResult = await tryRequireRole<DemoSessionData>(
    context.request,
    sessions,
    "admin",
  );

  if (session === undefined) {
    return {
      userId: "(unknown)",
      roles: [],
      hasAdmin: false,
      signedInAtIso: "(missing)",
      expiresAtIso: "(missing)",
    };
  }

  return {
    userId: session.data.userId,
    roles: session.data.roles,
    hasAdmin: adminResult.authorized,
    signedInAtIso: new Date(session.createdAt).toISOString(),
    expiresAtIso: new Date(session.expiresAt).toISOString(),
  };
}

export default function AdminPage(props: { data: AdminData }) {
  // Same function works on both server and client; on the server it
  // reads from the request-scoped runtime, on the client it reads
  // from the injected <script id="__mreact_auth_session"> tag.
  const claims = getSessionClaims<DemoSessionData>();

  return (
    <main>
      <h1>Admin</h1>
      <p>
        Signed in as <strong>{props.data.userId}</strong>. Route gated by{" "}
        <code>app/middleware.ts</code>; the session is read with{" "}
        <code>getCurrentSession</code> from{" "}
        <code>@reckona/mreact-auth</code>.
      </p>
      <dl class="kv">
        <dt>userId</dt><dd><code>{props.data.userId}</code></dd>
        <dt>roles (loader)</dt>
        <dd><code>{JSON.stringify(props.data.roles)}</code></dd>
        <dt>roles (claims hand-off)</dt>
        <dd>
          <code>{JSON.stringify(claims?.roles ?? [])}</code>
        </dd>
        <dt>signed in at</dt><dd><code>{props.data.signedInAtIso}</code></dd>
        <dt>expires at</dt><dd><code>{props.data.expiresAtIso}</code></dd>
      </dl>

      {props.data.hasAdmin ? (
        <p>
          <a href="/admin/audit">/admin/audit</a> — you have the{" "}
          <code>admin</code> role and can enter.
        </p>
      ) : (
        <p class="muted">
          <code>/admin/audit</code> is hidden because{" "}
          <code>tryRequireRole("admin")</code> reported{" "}
          <code>authorized: false</code> for this session.
        </p>
      )}

      <form method="post" action="/api/logout" class="inline-form">
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
