# @reckona/create-mreact-app

Project scaffolder for mreact app-router applications.

```bash
npx @reckona/create-mreact-app my-app --template app-router
```

Generated apps include an explicit `vite.config.ts` with the mreact router
plugin. The default route directory is `app`.

## Templates

- `basic`
- `app-router`
- `app-router-tailwind`
- `cloudflare`

## Options

```bash
npx @reckona/create-mreact-app my-app --template app-router-tailwind --pm pnpm
```

Supported package managers are `pnpm`, `npm`, and `bun`.

Use `--src-dir` to generate a larger-app layout:

```bash
npx @reckona/create-mreact-app my-app --template app-router --src-dir
```

That creates `src/app` for routes, `src/lib` for shared application code, and
root-level `public` for static assets.
