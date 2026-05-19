# Native package release safety has gaps

## Summary

The platform-specific `@reckona/mreact-router-native-*` packages are critical
for native-accelerated router hot paths, but their package metadata and publish
workflow do not yet verify the published CommonJS entry points and native
binaries end to end.

## Evidence

- `packages/router-native/package.json` declares `main: "./index.cjs"` and
  optional dependencies on the platform packages, but no `types` or `exports`
  field.
- `packages/router-native-linux-x64-gnu/package.json` declares `main:
  "./index.cjs"` and publishes `index.cjs` plus `index.node`, but has no
  `types` or `exports` field. The Darwin and Windows platform packages follow
  the same shape.
- `.github/workflows/publish.yml` builds native artifacts in a matrix, uploads
  each `index.node`, downloads them in the publish job, runs `pnpm build`, then
  publishes packages.
- The workflow does not include a JS smoke test that requires the loader or each
  platform package after artifacts are staged.
- The workflow does not explicitly validate that all expected platform
  `index.node` files exist immediately before `scripts/publish-packages.mjs`.

## Impact

A broken wrapper, missing binary, or metadata mismatch can survive until npm
publish and become a runtime failure for users on one platform. Missing `exports`
and `types` also makes module resolution and editor support less predictable for
consumers who inspect or import the native loader directly.

## Suggested fix

1. Add explicit package metadata:

```json
{
  "exports": {
    ".": {
      "types": "./index.d.ts",
      "require": "./index.cjs",
      "default": "./index.cjs"
    }
  },
  "types": "./index.d.ts"
}
```

2. Add minimal `.d.ts` files for the loader and platform packages.
3. Add a publish workflow validation step before publishing:

```bash
for pkg in darwin-arm64 linux-x64-gnu win32-x64-msvc; do
  test -f "packages/router-native-$pkg/index.node"
  test -f "packages/router-native-$pkg/index.cjs"
done
```

4. Add a JS smoke test that requires the loader package and verifies the expected
   exported native functions or documented fallback behavior.

## Priority

High.
