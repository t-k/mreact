// /users/$id — dynamic segment + loader + notFound + prerender.
//
// `generateStaticParams()` enumerates the prerender keys; the router
// renders one HTML artifact per id at build time. `notFound()` triggers
// the nearest not-found.tsx (HTTP 404). At runtime, unknown ids that
// were not prerendered also fall through to notFound().
import { notFound, type LoaderContext } from "@reckona/mreact-router";
import { listUserIds, lookupUser } from "../data";

interface UserData {
  name: string;
  role: string;
  loadedAt: string;
}

export const prerender = true;

export const metadata = {
  title: "User — mreact App Router",
  description: "Dynamic segment loader with notFound() and prerender.",
};

export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  return listUserIds().map((id) => ({ id }));
}

export async function loader(context: LoaderContext<{ id: string }>): Promise<UserData> {
  await new Promise((resolve) => setTimeout(resolve, 30));
  const user = lookupUser(context.params.id);
  if (user === undefined) notFound();
  return {
    name: user.name,
    role: user.role,
    loadedAt: new Date().toISOString().slice(11, 19),
  };
}

export default function UserPage(props: {
  params: { id: string };
  data: UserData;
}) {
  return (
    <main>
      <h1>User: {props.data.name}</h1>
      <p>
        This page exports a <code>loader()</code>. The router calls it
        before render and passes the return value as{" "}
        <code>props.data</code>. Loader code may import from other
        modules — esbuild bundles them on demand.
      </p>
      <dl class="kv">
        <dt>params.id</dt><dd><code>{props.params.id}</code></dd>
        <dt>data.name</dt><dd>{props.data.name}</dd>
        <dt>data.role</dt><dd>{props.data.role}</dd>
        <dt>loadedAt</dt><dd><code>{props.data.loadedAt}</code></dd>
      </dl>
      <p>
        Other users:{" "}
        <a href="/users/ada">/users/ada</a>
        {" | "}
        <a href="/users/grace">/users/grace</a>
        {" | "}
        <a href="/users/margaret">/users/margaret</a>
        {" | "}
        <a href="/users/unknown">/users/unknown</a> (loader calls{" "}
        <code>notFound()</code> → 404 boundary)
      </p>
      <p class="muted">
        The three known users are prerendered by{" "}
        <code>generateStaticParams()</code>; production serves the
        artifact from the manifest without running the loader. Unknown
        ids are not prerendered, so the loader runs at request time and
        falls through to <code>notFound()</code>.
      </p>
    </main>
  );
}
