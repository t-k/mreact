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

For a browser inspector during development, mount the in-page overlay from the
`overlay` subpath:

```ts
if (import.meta.env.DEV) {
  const { mountDevtoolsOverlay } = await import("@reckona/mreact-devtools/overlay");

  mountDevtoolsOverlay();
}
```

## Core APIs

- `createDevtools()` creates an isolated event bus.
- `installDevtools()` installs a devtools instance on `globalThis`.
- `getInstalledDevtools()` returns the currently installed instance.
- `devtools.emit()` and `devtools.subscribe()` move runtime events.
- `mountDevtoolsOverlay()` mounts a small browser inspector with Reactive,
  Query, and Router tabs. It keeps only the latest 200 events by default.

## Notes

The overlay is opt-in and has no side effects until mounted. Keep the dynamic
import behind a development guard so production bundles do not include it.
