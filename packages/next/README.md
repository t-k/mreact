# @reckona/mreact-next

`@reckona/mreact-next` contains experimental helpers for compiling mreact components into modules that can be consumed from a Next.js application.

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

## Generated Output Ownership

`generateMreactComponents()` scans application source while skipping dependency, VCS, cache, coverage, and common build output directories. Generated wrapper and DOM modules start with an `@reckona/mreact-next` ownership marker. A later run updates missing or owned outputs and migrates recognized legacy generated pairs, but refuses the entire generation before writing when a target is hand-written, unsupported, or changed during preflight. Keep hand-written modules under different filenames instead of removing the marker.

## Status

This package is integration tooling. It is not the main mreact app framework; use `@reckona/mreact-router` for mreact-native routing and rendering.
