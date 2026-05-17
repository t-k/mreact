# Router Benchmark

## Environment

- Date: 2026-05-17
- Git commit: 7ed9542376ae9b526381f5b3bacdd6fb177b3476
- Node: v24.13.0
- NODE_ENV: production
- pnpm: 10.19.0
- Platform: linux x64
- CPU: AMD Ryzen 9 9950X 16-Core Processor (32)
- Memory: 200106930176 bytes
- Package versions:
  - @builder.io/qwik: 1.19.2
  - @qwik.dev/core: 2.0.0-beta.35
  - @qwik.dev/router: 2.0.0-beta.35
  - marko: 5.38.39
  - next: 16.2.6
  - react: 19.2.6
  - react-dom: 19.2.6
  - solid-js: 1.9.12
  - solid-js-2: 2.0.0-beta.13

## Rankings

### app render 1000 nodes

Renders a production app route that emits 1,000 simple text spans.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact-app-router+log enabled | app render 1000 nodes | 4930 | best | ops/sec |
| 2 | mreact-app-router | app render 1000 nodes | 4157 | -15.68% | ops/sec |
| 3 | marko-run | app render 1000 nodes | 3089 | -37.34% | ops/sec |
| 4 | tanstack-start | app render 1000 nodes | 2158 | -56.23% | ops/sec |
| 5 | qwik-city | app render 1000 nodes | 1416 | -71.28% | ops/sec |
| 6 | qwik-router-v2 | app render 1000 nodes | 1080 | -78.09% | ops/sec |
| 7 | solid-start | app render 1000 nodes | 682 | -86.17% | ops/sec |
| 8 | tanstack-start-solid | app render 1000 nodes | 560 | -88.64% | ops/sec |
| 9 | next-app-router | app render 1000 nodes | 204 | -95.86% | ops/sec |

### app streaming 1000 nodes

Streams a production app route with 1,000 simple text spans and validates the complete response body.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | marko-run | app streaming 1000 nodes | 3933 | best | ops/sec |
| 2 | mreact-app-router | app streaming 1000 nodes | 3477 | -11.59% | ops/sec |
| 3 | mreact-app-router+log enabled | app streaming 1000 nodes | 3378 | -14.11% | ops/sec |
| 4 | tanstack-start | app streaming 1000 nodes | 2245 | -42.92% | ops/sec |
| 5 | qwik-city | app streaming 1000 nodes | 1435 | -63.51% | ops/sec |
| 6 | qwik-router-v2 | app streaming 1000 nodes | 1023 | -73.99% | ops/sec |
| 7 | solid-start | app streaming 1000 nodes | 747 | -81.01% | ops/sec |
| 8 | tanstack-start-solid | app streaming 1000 nodes | 578 | -85.3% | ops/sec |
| 9 | next-app-router | app streaming 1000 nodes | 204 | -94.81% | ops/sec |

### app streaming first byte 1000 nodes

Measures elapsed time until fetch resolves response headers for the real streaming route.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | marko-run | app streaming first byte 1000 nodes | 0.4653 | best | ms |
| 2 | mreact-app-router | app streaming first byte 1000 nodes | 0.4812 | +3.42% | ms |
| 3 | mreact-app-router+log enabled | app streaming first byte 1000 nodes | 0.5193 | +11.61% | ms |
| 4 | qwik-city | app streaming first byte 1000 nodes | 0.6115 | +31.42% | ms |
| 5 | next-app-router | app streaming first byte 1000 nodes | 1.1673 | +150.87% | ms |
| 6 | solid-start | app streaming first byte 1000 nodes | 1.6712 | +259.17% | ms |
| 7 | tanstack-start | app streaming first byte 1000 nodes | 51.4917 | +10966.34% | ms |
| 8 | qwik-router-v2 | app streaming first byte 1000 nodes | 51.572 | +10983.6% | ms |
| 9 | tanstack-start-solid | app streaming first byte 1000 nodes | 52.3 | +11140.06% | ms |

### app streaming first chunk 1000 nodes

Measures elapsed time until the first response body chunk arrives for the real streaming route.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact-app-router | app streaming first chunk 1000 nodes | 0.4035 | best | ms |
| 2 | mreact-app-router+log enabled | app streaming first chunk 1000 nodes | 0.4342 | +7.61% | ms |
| 3 | marko-run | app streaming first chunk 1000 nodes | 0.5417 | +34.25% | ms |
| 4 | qwik-city | app streaming first chunk 1000 nodes | 0.6781 | +68.05% | ms |
| 5 | next-app-router | app streaming first chunk 1000 nodes | 1.2163 | +201.44% | ms |
| 6 | solid-start | app streaming first chunk 1000 nodes | 1.5542 | +285.18% | ms |
| 7 | tanstack-start | app streaming first chunk 1000 nodes | 50.8006 | +12489.99% | ms |
| 8 | qwik-router-v2 | app streaming first chunk 1000 nodes | 51.5732 | +12681.46% | ms |
| 9 | tanstack-start-solid | app streaming first chunk 1000 nodes | 52.0952 | +12810.83% | ms |

### app streaming full body 1000 nodes

Measures elapsed time until the complete real streaming response body is consumed and validated.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact-app-router | app streaming full body 1000 nodes | 50.6241 | best | ms |
| 2 | mreact-app-router+log enabled | app streaming full body 1000 nodes | 50.7017 | +0.15% | ms |
| 3 | marko-run | app streaming full body 1000 nodes | 50.9382 | +0.62% | ms |
| 4 | tanstack-start | app streaming full body 1000 nodes | 50.9471 | +0.64% | ms |
| 5 | solid-start | app streaming full body 1000 nodes | 51.1954 | +1.13% | ms |
| 6 | qwik-city | app streaming full body 1000 nodes | 51.5417 | +1.81% | ms |
| 7 | qwik-router-v2 | app streaming full body 1000 nodes | 51.6777 | +2.08% | ms |
| 8 | tanstack-start-solid | app streaming full body 1000 nodes | 52.3957 | +3.5% | ms |
| 9 | next-app-router | app streaming full body 1000 nodes | 54.6751 | +8% | ms |

