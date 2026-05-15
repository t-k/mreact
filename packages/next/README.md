# @reckona/mreact-next

`@reckona/mreact-next` contains experimental helpers for compiling mreact
components into modules that can be consumed from a Next.js application.

## Basic Usage

```ts
import { compileMreactComponentModule } from "@reckona/mreact-next";

const module = compileMreactComponentModule({
  filename: "components/Card.tsx",
  source: `export default function Card() { return <article />; }`,
});
```

## Core APIs

- `compileMreactComponentModule()` compiles a single source module.
- `generateMreactComponents()` compiles multiple components from a directory.
- `formatGeneratedMreactComponents()` formats generated module metadata.

## Status

This package is integration tooling. It is not the main mreact app framework;
use `@reckona/mreact-router` for mreact-native routing and rendering.
