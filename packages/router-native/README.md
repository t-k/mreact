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
pnpm --filter @reckona/mreact-router-native test:quality:quick
```

Pull Request CI runs Clippy, cargo-nextest, documentation tests, and cargo-deny for both the normal and fuzz dependency graphs. Unit and documentation tests disable the default N-API bindings so they exercise the portable Rust core without requiring a Node host to satisfy N-API symbols; Clippy and native artifact builds still validate the binding-enabled path. Duplicate dependency versions, dependency policies, licenses, sources, and RustSec advisories are blocking checks.

Mutation testing and fuzz campaigns are intentionally local-only:

```bash
pnpm --filter @reckona/mreact-router-native test:mutants:base64
pnpm --filter @reckona/mreact-router-native test:mutants:routes
pnpm --filter @reckona/mreact-router-native test:mutants:flight
pnpm --filter @reckona/mreact-router-native test:mutants:all
pnpm --filter @reckona/mreact-router-native test:fuzz:build
pnpm --filter @reckona/mreact-router-native test:fuzz:smoke
pnpm --filter @reckona/mreact-router-native test:fuzz:campaign flight_roundtrip 3600
```

The fuzz runner copies tracked seeds into a temporary corpus and removes it after each run, so local campaigns do not modify tracked files. It resolves the active Xcode compiler and SDK through `xcrun` on macOS instead of depending on the shell's `cc`. The fuzz package disables N-API bindings because it calls the pure Rust boundary directly, while normal package builds retain N-API bindings through the default feature.

The toolchain used for this workflow is cargo-nextest 0.9.143, cargo-mutants 27.1.0, cargo-fuzz 0.13.2, and cargo-deny 0.18.7 in CI. The commands are also compatible with cargo-deny 0.20.2. Install these tools before running the deep local checks; cargo-fuzz additionally requires a nightly Rust toolchain.

Loom and Miri are deferred because the crate owns no concurrent primitives or unsafe blocks. cargo-semver-checks is deferred because the Rust crate has `publish = false` and no public Cargo compatibility contract. Re-evaluate these decisions when those conditions change.

## Notes

This is not an application-facing package. It exists so router internals can use native implementations where they are available.