### app real streaming 1000 nodes (async 50ms)

Streams a route whose body waits on a 50 ms async boundary before the full 1,000-node response completes.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact-app-router | app real streaming 1000 nodes (async 50ms) | 20 | best | ops/sec |
| 2 | marko-run | app real streaming 1000 nodes (async 50ms) | 20 | 0% | ops/sec |
| 3 | mreact-app-router+log enabled | app real streaming 1000 nodes (async 50ms) | 20 | 0% | ops/sec |
| 4 | solid-start | app real streaming 1000 nodes (async 50ms) | 20 | 0% | ops/sec |
| 5 | tanstack-start | app real streaming 1000 nodes (async 50ms) | 20 | 0% | ops/sec |
| 6 | qwik-city | app real streaming 1000 nodes (async 50ms) | 19 | -5% | ops/sec |
| 7 | qwik-router-v2 | app real streaming 1000 nodes (async 50ms) | 19 | -5% | ops/sec |
| 8 | tanstack-start-solid | app real streaming 1000 nodes (async 50ms) | 19 | -5% | ops/sec |
| 9 | next-app-router | app real streaming 1000 nodes (async 50ms) | 18 | -10% | ops/sec |

### app parallel async boundaries 2x50ms

Renders two sibling 50 ms async boundaries and reports whether total response latency stays near one boundary instead of waterfalling.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact-app-router+log enabled | app parallel async boundaries 2x50ms | 20 | best | ops/sec |
| 2 | solid-start | app parallel async boundaries 2x50ms | 20 | 0% | ops/sec |
| 3 | marko-run | app parallel async boundaries 2x50ms | 20 | 0% | ops/sec |
| 4 | mreact-app-router | app parallel async boundaries 2x50ms | 20 | 0% | ops/sec |
| 5 | qwik-city | app parallel async boundaries 2x50ms | 20 | 0% | ops/sec |
| 6 | tanstack-start | app parallel async boundaries 2x50ms | 20 | 0% | ops/sec |
| 7 | qwik-router-v2 | app parallel async boundaries 2x50ms | 20 | 0% | ops/sec |
| 8 | next-app-router | app parallel async boundaries 2x50ms | 19 | -5% | ops/sec |
| 9 | tanstack-start-solid | app parallel async boundaries 2x50ms | 19 | -5% | ops/sec |

### app static cached route 1000 nodes

Renders a static-cacheable app route with 1,000 simple text spans after the production server has warmed it.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact-app-router+log enabled | app static cached route 1000 nodes | 5950 | best | ops/sec |
| 2 | mreact-app-router | app static cached route 1000 nodes | 5701 | -4.18% | ops/sec |
| 3 | next-app-router | app static cached route 1000 nodes | 921 | -84.52% | ops/sec |

### app dynamic-attr grid 200 cells

Renders 200 cells with many dynamic escaped attributes, inline style values, and text content.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact-app-router | app dynamic-attr grid 200 cells | 3567 | best | ops/sec |
| 2 | mreact-app-router+log enabled | app dynamic-attr grid 200 cells | 3450 | -3.28% | ops/sec |
| 3 | marko-run | app dynamic-attr grid 200 cells | 2044 | -42.7% | ops/sec |
| 4 | tanstack-start | app dynamic-attr grid 200 cells | 1247 | -65.04% | ops/sec |
| 5 | qwik-city | app dynamic-attr grid 200 cells | 959 | -73.11% | ops/sec |
| 6 | solid-start | app dynamic-attr grid 200 cells | 714 | -79.98% | ops/sec |
| 7 | qwik-router-v2 | app dynamic-attr grid 200 cells | 690 | -80.66% | ops/sec |
| 8 | tanstack-start-solid | app dynamic-attr grid 200 cells | 617 | -82.7% | ops/sec |
| 9 | next-app-router | app dynamic-attr grid 200 cells | 274 | -92.32% | ops/sec |

### app dynamic route params data

Renders a dynamic route that combines route parameters with server data before producing HTML.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact-app-router | app dynamic route params data | 3498 | best | ops/sec |
| 2 | mreact-app-router+log enabled | app dynamic route params data | 3383 | -3.29% | ops/sec |
| 3 | marko-run | app dynamic route params data | 2015 | -42.4% | ops/sec |
| 4 | tanstack-start | app dynamic route params data | 1221 | -65.09% | ops/sec |
| 5 | qwik-city | app dynamic route params data | 978 | -72.04% | ops/sec |
| 6 | solid-start | app dynamic route params data | 732 | -79.07% | ops/sec |
| 7 | qwik-router-v2 | app dynamic route params data | 701 | -79.96% | ops/sec |
| 8 | tanstack-start-solid | app dynamic route params data | 606 | -82.68% | ops/sec |
| 9 | next-app-router | app dynamic route params data | 268 | -92.34% | ops/sec |

### app client navigation route-to-route

Measures route-to-route client navigation latency in a real browser when the adapter provides a browser probe.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid-start | app client navigation route-to-route | 53.4 | best | ms |
| 2 | mreact-app-router | app client navigation route-to-route | 53.7 | +0.56% | ms |
| 3 | mreact-app-router+log enabled | app client navigation route-to-route | 54 | +1.12% | ms |
| 4 | tanstack-start | app client navigation route-to-route | 54.2 | +1.5% | ms |
| 5 | next-app-router | app client navigation route-to-route | 55.5 | +3.93% | ms |
| 6 | qwik-city | app client navigation route-to-route | 100 | +87.27% | ms |
| 7 | qwik-router-v2 | app client navigation route-to-route | 101.7 | +90.45% | ms |

### app initial page load JS before interaction

