# virtual-grid

Standalone demo for `@reckona/mreact-virtual`. It renders a 500-photo gallery through `createVirtualGrid`, displays range and spacer telemetry, and keeps the DOM bounded while paging or jumping between the start and end of the dataset.

## Run

```bash
pnpm install
pnpm dev    # http://localhost:5177/index.html
```

## Tour

| File | Demonstrates |
|---|---|
| `src/gallery.ts` | Shared data fixture, virtualizer setup, scroll helpers, and testable range labels |
| `src/App.tsx` | Rendering top spacer, bounded keyed entries, bottom spacer, and telemetry |
| `index.html` | Minimal styling with fixed grid geometry and containment |

## Test Coverage

- `examples/unit/examples.test.ts` verifies the 500-photo data contract, fixed-size range projection, end jump, and return-to-top behavior without a browser.
- `examples/e2e/examples.spec.ts` starts the Vite example and verifies bounded DOM card counts, visible range telemetry, spacer updates, and scroll restoration in Playwright.
