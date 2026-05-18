// Landing page. Static SSR — no `cell` or `onClick`, so the router does
// not emit a client bundle for this route. The metadata export overrides
// the layout's <title>.

import { Link, type LinkOptions } from "@reckona/mreact-router";

export const metadata = {
  title: "mreact App Router — Home",
  description: "A tour of @reckona/mreact-router features.",
};

interface Stop {
  link?: Pick<LinkOptions, "prefetch" | "scroll" | "transition">;
  href: string;
  label: string;
  blurb: string;
}

interface Group {
  heading: string;
  stops: Stop[];
}

const groups: Group[] = [
  {
    heading: "Routing basics",
    stops: [
      { href: "/about", label: "/about", blurb: "Prerendered static page with metadata." },
      { href: "/files/foo/bar.md", label: "/files/$…path", blurb: "Catch-all segment joined back into the URL." },
      { href: "/contact", label: "/(marketing)/contact", blurb: "Route group — the (marketing) segment is omitted from the URL." },
    ],
  },
  {
    heading: "Layouts and boundaries",
    stops: [
      { href: "/docs", label: "/docs", blurb: "Nested layout + template + collocated error / loading / not-found.", link: { prefetch: "viewport" } },
      { href: "/docs/slots", label: "/docs/slots", blurb: "Named slots — three pages fill the same <Slot name=\"aside\" /> with different content." },
    ],
  },
  {
    heading: "Rendering modes",
    stops: [
      { href: "/counter", label: "/counter", blurb: "Client interactivity — cell + onClick infers a client boundary." },
      { href: "/streaming", label: "/streaming", blurb: "Streaming SSR with <Await> placeholder and out-of-order swaps." },
    ],
  },
  {
    heading: "Data and mutations",
    stops: [
      { href: "/server-actions", label: "/server-actions", blurb: 'A "use server" form action, revalidatePath, and route HTML cache.' },
      { href: "/users/ada", label: "/users/$id", blurb: "Dynamic segment, loader, notFound(), and generateStaticParams." },
      { href: "/query", label: "/query", blurb: "Loader prefetch + client hydrate via @reckona/mreact-query.", link: { scroll: "preserve" } },
      { href: "/forms", label: "/forms", blurb: "Reactive form state + per-field validation + server errors via @reckona/mreact-forms." },
      { href: "/forms/valibot", label: "/forms/valibot", blurb: "Valibot schema validation through Standard Schema, including transformed submit values." },
      { href: "/forms/zod", label: "/forms/zod", blurb: "Zod v4 schema validation through Standard Schema, including transformed submit values." },
    ],
  },
  {
    heading: "Server primitives",
    stops: [
      { href: "/blocked", label: "/blocked", blurb: "Middleware returns 451 before the page renders." },
      { href: "/api/time", label: "/api/time", blurb: "Route handler — GET / POST / ALL named exports." },
      { href: "/login", label: "/login → /admin", blurb: "Session cookie + middleware redirect for unauthenticated /admin." },
      { href: "/admin/audit", label: "/admin/audit", blurb: "Role-gated subpage via @reckona/mreact-auth's requireRole(\"admin\")." },
      { href: "/i18n", label: "/i18n (+ /i18n/$locale)", blurb: "detectLocale + defineMessages from @reckona/mreact-router — path prefix and Accept-Language detection." },
    ],
  },
];

export default function Page() {
  return (
    <main>
      <h1>mreact App Router — Tour</h1>
      <p>
        This example exercises every public feature of{" "}
        <code>@reckona/mreact-router</code>. Each stop is one URL — open
        it, view source, then look at the matching file under{" "}
        <code>app/</code>.
      </p>
      {groups.map((group) => (
        <section>
          <h2>{group.heading}</h2>
          <ul>
            {group.stops.map((stop) => (
              <li key={stop.href}>
                <Link href={stop.href} {...stop.link}>
                  <code>{stop.label}</code>
                </Link>{" "}
                — {stop.blurb}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