Measures page load time until the interactive route is visible and idle before any user interaction.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact-app-router | app initial page load JS before interaction | 515.7569 | best | ms |
| 2 | mreact-app-router+log enabled | app initial page load JS before interaction | 515.8161 | +0.01% | ms |
| 3 | marko-run | app initial page load JS before interaction | 517.9461 | +0.42% | ms |
| 4 | solid-start | app initial page load JS before interaction | 518.7861 | +0.59% | ms |
| 5 | tanstack-start | app initial page load JS before interaction | 521.2397 | +1.06% | ms |
| 6 | qwik-city | app initial page load JS before interaction | 592.0134 | +14.79% | ms |
| 7 | next-app-router | app initial page load JS before interaction | 592.7424 | +14.93% | ms |
| 8 | qwik-router-v2 | app initial page load JS before interaction | 596.3543 | +15.63% | ms |

### app first interaction from DOMContentLoaded

Measures the first click-to-visible-update latency immediately after DOMContentLoaded without waiting for network idle.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid-start | app first interaction from DOMContentLoaded | 22.2 | best | ms |
| 2 | next-app-router | app first interaction from DOMContentLoaded | 37.1 | +67.12% | ms |
| 3 | mreact-app-router | app first interaction from DOMContentLoaded | 43.4 | +95.5% | ms |
| 4 | tanstack-start | app first interaction from DOMContentLoaded | 57 | +156.76% | ms |
| 5 | qwik-city | app first interaction from DOMContentLoaded | 62.4 | +181.08% | ms |
| 6 | marko-run | app first interaction from DOMContentLoaded | 70.2 | +216.22% | ms |
| 7 | mreact-app-router+log enabled | app first interaction from DOMContentLoaded | 113.6 | +411.71% | ms |
| 8 | qwik-router-v2 | app first interaction from DOMContentLoaded | 115.3 | +419.37% | ms |

### app first interaction after networkidle

Measures the first click-to-visible-update latency after the interactive route has reached network idle.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact-app-router | app first interaction after networkidle | 18.9 | best | ms |
| 2 | mreact-app-router+log enabled | app first interaction after networkidle | 21.6 | +14.29% | ms |
| 3 | next-app-router | app first interaction after networkidle | 26 | +37.57% | ms |
| 4 | tanstack-start | app first interaction after networkidle | 28.9 | +52.91% | ms |
| 5 | solid-start | app first interaction after networkidle | 29.2 | +54.5% | ms |
| 6 | marko-run | app first interaction after networkidle | 31.1 | +64.55% | ms |
| 7 | qwik-router-v2 | app first interaction after networkidle | 46.5 | +146.03% | ms |
| 8 | qwik-city | app first interaction after networkidle | 47 | +148.68% | ms |

### app second interaction latency

Measures the second click-to-visible-update latency after the route has already handled one client interaction.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | qwik-router-v2 | app second interaction latency | 27.5 | best | ms |
| 2 | tanstack-start | app second interaction latency | 31.5 | +14.55% | ms |
| 3 | next-app-router | app second interaction latency | 31.5 | +14.55% | ms |
| 4 | solid-start | app second interaction latency | 31.8 | +15.64% | ms |
| 5 | mreact-app-router | app second interaction latency | 32 | +16.36% | ms |
| 6 | mreact-app-router+log enabled | app second interaction latency | 32.2 | +17.09% | ms |
| 7 | marko-run | app second interaction latency | 32.4 | +17.82% | ms |
| 8 | qwik-city | app second interaction latency | 48.6 | +76.73% | ms |

### app server cold start

Measures production server cold-start latency when the adapter can isolate startup from build work.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
|  | no completed results |  |  |  |  |

### app client bundle gzip bytes (server-only page)

Measures gzip-compressed client JavaScript shipped for a route with no user-authored interactivity.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact-app-router | app client bundle gzip bytes (server-only page) | 0 |  | gzip bytes |
| 2 | mreact-app-router+log enabled | app client bundle gzip bytes (server-only page) | 0 |  | gzip bytes |
| 3 | marko-run | app client bundle gzip bytes (server-only page) | 1874 |  | gzip bytes |
| 4 | solid-start | app client bundle gzip bytes (server-only page) | 28774 |  | gzip bytes |
| 5 | qwik-city | app client bundle gzip bytes (server-only page) | 47716 |  | gzip bytes |
| 6 | tanstack-start-solid | app client bundle gzip bytes (server-only page) | 66437 |  | gzip bytes |
| 7 | qwik-router-v2 | app client bundle gzip bytes (server-only page) | 68172 |  | gzip bytes |
| 8 | tanstack-start | app client bundle gzip bytes (server-only page) | 112814 |  | gzip bytes |
| 9 | next-app-router | app client bundle gzip bytes (server-only page) | 185522 |  | gzip bytes |

### app client bundle gzip bytes (interactive page)

Measures gzip-compressed client JavaScript shipped for a minimal button-and-state interactive route.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | marko-run | app client bundle gzip bytes (interactive page) | 1874 | best | gzip bytes |
| 2 | mreact-app-router | app client bundle gzip bytes (interactive page) | 4128 | +120.28% | gzip bytes |
| 3 | mreact-app-router+log enabled | app client bundle gzip bytes (interactive page) | 4128 | +120.28% | gzip bytes |
| 4 | solid-start | app client bundle gzip bytes (interactive page) | 28774 | +1435.43% | gzip bytes |
| 5 | qwik-city | app client bundle gzip bytes (interactive page) | 47716 | +2446.21% | gzip bytes |
| 6 | tanstack-start-solid | app client bundle gzip bytes (interactive page) | 66437 | +3445.2% | gzip bytes |
| 7 | qwik-router-v2 | app client bundle gzip bytes (interactive page) | 68172 | +3537.78% | gzip bytes |
| 8 | tanstack-start | app client bundle gzip bytes (interactive page) | 112814 | +5919.96% | gzip bytes |
| 9 | next-app-router | app client bundle gzip bytes (interactive page) | 185522 | +9799.79% | gzip bytes |

