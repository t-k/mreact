# Client bundle-size budgets miss router and app-level entry points

## Summary

The bundle-size budget script tracks core runtime packages, but it does not
budget the router client runtime, query runtime, or composed app-level client
bundles. This leaves important deployed JavaScript surfaces without regression
guards.

## Evidence

`size/run.ts` currently measures only:

- `reactive-core`
- `reactive-dom`
- `react-compat`
- `react-compat/jsx-runtime`
- `server/reorder`

The same script sets budgets only for those entries. It does not include:

- the router client/navigation runtime;
- `@reckona/mreact-query`;
- a composed interactive route bundle;
- an app-router navigation-runtime bundle;
- the app-router route prefetch manifest helper surface.

The router benchmark adapter does measure app-level client bundle bytes for
server-only, interactive, and minimal opt-out pages, but those measurements are
not part of `pnpm size:check`.

## Impact

Client-side regressions can land in router/query/navigation code without failing
the size budget check. This is especially risky because mreact's positioning
depends on not shipping client runtime for server-only routes and keeping the
optional navigation/runtime payload small.

## Suggested fix

Expand `size/run.ts` to include:

1. router client/navigation runtime entry points;
2. query runtime entry points;
3. a composed minimal interactive app-router bundle;
4. a composed server-only route check that asserts zero user-visible client JS
   where the benchmark expects zero.

Use the existing benchmark bundle measurement code as the source of truth where
possible, then add explicit gzip budgets to `pnpm size:check`.

## Priority

Medium.
