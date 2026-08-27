# @reckona/mreact-router-native

`@reckona/mreact-router-native` is the native helper package for router runtime hot paths. It loads the platform-specific native addon when available and falls back to a local `index.node` build in development.

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
pnpm --filter @reckona/mreact-router-native test:nextest
pnpm --filter @reckona/mreact-router-native test:doc
pnpm --filter @reckona/mreact-router-native test:deny
pnpm --filter @reckona/mreact-router-native test:deny:advisories
```

The regular CI pipeline uses Clippy, cargo-nextest, Rust documentation tests, and cargo-deny. Advisory checks remain visible but non-blocking so a newly published advisory does not make every pull request impossible to merge before a dependency update is available.

Run the bounded deep checks locally after installing cargo-mutants and cargo-fuzz:

```bash
pnpm --filter @reckona/mreact-router-native test:mutants
pnpm --filter @reckona/mreact-router-native test:fuzz:base64
pnpm --filter @reckona/mreact-router-native test:fuzz:rows
```

The `Rust deep checks` workflow runs these mutation and fuzz checks every Monday and on demand. The mutation pilot targets Base64 boundary logic in `src/flight.rs`; fuzz targets exercise both Base64 decoding and Flight-row-to-JSON conversion. The fuzz package disables N-API bindings because it calls the pure Rust boundary directly, while normal package builds retain N-API bindings through the default feature.

Loom, Miri, and cargo-semver-checks are not enabled yet. The crate currently has no project-owned concurrent code or `unsafe` blocks, and its Cargo package is private rather than a published Rust API. These checks should be reconsidered when those conditions change.

## Notes

This is not an application-facing package. It exists so router internals can use native implementations where they are available.
