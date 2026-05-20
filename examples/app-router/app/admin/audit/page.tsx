// /admin/audit — role-gated page.
//
// `requireRole` from @reckona/mreact-auth checks the session for the
// claimed role and, if missing, 303-redirects to the app-wide
// `forbiddenTo` (configured once in `app/session-store.ts` via
// `configureAuth`). This runs INSIDE the loader, so it composes with
// the coarse-grained middleware on /admin/*: middleware catches
// "not signed in," requireRole catches "signed in but lacks the
// role." Both happen before the page renders.
import { requireRole } from "@reckona/mreact-auth";
import type { LoaderContext } from "@reckona/mreact-router";
import { sessions, type DemoSessionData } from "../../session-store";

export const metadata = {
  title: "Admin Audit — mreact App Router",
  description: "Role-gated subpage. Requires the admin role.",
};

interface AuditEntry {
  at: string;
  actor: string;
  action: string;
}

interface AuditData {
  actor: string;
  roles: readonly string[];
  entries: readonly AuditEntry[];
}

export async function loader(context: LoaderContext): Promise<AuditData> {
  const session = await requireRole<DemoSessionData>(
    context.request,
    sessions,
    "admin",
  );

  const entries: AuditEntry[] = [
    { at: "2026-05-14T09:01:12Z", actor: "ada",   action: "rotated session key" },
    { at: "2026-05-14T08:45:33Z", actor: "grace", action: "tried to view audit log (denied)" },
    { at: "2026-05-14T08:12:01Z", actor: "ada",   action: "promoted grace to editor" },
  ];

  return { actor: session.data.userId, roles: session.data.roles, entries };
}

export default function AuditPage(props: { data: AuditData }) {
  return (
    <main>
      <h1>Admin audit log</h1>
      <p>
        Loader called <code>requireRole(request, sessions, "admin")</code>.
        You got here, so the session has the <code>admin</code> role.
      </p>
      <dl class="kv">
        <dt>actor</dt><dd><code>{props.data.actor}</code></dd>
        <dt>roles</dt>
        <dd><code>{JSON.stringify(props.data.roles)}</code></dd>
      </dl>
      <table class="route-table">
        <thead>
          <tr><th>at</th><th>actor</th><th>action</th></tr>
        </thead>
        <tbody>
          {props.data.entries.map((entry) => (
            <tr key={entry.at}>
              <td><code>{entry.at}</code></td>
              <td>{entry.actor}</td>
              <td>{entry.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <a href="/admin">← Back to Admin</a>
      </p>
    </main>
  );
}
