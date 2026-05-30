// /widgets — a server page with imported client islands.
//
// Unlike /counter (whose whole route becomes a client route because the page
// itself uses `cell` + `onClick`), this page stays a plain server component.
// It imports `LikeButton` from a `.client.tsx` module and renders it as JSX.
//
// The compiler's boundary graph follows that rendered import, reaches the
// island's reactive client capability, and records it as a client boundary in
// the server transform metadata — with no `clientBoundaryImports` config and no
// route-level directive. Each island is server-rendered to a
// `<template data-mreact-client-boundary="LikeButton">` placeholder with its own
// serialized props, then hydrated independently on the client. The prose around
// the islands is static server HTML and ships no JavaScript.
import { LikeButton } from "./LikeButton.client.js";

export const metadata = {
  title: "Component boundary — mreact App Router",
  description:
    "A server page that imports a .client.tsx island and hydrates only that island.",
};

export default function Page() {
  return (
    <main>
      <h1>Component boundary</h1>
      <p>
        This page is a plain server component. It imports{" "}
        <code>LikeButton</code> from{" "}
        <code>app/widgets/LikeButton.client.tsx</code> and renders it as JSX.
        The compiler infers the import is a client boundary from the island's{" "}
        <code>cell</code> + <code>onClick</code> usage, so only the island
        hydrates — the surrounding markup stays static server HTML.
      </p>
      <p>
        Each island below serializes its own props (<code>label</code> and{" "}
        <code>initial</code>) next to a{" "}
        <code>&lt;template data-mreact-client-boundary&gt;</code> placeholder.
        View source before the bundle loads: the buttons are absent until the
        islands hydrate, while this paragraph is already present.
      </p>
      <p>
        <LikeButton label="Cats" initial={3} />
      </p>
      <p>
        <LikeButton label="Dogs" initial={0} />
      </p>
      <p class="muted">
        Contrast with <a href="/counter">/counter</a>, where the page itself is
        the client route. Here the page is server-only and the client cost is
        scoped to each <code>.client.tsx</code> island.
      </p>
      <p>
        <a href="/">← Back to Home</a>
      </p>
    </main>
  );
}
