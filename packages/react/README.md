# @reckona/mreact

`@reckona/mreact` is the React-flavored public runtime entrypoint for mreact. It
re-exports the compatibility runtime and JSX runtimes under the package name
used by application code.

## New Apps

For app-router projects, start with the project generator. It installs the router, configures TypeScript, and creates a working route structure:

```bash
npx @reckona/create-mreact-app my-app --template basic --src-dir --pm pnpm
```

## Installation

Install the runtime packages directly when you are wiring Mreact into an existing project:

```bash
pnpm add @reckona/mreact @reckona/mreact-dom
```

Then configure TypeScript's automatic JSX runtime:

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
- The main entrypoint includes a React-style default namespace export for dependencies that import React as an object.
- `@reckona/mreact`, `@reckona/mreact/jsx-runtime`, and `@reckona/mreact/jsx-dev-runtime` also provide CommonJS `require()` entrypoints for CommonJS toolchains.
- `@reckona/mreact/jsx-runtime` is used by TypeScript and JSX transforms.
- `@reckona/mreact/jsx-dev-runtime` is used for development JSX output.

The JSX runtimes expose the global `JSX.Element` type expected by TypeScript tooling. The main entrypoint also exports React-style event helper types such as `FormEvent`, `FormEventHandler`, `JSXEvent`, and `JSXEventHandler`; for example, a form `onSubmit` handler receives an event whose `currentTarget` is typed as `HTMLFormElement`.

## Notes

This package is the user-facing React-like runtime name. The implementation
currently delegates to `@reckona/mreact-compat`; compiler-driven app rendering
is provided by `@reckona/mreact-router`.
