// LikeButton.client.tsx — a reactive client island.
//
// `.client.tsx` marks this component as a client boundary. The server page
// (app/widgets/page.tsx) imports it and renders it as JSX, so the compiler's
// boundary graph reaches its reactive client capability (`cell` + `onClick`)
// and classifies it as a rendered-import client boundary.
//
// SSR emits a `<template data-mreact-client-boundary="LikeButton">` placeholder
// plus the serialized props (`label`, `initial`); the markup below appears only
// after this island hydrates into reactive DOM on the client. The surrounding
// page stays static server HTML, so only this island ships JavaScript.
import { cell } from "@reckona/mreact-reactive-core";

interface LikeButtonProps {
  label: string;
  initial?: number;
}

export function LikeButton(props: LikeButtonProps) {
  const likes = cell(props.initial ?? 0);

  return (
    <span class="like-island">
      <strong>{props.label}</strong>{" "}
      <button
        type="button"
        class="like-button"
        onClick={() => likes.set((value) => value + 1)}
      >
        Like
      </button>{" "}
      <span class="like-count">{likes.get()}</span>
    </span>
  );
}
