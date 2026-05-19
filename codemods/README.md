# mreact codemods

This directory records migration IDs that `@reckona/create-mreact-app upgrade` can report for projects crossing framework versions.

The first registry entries are:

- `0.0.16-import-policy-normalize`: review app-router adapter import-policy examples after the 0.0.16 template changes.
- `0.0.16-aws-lambda-esm-template`: review AWS Lambda ESM entrypoints and production install guidance.

The current registry is intentionally conservative: it reports migrations that should be checked while dependency ranges are bumped, but it does not rewrite application source files yet. Future entries can add executable transforms once a breaking change has a mechanical, well-tested rewrite.