### app client bundle gzip bytes (interactive page, minimal opt-out)

Measures the same interactive route while opting out of optional client navigation runtime where the framework supports it.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | marko-run | app client bundle gzip bytes (interactive page, minimal opt-out) | 1874 | best | gzip bytes |
| 2 | mreact-app-router | app client bundle gzip bytes (interactive page, minimal opt-out) | 3010 | +60.62% | gzip bytes |
| 3 | mreact-app-router+log enabled | app client bundle gzip bytes (interactive page, minimal opt-out) | 3011 | +60.67% | gzip bytes |
| 4 | solid-start | app client bundle gzip bytes (interactive page, minimal opt-out) | 28774 | +1435.43% | gzip bytes |
| 5 | qwik-city | app client bundle gzip bytes (interactive page, minimal opt-out) | 47716 | +2446.21% | gzip bytes |
| 6 | tanstack-start-solid | app client bundle gzip bytes (interactive page, minimal opt-out) | 66437 | +3445.2% | gzip bytes |
| 7 | qwik-router-v2 | app client bundle gzip bytes (interactive page, minimal opt-out) | 68172 | +3537.78% | gzip bytes |
| 8 | tanstack-start | app client bundle gzip bytes (interactive page, minimal opt-out) | 112814 | +5919.96% | gzip bytes |
| 9 | next-app-router | app client bundle gzip bytes (interactive page, minimal opt-out) | 185522 | +9799.79% | gzip bytes |

### app build output gzip bytes

Measures gzip-compressed production build output size when the adapter exposes build artifacts.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
|  | no completed results |  |  |  |  |

## Results

