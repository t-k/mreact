# @reckona/mreact-vite

`@reckona/mreact-vite` is the lower-level Vite plugin for compiling mreact
modules. It wires the mreact compiler into Vite transforms.

For app-router projects, start with `@reckona/create-mreact-app` or use `mreactRouter()` from `@reckona/mreact-router/vite`. Use this package when you need the compiler transform without route discovery or production app-router builds.

## Installation

```bash
pnpm add @reckona/mreact-vite @reckona/mreact vite
```

## Basic Usage

```ts
import { defineConfig } from "vite";
import { modularReact } from "@reckona/mreact-vite";

export default defineConfig({
  plugins: [modularReact()],
});
```

## Options

```ts
modularReact({
  include: [/\.mreact\.tsx$/],
});
```

`include` accepts one regular expression or an array and matches a module when any pattern matches. The transform target is selected from Vite's `ssr` transform flag; it is not a separate plugin option.

## Notes

For app-router projects, prefer `mreactRouter()` from `@reckona/mreact-router/vite`. That plugin owns route discovery, dev middleware, client bundle inference, and production builds.
