# @reckona/mreact

`@reckona/mreact` is the React-flavored public runtime entrypoint for mreact. It
re-exports the compatibility runtime and JSX runtimes under the package name
used by application code.

## Installation

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@reckona/mreact"
  }
}
```

## Exports

- `@reckona/mreact` exposes the React-compatible runtime surface.
- `@reckona/mreact/jsx-runtime` is used by TypeScript and JSX transforms.
- `@reckona/mreact/jsx-dev-runtime` is used for development JSX output.

## Notes

This package is the user-facing React-like runtime name. The implementation
currently delegates to `@reckona/mreact-compat`; compiler-driven app rendering
is provided by `@reckona/mreact-router`.