| suite | framework | version | case | status | metric | unit | value | diff vs 1st | gzip bytes | hz | mean ms | p75 ms | p99 ms | note |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| router | marko-run | 0.10.0 | app render 1000 nodes | completed | throughput | ops/sec | 3089 | -37.34% | 0 | 3089 | 0.3496 | 0.3441 | 0.8483 |  |
| router | marko-run | 0.10.0 | app streaming 1000 nodes | completed | throughput | ops/sec | 3933 | best | 0 | 3933 | 0.2762 | 0.2639 | 0.7536 |  |
| router | marko-run | 0.10.0 | app dynamic route params data | completed | throughput | ops/sec | 2015 | -42.4% | 0 | 2015 | 0.5215 | 0.5094 | 1.3125 |  |
| router | marko-run | 0.10.0 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0% | 0 | 20 | 50.786 | 51.1388 | 51.4077 |  |
| router | marko-run | 0.10.0 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0% | 0 | 20 | 50.7339 | 50.9695 | 51.4683 |  |
| router | marko-run | 0.10.0 | app static cached route 1000 nodes | unsupported | throughput | ops/sec | 0 |  | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app static cached route 1000 nodes |
| router | marko-run | 0.10.0 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 2044 | -42.7% | 0 | 2044 | 0.5111 | 0.505 | 1.2107 |  |
| router | marko-run | 0.10.0 | app streaming first byte 1000 nodes | completed | duration | ms | 0.4653 | best | 0 | 0 | 0.4596 | 0.607 | 0.6238 |  |
| router | marko-run | 0.10.0 | app streaming first chunk 1000 nodes | completed | duration | ms | 0.5417 | +34.25% | 0 | 0 | 0.5391 | 0.5975 | 0.6125 |  |
| router | marko-run | 0.10.0 | app streaming full body 1000 nodes | completed | duration | ms | 50.9382 | +0.62% | 0 | 0 | 50.9444 | 50.9833 | 51.2421 |  |
| router | marko-run | 0.10.0 | app client navigation route-to-route | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app client navigation route-to-route |
| router | marko-run | 0.10.0 | app initial page load JS before interaction | completed | duration | ms | 517.9461 | +0.42% | 0 | 0 | 517.905 | 518.5354 | 518.5776 |  |
| router | marko-run | 0.10.0 | app first interaction from DOMContentLoaded | completed | duration | ms | 70.2 | +216.22% | 0 | 0 | 70.3714 | 71.8 | 77.6 |  |
| router | marko-run | 0.10.0 | app first interaction after networkidle | completed | duration | ms | 31.1 | +64.55% | 0 | 0 | 26.7857 | 33.2 | 33.6 |  |
| router | marko-run | 0.10.0 | app second interaction latency | completed | duration | ms | 32.4 | +17.82% | 0 | 0 | 32.4143 | 32.6 | 32.8 |  |
| router | marko-run | 0.10.0 | app server cold start | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app server cold start |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 1874 |  | 1874 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 1874 | best | 1874 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 1874 | best | 1874 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app build output gzip bytes | unsupported | size | gzip bytes | 0 |  | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app build output gzip bytes |
| router | qwik-city | 1.19.2 | app render 1000 nodes | completed | throughput | ops/sec | 1416 | -71.28% | 0 | 1416 | 0.7322 | 0.7572 | 1.3156 |  |
| router | qwik-city | 1.19.2 | app streaming 1000 nodes | completed | throughput | ops/sec | 1435 | -63.51% | 0 | 1435 | 0.7232 | 0.7076 | 1.3495 |  |
| router | qwik-city | 1.19.2 | app dynamic route params data | completed | throughput | ops/sec | 978 | -72.04% | 0 | 978 | 1.0555 | 1.0222 | 2.0736 |  |
| router | qwik-city | 1.19.2 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 19 | -5% | 0 | 19 | 51.527 | 51.7282 | 52.5227 |  |
| router | qwik-city | 1.19.2 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0% | 0 | 20 | 50.939 | 51.1375 | 51.3933 |  |
| router | qwik-city | 1.19.2 | app static cached route 1000 nodes | unsupported | throughput | ops/sec | 0 |  | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app static cached route 1000 nodes |
| router | qwik-city | 1.19.2 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 959 | -73.11% | 0 | 959 | 1.0805 | 1.1035 | 2.0608 |  |
| router | qwik-city | 1.19.2 | app streaming first byte 1000 nodes | completed | duration | ms | 0.6115 | +31.42% | 0 | 0 | 0.6776 | 0.8367 | 0.8952 |  |
| router | qwik-city | 1.19.2 | app streaming first chunk 1000 nodes | completed | duration | ms | 0.6781 | +68.05% | 0 | 0 | 0.6477 | 0.7788 | 0.7933 |  |
| router | qwik-city | 1.19.2 | app streaming full body 1000 nodes | completed | duration | ms | 51.5417 | +1.81% | 0 | 0 | 51.5197 | 51.7212 | 51.7738 |  |
| router | qwik-city | 1.19.2 | app client navigation route-to-route | completed | duration | ms | 100 | +87.27% | 0 | 0 | 100.5857 | 101.3 | 104.4 |  |
| router | qwik-city | 1.19.2 | app initial page load JS before interaction | completed | duration | ms | 592.0134 | +14.79% | 0 | 0 | 595.6715 | 630.0666 | 639.327 |  |
| router | qwik-city | 1.19.2 | app first interaction from DOMContentLoaded | completed | duration | ms | 62.4 | +181.08% | 0 | 0 | 65.9571 | 80.8 | 85.6 |  |
| router | qwik-city | 1.19.2 | app first interaction after networkidle | completed | duration | ms | 47 | +148.68% | 0 | 0 | 47.4571 | 52.3 | 53.6 |  |
| router | qwik-city | 1.19.2 | app second interaction latency | completed | duration | ms | 48.6 | +76.73% | 0 | 0 | 48.5714 | 48.9 | 49 |  |
| router | qwik-city | 1.19.2 | app server cold start | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app server cold start |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 47716 |  | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 47716 | +2446.21% | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 47716 | +2446.21% | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app build output gzip bytes | unsupported | size | gzip bytes | 0 |  | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app build output gzip bytes |
| router | qwik-router-v2 | 2.0.0-beta.35 | app render 1000 nodes | completed | throughput | ops/sec | 1080 | -78.09% | 0 | 1080 | 1.0451 | 0.9454 | 3.5058 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app streaming 1000 nodes | completed | throughput | ops/sec | 1023 | -73.99% | 0 | 1023 | 1.0916 | 0.9683 | 3.5575 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app dynamic route params data | completed | throughput | ops/sec | 701 | -79.96% | 0 | 701 | 1.5698 | 1.4011 | 4.3134 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 19 | -5% | 0 | 19 | 51.9535 | 51.9396 | 53.9574 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0% | 0 | 20 | 51.2821 | 51.563 | 52.3538 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app static cached route 1000 nodes | unsupported | throughput | ops/sec | 0 |  | 0 | 0 | 0 | 0 | 0 | qwik-router-v2 does not implement app static cached route 1000 nodes |
| router | qwik-router-v2 | 2.0.0-beta.35 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 690 | -80.66% | 0 | 690 | 1.5932 | 1.4358 | 4.4424 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app streaming first byte 1000 nodes | completed | duration | ms | 51.572 | +10983.6% | 0 | 0 | 51.5499 | 51.6317 | 51.7837 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app streaming first chunk 1000 nodes | completed | duration | ms | 51.5732 | +12681.46% | 0 | 0 | 51.5884 | 51.6862 | 51.7394 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app streaming full body 1000 nodes | completed | duration | ms | 51.6777 | +2.08% | 0 | 0 | 51.67 | 51.742 | 51.7884 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app client navigation route-to-route | completed | duration | ms | 101.7 | +90.45% | 0 | 0 | 101.8714 | 103.3 | 103.8 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app initial page load JS before interaction | completed | duration | ms | 596.3543 | +15.63% | 0 | 0 | 603.6094 | 634.804 | 642.5442 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app first interaction from DOMContentLoaded | completed | duration | ms | 115.3 | +419.37% | 0 | 0 | 107.0714 | 119 | 121.2 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app first interaction after networkidle | completed | duration | ms | 46.5 | +146.03% | 0 | 0 | 45.6714 | 52.4 | 54.5 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app second interaction latency | completed | duration | ms | 27.5 | best | 0 | 0 | 27.5143 | 28 | 28.4 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app server cold start | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | qwik-router-v2 does not implement app server cold start |
| router | qwik-router-v2 | 2.0.0-beta.35 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 68172 |  | 68172 | 0 | 0 | 0 | 0 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 68172 | +3537.78% | 68172 | 0 | 0 | 0 | 0 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 68172 | +3537.78% | 68172 | 0 | 0 | 0 | 0 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app build output gzip bytes | unsupported | size | gzip bytes | 0 |  | 0 | 0 | 0 | 0 | 0 | qwik-router-v2 does not implement app build output gzip bytes |
| router | solid-start | 1.3.2 | app render 1000 nodes | completed | throughput | ops/sec | 682 | -86.17% | 0 | 682 | 1.6858 | 1.6473 | 7.3705 |  |
| router | solid-start | 1.3.2 | app streaming 1000 nodes | completed | throughput | ops/sec | 747 | -81.01% | 0 | 747 | 1.5742 | 1.5944 | 5.6494 |  |
| router | solid-start | 1.3.2 | app dynamic route params data | completed | throughput | ops/sec | 732 | -79.07% | 0 | 732 | 1.4669 | 1.4967 | 2.6258 |  |
| router | solid-start | 1.3.2 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0% | 0 | 20 | 50.9879 | 51.2185 | 51.6756 |  |
| router | solid-start | 1.3.2 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0% | 0 | 20 | 50.6975 | 50.9043 | 51.2457 |  |
| router | solid-start | 1.3.2 | app static cached route 1000 nodes | unsupported | throughput | ops/sec | 0 |  | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app static cached route 1000 nodes |
| router | solid-start | 1.3.2 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 714 | -79.98% | 0 | 714 | 1.5033 | 1.5154 | 3.1284 |  |
| router | solid-start | 1.3.2 | app streaming first byte 1000 nodes | completed | duration | ms | 1.6712 | +259.17% | 0 | 0 | 1.7221 | 1.871 | 1.9301 |  |
| router | solid-start | 1.3.2 | app streaming first chunk 1000 nodes | completed | duration | ms | 1.5542 | +285.18% | 0 | 0 | 1.5717 | 1.6014 | 1.6014 |  |
| router | solid-start | 1.3.2 | app streaming full body 1000 nodes | completed | duration | ms | 51.1954 | +1.13% | 0 | 0 | 51.0821 | 51.3031 | 51.4555 |  |
| router | solid-start | 1.3.2 | app client navigation route-to-route | completed | duration | ms | 53.4 | best | 0 | 0 | 53.4 | 53.7 | 53.9 |  |
| router | solid-start | 1.3.2 | app initial page load JS before interaction | completed | duration | ms | 518.7861 | +0.59% | 0 | 0 | 518.6951 | 519.27 | 519.285 |  |
| router | solid-start | 1.3.2 | app first interaction from DOMContentLoaded | completed | duration | ms | 22.2 | best | 0 | 0 | 28.2286 | 53.8 | 54.3 |  |
| router | solid-start | 1.3.2 | app first interaction after networkidle | completed | duration | ms | 29.2 | +54.5% | 0 | 0 | 27.5571 | 30.8 | 32.3 |  |
| router | solid-start | 1.3.2 | app second interaction latency | completed | duration | ms | 31.8 | +15.64% | 0 | 0 | 31.7714 | 31.9 | 32 |  |
| router | solid-start | 1.3.2 | app server cold start | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app server cold start |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 28774 |  | 28774 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 28774 | +1435.43% | 28774 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 28774 | +1435.43% | 28774 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app build output gzip bytes | unsupported | size | gzip bytes | 0 |  | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app build output gzip bytes |
| router | tanstack-start | 1.167.65 | app render 1000 nodes | completed | throughput | ops/sec | 2158 | -56.23% | 0 | 2158 | 0.4876 | 0.4664 | 1.5487 |  |
| router | tanstack-start | 1.167.65 | app streaming 1000 nodes | completed | throughput | ops/sec | 2245 | -42.92% | 0 | 2245 | 0.4654 | 0.446 | 1.5471 |  |
| router | tanstack-start | 1.167.65 | app dynamic route params data | completed | throughput | ops/sec | 1221 | -65.09% | 0 | 1221 | 0.8409 | 0.819 | 1.9002 |  |
| router | tanstack-start | 1.167.65 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0% | 0 | 20 | 51.2684 | 51.3888 | 51.8632 |  |
| router | tanstack-start | 1.167.65 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0% | 0 | 20 | 50.9492 | 51.0591 | 51.5543 |  |
| router | tanstack-start | 1.167.65 | app static cached route 1000 nodes | unsupported | throughput | ops/sec | 0 |  | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app static cached route 1000 nodes |
| router | tanstack-start | 1.167.65 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 1247 | -65.04% | 0 | 1247 | 0.8233 | 0.8196 | 1.6012 |  |
| router | tanstack-start | 1.167.65 | app streaming first byte 1000 nodes | completed | duration | ms | 51.4917 | +10966.34% | 0 | 0 | 51.2961 | 51.529 | 51.7384 |  |
| router | tanstack-start | 1.167.65 | app streaming first chunk 1000 nodes | completed | duration | ms | 50.8006 | +12489.99% | 0 | 0 | 50.9089 | 51.1303 | 51.2441 |  |
| router | tanstack-start | 1.167.65 | app streaming full body 1000 nodes | completed | duration | ms | 50.9471 | +0.64% | 0 | 0 | 50.9621 | 51.0236 | 51.0283 |  |
| router | tanstack-start | 1.167.65 | app client navigation route-to-route | completed | duration | ms | 54.2 | +1.5% | 0 | 0 | 54.4 | 55 | 55 |  |
| router | tanstack-start | 1.167.65 | app initial page load JS before interaction | completed | duration | ms | 521.2397 | +1.06% | 0 | 0 | 521.4465 | 521.8543 | 522.6069 |  |
| router | tanstack-start | 1.167.65 | app first interaction from DOMContentLoaded | completed | duration | ms | 57 | +156.76% | 0 | 0 | 55.3 | 73.7 | 79.2 |  |
| router | tanstack-start | 1.167.65 | app first interaction after networkidle | completed | duration | ms | 28.9 | +52.91% | 0 | 0 | 27.7 | 34.1 | 34.4 |  |
| router | tanstack-start | 1.167.65 | app second interaction latency | completed | duration | ms | 31.5 | +14.55% | 0 | 0 | 31.4571 | 31.7 | 31.7 |  |
| router | tanstack-start | 1.167.65 | app server cold start | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app server cold start |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 112814 |  | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 112814 | +5919.96% | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 112814 | +5919.96% | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app build output gzip bytes | unsupported | size | gzip bytes | 0 |  | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app build output gzip bytes |
| router | tanstack-start-solid | 2.0.0-beta.18 | app render 1000 nodes | completed | throughput | ops/sec | 560 | -88.64% | 0 | 560 | 1.9356 | 1.8683 | 7.5203 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app streaming 1000 nodes | completed | throughput | ops/sec | 578 | -85.3% | 0 | 578 | 1.888 | 1.7697 | 7.9167 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app dynamic route params data | completed | throughput | ops/sec | 606 | -82.68% | 0 | 606 | 1.7991 | 1.6962 | 8.1267 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 19 | -5% | 0 | 19 | 52.5149 | 52.5969 | 56.8184 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 19 | -5% | 0 | 19 | 52.1641 | 52.2406 | 52.8932 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app static cached route 1000 nodes | unsupported | throughput | ops/sec | 0 |  | 0 | 0 | 0 | 0 | 0 | tanstack-start-solid does not implement app static cached route 1000 nodes |
| router | tanstack-start-solid | 2.0.0-beta.18 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 617 | -82.7% | 0 | 617 | 1.7803 | 1.6543 | 8.9197 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app streaming first byte 1000 nodes | completed | duration | ms | 52.3 | +11140.06% | 0 | 0 | 52.1524 | 52.3208 | 52.34 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app streaming first chunk 1000 nodes | completed | duration | ms | 52.0952 | +12810.83% | 0 | 0 | 51.9716 | 52.1753 | 52.2382 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app streaming full body 1000 nodes | completed | duration | ms | 52.3957 | +3.5% | 0 | 0 | 53.1867 | 52.6362 | 58.5274 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app client navigation route-to-route | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | tanstack-start-solid does not implement app client navigation route-to-route |
| router | tanstack-start-solid | 2.0.0-beta.18 | app initial page load JS before interaction | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | tanstack-start-solid does not implement app initial page load JS before interaction |
| router | tanstack-start-solid | 2.0.0-beta.18 | app first interaction from DOMContentLoaded | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | tanstack-start-solid does not implement app first interaction from DOMContentLoaded |
| router | tanstack-start-solid | 2.0.0-beta.18 | app first interaction after networkidle | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | tanstack-start-solid does not implement app first interaction after networkidle |
| router | tanstack-start-solid | 2.0.0-beta.18 | app second interaction latency | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | tanstack-start-solid does not implement app second interaction latency |
| router | tanstack-start-solid | 2.0.0-beta.18 | app server cold start | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | tanstack-start-solid does not implement app server cold start |
| router | tanstack-start-solid | 2.0.0-beta.18 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 66437 |  | 66437 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 66437 | +3445.2% | 66437 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 66437 | +3445.2% | 66437 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app build output gzip bytes | unsupported | size | gzip bytes | 0 |  | 0 | 0 | 0 | 0 | 0 | tanstack-start-solid does not implement app build output gzip bytes |
| router | next-app-router | 16.2.6 | app render 1000 nodes | completed | throughput | ops/sec | 204 | -95.86% | 0 | 204 | 4.9643 | 4.937 | 7.0513 |  |
| router | next-app-router | 16.2.6 | app streaming 1000 nodes | completed | throughput | ops/sec | 204 | -94.81% | 0 | 204 | 5.0034 | 4.8678 | 7.9261 |  |
| router | next-app-router | 16.2.6 | app dynamic route params data | completed | throughput | ops/sec | 268 | -92.34% | 0 | 268 | 3.799 | 3.7016 | 5.7496 |  |
| router | next-app-router | 16.2.6 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 18 | -10% | 0 | 18 | 54.2912 | 54.4884 | 56.7518 |  |
| router | next-app-router | 16.2.6 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 19 | -5% | 0 | 19 | 51.2878 | 51.3669 | 52.4591 |  |
| router | next-app-router | 16.2.6 | app static cached route 1000 nodes | completed | throughput | ops/sec | 921 | -84.52% | 0 | 921 | 1.15 | 1.0708 | 3.9307 |  |
| router | next-app-router | 16.2.6 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 274 | -92.32% | 0 | 274 | 3.7061 | 3.6149 | 5.9732 |  |
| router | next-app-router | 16.2.6 | app streaming first byte 1000 nodes | completed | duration | ms | 1.1673 | +150.87% | 0 | 0 | 1.1522 | 1.305 | 1.3958 |  |
| router | next-app-router | 16.2.6 | app streaming first chunk 1000 nodes | completed | duration | ms | 1.2163 | +201.44% | 0 | 0 | 1.2243 | 1.2707 | 1.2776 |  |
| router | next-app-router | 16.2.6 | app streaming full body 1000 nodes | completed | duration | ms | 54.6751 | +8% | 0 | 0 | 54.5898 | 54.923 | 55.3003 |  |
| router | next-app-router | 16.2.6 | app client navigation route-to-route | completed | duration | ms | 55.5 | +3.93% | 0 | 0 | 56.7714 | 55.6 | 65.8 |  |
| router | next-app-router | 16.2.6 | app initial page load JS before interaction | completed | duration | ms | 592.7424 | +14.93% | 0 | 0 | 588.4491 | 598.2752 | 625.0963 |  |
| router | next-app-router | 16.2.6 | app first interaction from DOMContentLoaded | completed | duration | ms | 37.1 | +67.12% | 0 | 0 | 58.3429 | 91.1 | 124.2 |  |
| router | next-app-router | 16.2.6 | app first interaction after networkidle | completed | duration | ms | 26 | +37.57% | 0 | 0 | 25.9143 | 26.9 | 33.3 |  |
| router | next-app-router | 16.2.6 | app second interaction latency | completed | duration | ms | 31.5 | +14.55% | 0 | 0 | 31.3429 | 31.6 | 31.6 |  |
| router | next-app-router | 16.2.6 | app server cold start | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app server cold start |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 185522 |  | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 185522 | +9799.79% | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 185522 | +9799.79% | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app build output gzip bytes | unsupported | size | gzip bytes | 0 |  | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app build output gzip bytes |
| router | mreact-app-router | workspace | app render 1000 nodes | completed | throughput | ops/sec | 4157 | -15.68% | 0 | 4157 | 0.2561 | 0.2538 | 0.6203 |  |
| router | mreact-app-router | workspace | app streaming 1000 nodes | completed | throughput | ops/sec | 3477 | -11.59% | 0 | 3477 | 0.3071 | 0.294 | 1.2098 |  |
| router | mreact-app-router | workspace | app dynamic route params data | completed | throughput | ops/sec | 3498 | best | 0 | 3498 | 0.3154 | 0.2847 | 1.4765 |  |
| router | mreact-app-router | workspace | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | best | 0 | 20 | 50.7761 | 50.967 | 51.54 |  |
| router | mreact-app-router | workspace | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0% | 0 | 20 | 50.7773 | 50.9708 | 51.4948 |  |
| router | mreact-app-router | workspace | app static cached route 1000 nodes | completed | throughput | ops/sec | 5701 | -4.18% | 0 | 5701 | 0.1932 | 0.1785 | 0.6554 |  |
| router | mreact-app-router | workspace | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 3567 | best | 0 | 3567 | 0.3129 | 0.279 | 1.4553 |  |
| router | mreact-app-router | workspace | app streaming first byte 1000 nodes | completed | duration | ms | 0.4812 | +3.42% | 0 | 0 | 0.4737 | 0.51 | 0.5303 |  |
| router | mreact-app-router | workspace | app streaming first chunk 1000 nodes | completed | duration | ms | 0.4035 | best | 0 | 0 | 0.4107 | 0.4271 | 0.4605 |  |
| router | mreact-app-router | workspace | app streaming full body 1000 nodes | completed | duration | ms | 50.6241 | best | 0 | 0 | 50.5707 | 50.7073 | 50.7084 |  |
| router | mreact-app-router | workspace | app client navigation route-to-route | completed | duration | ms | 53.7 | +0.56% | 0 | 0 | 53.5429 | 53.8 | 54.1 |  |
| router | mreact-app-router | workspace | app initial page load JS before interaction | completed | duration | ms | 515.7569 | best | 0 | 0 | 515.7208 | 516.1753 | 516.2008 |  |
| router | mreact-app-router | workspace | app first interaction from DOMContentLoaded | completed | duration | ms | 43.4 | +95.5% | 0 | 0 | 58 | 110 | 110 |  |
| router | mreact-app-router | workspace | app first interaction after networkidle | completed | duration | ms | 18.9 | best | 0 | 0 | 23.6 | 32.2 | 32.5 |  |
| router | mreact-app-router | workspace | app second interaction latency | completed | duration | ms | 32 | +16.36% | 0 | 0 | 32.0429 | 32.4 | 33 |  |
| router | mreact-app-router | workspace | app server cold start | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app server cold start |
| router | mreact-app-router | workspace | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 0 |  | 0 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 4128 | +120.28% | 4128 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 3010 | +60.62% | 3010 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app build output gzip bytes | unsupported | size | gzip bytes | 0 |  | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app build output gzip bytes |
| router | mreact-app-router+log enabled | workspace | app render 1000 nodes | completed | throughput | ops/sec | 4930 | best | 0 | 4930 | 0.2199 | 0.2105 | 0.4493 |  |
| router | mreact-app-router+log enabled | workspace | app streaming 1000 nodes | completed | throughput | ops/sec | 3378 | -14.11% | 0 | 3378 | 0.3148 | 0.3 | 1.0502 |  |
| router | mreact-app-router+log enabled | workspace | app dynamic route params data | completed | throughput | ops/sec | 3383 | -3.29% | 0 | 3383 | 0.3279 | 0.2912 | 1.5146 |  |
| router | mreact-app-router+log enabled | workspace | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0% | 0 | 20 | 50.9755 | 51.1045 | 52.6794 |  |
| router | mreact-app-router+log enabled | workspace | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | best | 0 | 20 | 50.6752 | 50.9158 | 51.2531 |  |
| router | mreact-app-router+log enabled | workspace | app static cached route 1000 nodes | completed | throughput | ops/sec | 5950 | best | 0 | 5950 | 0.1841 | 0.1692 | 0.6295 |  |
| router | mreact-app-router+log enabled | workspace | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 3450 | -3.28% | 0 | 3450 | 0.3188 | 0.2862 | 1.4837 |  |
| router | mreact-app-router+log enabled | workspace | app streaming first byte 1000 nodes | completed | duration | ms | 0.5193 | +11.61% | 0 | 0 | 0.5097 | 0.5978 | 0.5994 |  |
| router | mreact-app-router+log enabled | workspace | app streaming first chunk 1000 nodes | completed | duration | ms | 0.4342 | +7.61% | 0 | 0 | 0.4371 | 0.4534 | 0.4669 |  |
| router | mreact-app-router+log enabled | workspace | app streaming full body 1000 nodes | completed | duration | ms | 50.7017 | +0.15% | 0 | 0 | 50.6217 | 50.785 | 51.0484 |  |
| router | mreact-app-router+log enabled | workspace | app client navigation route-to-route | completed | duration | ms | 54 | +1.12% | 0 | 0 | 53.8143 | 54.4 | 54.5 |  |
| router | mreact-app-router+log enabled | workspace | app initial page load JS before interaction | completed | duration | ms | 515.8161 | +0.01% | 0 | 0 | 516.0526 | 516.8143 | 517.1535 |  |
| router | mreact-app-router+log enabled | workspace | app first interaction from DOMContentLoaded | completed | duration | ms | 113.6 | +411.71% | 0 | 0 | 100.6286 | 116.3 | 120.4 |  |
| router | mreact-app-router+log enabled | workspace | app first interaction after networkidle | completed | duration | ms | 21.6 | +14.29% | 0 | 0 | 23.6 | 29.1 | 33.2 |  |
| router | mreact-app-router+log enabled | workspace | app second interaction latency | completed | duration | ms | 32.2 | +17.09% | 0 | 0 | 32.2143 | 32.5 | 32.8 |  |
| router | mreact-app-router+log enabled | workspace | app server cold start | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | mreact-app-router+log enabled does not implement app server cold start |
| router | mreact-app-router+log enabled | workspace | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 0 |  | 0 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router+log enabled | workspace | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 4128 | +120.28% | 4128 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router+log enabled | workspace | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 3011 | +60.67% | 3011 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router+log enabled | workspace | app build output gzip bytes | unsupported | size | gzip bytes | 0 |  | 0 | 0 | 0 | 0 | 0 | mreact-app-router+log enabled does not implement app build output gzip bytes |
