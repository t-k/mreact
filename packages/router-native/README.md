# @reckona/mreact-router-native

`@reckona/mreact-router-native` is the native helper package for router runtime
hot paths. It loads the platform-specific native addon when available and falls
back to a local `index.node` build in development.

## Loading Behavior

The CommonJS entrypoint tries platform packages first:

- `@reckona/mreact-router-native-darwin-arm64`
- `@reckona/mreact-router-native-linux-x64-gnu`
- `@reckona/mreact-router-native-win32-x64-msvc`

If no platform package matches, it tries `./index.node`.

## Development

```bash
pnpm --filter @reckona/mreact-router-native build
pnpm --filter @reckona/mreact-router-native test
```

## Notes

This is not an application-facing package. It exists so router internals can use
native implementations where they are available.
