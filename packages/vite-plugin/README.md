# @reckona/mreact-vite

`@reckona/mreact-vite` is the lower-level Vite plugin for compiling mreact
modules. It wires the mreact compiler into Vite transforms.

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
  target: "client",
});
```

## Notes

For app-router projects, prefer `mreactRouter()` from
`@reckona/mreact-router/vite`. That plugin owns route discovery, dev middleware,
client bundle inference, and production builds. Use this package when you need
the compiler transform without the app router.
