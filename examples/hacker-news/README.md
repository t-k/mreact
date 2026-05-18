# @reckona/example-hacker-news

Hacker News dogfood example for the mreact app router.

## Scripts

- `pnpm run dev`
- `pnpm run build`
- `pnpm run test`
- `pnpm run worker:check`
- `pnpm run start`

Tailwind CSS v4 is configured in `src/app/globals.css`.

## Troubleshooting

### pnpm approve-builds warning

pnpm 10 may print an `Ignored build scripts` warning for transitive tooling packages such as `esbuild`, `@parcel/watcher`, `sharp`, or `workerd`. The starter project is safe to continue installing and building when this warning appears. If local development, Tailwind watch mode, or Cloudflare preview later reports a missing native binary, run `pnpm approve-builds` and approve the listed tooling packages for this project.
