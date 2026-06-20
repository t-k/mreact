# react-libraries example

This example shows React ecosystem libraries running inside an Mreact app through compatibility boundaries. It includes Recharts charts, a Lexical editor, Conform + Zod forms, and a Radix UI dialog.

## Prerequisites

Build the workspace packages once from the repository root:

```bash
pnpm install
pnpm -r --filter "./packages/*" build
```

## Run

```bash
cd examples/react-libraries
pnpm install
pnpm dev
```

Open `http://localhost:3013/` to inspect the demo. The app uses `mreactRouter()` with routes from `app/`, so each page is still a normal Mreact app-router route.

## Test

```bash
pnpm test:e2e
```

The Playwright scenario starts the example and checks the React library integration flows.

## What To Inspect

- `app/charts/page.tsx` and `app/components/*.compat.tsx` render Recharts through compatibility components.
- `app/editor/LexicalEditor.compat.tsx` mounts Lexical editor state behind a compatibility boundary.
- `app/forms/SignupForm.compat.tsx` combines Conform and Zod validation in a React-style form.
- `app/dialog/DialogDemo.compat.tsx` renders the Radix UI dialog integration.
- `vite.config.ts` pre-bundles the React ecosystem libraries used by the demo so local navigation does not trigger mid-session dependency discovery reloads.
