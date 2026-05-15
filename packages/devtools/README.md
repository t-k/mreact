# @reckona/mreact-devtools

`@reckona/mreact-devtools` provides a small event bridge for runtime tooling.
Reactive runtime packages can emit structured events, and developer tools can
subscribe without coupling directly to internal runtime state.

## Basic Usage

```ts
import { createDevtools, installDevtools } from "@reckona/mreact-devtools";

const devtools = installDevtools(createDevtools());

const unsubscribe = devtools.subscribe((event) => {
  console.log(event.type, event.payload);
});
```

## Core APIs

- `createDevtools()` creates an isolated event bus.
- `installDevtools()` installs a devtools instance on `globalThis`.
- `getInstalledDevtools()` returns the currently installed instance.
- `devtools.emit()` and `devtools.subscribe()` move runtime events.

## Notes

This package is intentionally small. It is the transport layer for devtools
integrations, not a browser extension UI.
