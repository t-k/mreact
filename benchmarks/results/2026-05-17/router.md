# Router Benchmark

## Environment

- Date: 2026-05-17
- Git commit: 10d00d651167f0a678058cc7c32cc26d1d9c4320
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
| 1 | mreact-app-router+log enabled | app render 1000 nodes | 5050 | best | ops/sec |
| 2 | mreact-app-router | app render 1000 nodes | 3712 | -26.5% | ops/sec |
| 3 | marko-run | app render 1000 nodes | 3360 | -33.47% | ops/sec |
| 4 | tanstack-start | app render 1000 nodes | 2148 | -57.47% | ops/sec |
| 5 | qwik-city | app render 1000 nodes | 1474 | -70.81% | ops/sec |
| 6 | qwik-router-v2 | app render 1000 nodes | 1031 | -79.58% | ops/sec |
| 7 | solid-start | app render 1000 nodes | 688 | -86.38% | ops/sec |
| 8 | tanstack-start-solid | app render 1000 nodes | 542 | -89.27% | ops/sec |
| 9 | next-app-router | app render 1000 nodes | 199 | -96.06% | ops/sec |

### app streaming 1000 nodes

Streams a production app route with 1,000 simple text spans and validates the complete response body.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | marko-run | app streaming 1000 nodes | 4051 | best | ops/sec |
| 2 | mreact-app-router+log enabled | app streaming 1000 nodes | 3662 | -9.6% | ops/sec |
| 3 | mreact-app-router | app streaming 1000 nodes | 3124 | -22.88% | ops/sec |
| 4 | tanstack-start | app streaming 1000 nodes | 2292 | -43.42% | ops/sec |
| 5 | qwik-city | app streaming 1000 nodes | 1453 | -64.13% | ops/sec |
| 6 | qwik-router-v2 | app streaming 1000 nodes | 986 | -75.66% | ops/sec |
| 7 | solid-start | app streaming 1000 nodes | 755 | -81.36% | ops/sec |
| 8 | tanstack-start-solid | app streaming 1000 nodes | 576 | -85.78% | ops/sec |
| 9 | next-app-router | app streaming 1000 nodes | 202 | -95.01% | ops/sec |

### app streaming first byte 1000 nodes

Measures elapsed time until fetch resolves response headers for the real streaming route.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact-app-router | app streaming first byte 1000 nodes | 0.4198 | best | ms |
| 2 | marko-run | app streaming first byte 1000 nodes | 0.4922 | +17.25% | ms |
| 3 | qwik-city | app streaming first byte 1000 nodes | 0.5666 | +34.97% | ms |
| 4 | mreact-app-router+log enabled | app streaming first byte 1000 nodes | 0.7239 | +72.44% | ms |
| 5 | solid-start | app streaming first byte 1000 nodes | 1.5836 | +277.23% | ms |
| 6 | next-app-router | app streaming first byte 1000 nodes | 1.6428 | +291.33% | ms |
| 7 | tanstack-start | app streaming first byte 1000 nodes | 51.3254 | +12126.16% | ms |
| 8 | qwik-router-v2 | app streaming first byte 1000 nodes | 51.411 | +12146.55% | ms |
| 9 | tanstack-start-solid | app streaming first byte 1000 nodes | 52.1805 | +12329.85% | ms |

### app streaming first chunk 1000 nodes

Measures elapsed time until the first response body chunk arrives for the real streaming route.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact-app-router | app streaming first chunk 1000 nodes | 0.5058 | best | ms |
| 2 | qwik-city | app streaming first chunk 1000 nodes | 0.6331 | +25.17% | ms |
| 3 | mreact-app-router+log enabled | app streaming first chunk 1000 nodes | 0.6819 | +34.82% | ms |
| 4 | marko-run | app streaming first chunk 1000 nodes | 0.7372 | +45.75% | ms |
| 5 | solid-start | app streaming first chunk 1000 nodes | 1.515 | +199.53% | ms |
| 6 | next-app-router | app streaming first chunk 1000 nodes | 1.8706 | +269.83% | ms |
| 7 | tanstack-start | app streaming first chunk 1000 nodes | 50.9723 | +9977.56% | ms |
| 8 | qwik-router-v2 | app streaming first chunk 1000 nodes | 51.21 | +10024.56% | ms |
| 9 | tanstack-start-solid | app streaming first chunk 1000 nodes | 52.2064 | +10221.55% | ms |

### app streaming full body 1000 nodes

Measures elapsed time until the complete real streaming response body is consumed and validated.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact-app-router | app streaming full body 1000 nodes | 50.6142 | best | ms |
| 2 | solid-start | app streaming full body 1000 nodes | 50.9098 | +0.58% | ms |
| 3 | mreact-app-router+log enabled | app streaming full body 1000 nodes | 50.9886 | +0.74% | ms |
| 4 | marko-run | app streaming full body 1000 nodes | 50.9938 | +0.75% | ms |
| 5 | tanstack-start | app streaming full body 1000 nodes | 51.0142 | +0.79% | ms |
| 6 | qwik-city | app streaming full body 1000 nodes | 51.5141 | +1.78% | ms |
| 7 | qwik-router-v2 | app streaming full body 1000 nodes | 51.632 | +2.01% | ms |
| 8 | tanstack-start-solid | app streaming full body 1000 nodes | 52.3864 | +3.5% | ms |
| 9 | next-app-router | app streaming full body 1000 nodes | 54.7336 | +8.14% | ms |

### app real streaming 1000 nodes (async 50ms)

Streams a route whose body waits on a 50 ms async boundary before the full 1,000-node response completes.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | marko-run | app real streaming 1000 nodes (async 50ms) | 20 | best | ops/sec |
| 2 | solid-start | app real streaming 1000 nodes (async 50ms) | 20 | 0% | ops/sec |
| 3 | mreact-app-router+log enabled | app real streaming 1000 nodes (async 50ms) | 20 | 0% | ops/sec |
| 4 | mreact-app-router | app real streaming 1000 nodes (async 50ms) | 20 | 0% | ops/sec |
| 5 | tanstack-start | app real streaming 1000 nodes (async 50ms) | 20 | 0% | ops/sec |
| 6 | qwik-city | app real streaming 1000 nodes (async 50ms) | 19 | -5% | ops/sec |
| 7 | qwik-router-v2 | app real streaming 1000 nodes (async 50ms) | 19 | -5% | ops/sec |
| 8 | tanstack-start-solid | app real streaming 1000 nodes (async 50ms) | 19 | -5% | ops/sec |
| 9 | next-app-router | app real streaming 1000 nodes (async 50ms) | 18 | -10% | ops/sec |

### app parallel async boundaries 2x50ms

Renders two sibling 50 ms async boundaries and reports whether total response latency stays near one boundary instead of waterfalling.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid-start | app parallel async boundaries 2x50ms | 20 | best | ops/sec |
| 2 | marko-run | app parallel async boundaries 2x50ms | 20 | 0% | ops/sec |
| 3 | tanstack-start | app parallel async boundaries 2x50ms | 20 | 0% | ops/sec |
| 4 | qwik-city | app parallel async boundaries 2x50ms | 20 | 0% | ops/sec |
| 5 | mreact-app-router | app parallel async boundaries 2x50ms | 20 | 0% | ops/sec |
| 6 | mreact-app-router+log enabled | app parallel async boundaries 2x50ms | 20 | 0% | ops/sec |
| 7 | qwik-router-v2 | app parallel async boundaries 2x50ms | 19 | -5% | ops/sec |
| 8 | next-app-router | app parallel async boundaries 2x50ms | 19 | -5% | ops/sec |
| 9 | tanstack-start-solid | app parallel async boundaries 2x50ms | 19 | -5% | ops/sec |

### app static cached route 1000 nodes

Renders a static-cacheable app route with 1,000 simple text spans after the production server has warmed it.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact-app-router+log enabled | app static cached route 1000 nodes | 5852 | best | ops/sec |
| 2 | mreact-app-router | app static cached route 1000 nodes | 5815 | -0.63% | ops/sec |
| 3 | next-app-router | app static cached route 1000 nodes | 895 | -84.71% | ops/sec |

### app dynamic-attr grid 200 cells

Renders 200 cells with many dynamic escaped attributes, inline style values, and text content.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact-app-router | app dynamic-attr grid 200 cells | 3529 | best | ops/sec |
| 2 | mreact-app-router+log enabled | app dynamic-attr grid 200 cells | 3436 | -2.64% | ops/sec |
| 3 | marko-run | app dynamic-attr grid 200 cells | 1925 | -45.45% | ops/sec |
| 4 | tanstack-start | app dynamic-attr grid 200 cells | 1261 | -64.27% | ops/sec |
| 5 | qwik-city | app dynamic-attr grid 200 cells | 1033 | -70.73% | ops/sec |
| 6 | solid-start | app dynamic-attr grid 200 cells | 723 | -79.51% | ops/sec |
| 7 | qwik-router-v2 | app dynamic-attr grid 200 cells | 665 | -81.16% | ops/sec |
| 8 | tanstack-start-solid | app dynamic-attr grid 200 cells | 615 | -82.57% | ops/sec |
| 9 | next-app-router | app dynamic-attr grid 200 cells | 264 | -92.52% | ops/sec |

### app dynamic route params data

Renders a dynamic route that combines route parameters with server data before producing HTML.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact-app-router+log enabled | app dynamic route params data | 3469 | best | ops/sec |
| 2 | mreact-app-router | app dynamic route params data | 3229 | -6.92% | ops/sec |
| 3 | marko-run | app dynamic route params data | 2070 | -40.33% | ops/sec |
| 4 | tanstack-start | app dynamic route params data | 1237 | -64.34% | ops/sec |
| 5 | qwik-city | app dynamic route params data | 982 | -71.69% | ops/sec |
| 6 | solid-start | app dynamic route params data | 740 | -78.67% | ops/sec |
| 7 | qwik-router-v2 | app dynamic route params data | 690 | -80.11% | ops/sec |
| 8 | tanstack-start-solid | app dynamic route params data | 604 | -82.59% | ops/sec |
| 9 | next-app-router | app dynamic route params data | 265 | -92.36% | ops/sec |

### app client navigation route-to-route

Measures route-to-route client navigation latency in a real browser when the adapter provides a browser probe.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid-start | app client navigation route-to-route | 53.3 | best | ms |
| 2 | mreact-app-router+log enabled | app client navigation route-to-route | 53.3 | 0% | ms |
| 3 | tanstack-start | app client navigation route-to-route | 53.9 | +1.13% | ms |
| 4 | mreact-app-router | app client navigation route-to-route | 53.9 | +1.13% | ms |
| 5 | next-app-router | app client navigation route-to-route | 55.7 | +4.5% | ms |
| 6 | qwik-city | app client navigation route-to-route | 98.6 | +84.99% | ms |
| 7 | qwik-router-v2 | app client navigation route-to-route | 103.2 | +93.62% | ms |

### app initial page load JS before interaction

Measures page load time until the interactive route is visible and idle before any user interaction.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact-app-router+log enabled | app initial page load JS before interaction | 515.9654 | best | ms |
| 2 | mreact-app-router | app initial page load JS before interaction | 516.6705 | +0.14% | ms |
| 3 | marko-run | app initial page load JS before interaction | 517.6903 | +0.33% | ms |
| 4 | solid-start | app initial page load JS before interaction | 519.4237 | +0.67% | ms |
| 5 | tanstack-start | app initial page load JS before interaction | 521.7396 | +1.12% | ms |
| 6 | qwik-city | app initial page load JS before interaction | 549.8506 | +6.57% | ms |
| 7 | qwik-router-v2 | app initial page load JS before interaction | 589.9894 | +14.35% | ms |
| 8 | next-app-router | app initial page load JS before interaction | 593.852 | +15.1% | ms |

### app first interaction from DOMContentLoaded

Measures the first click-to-visible-update latency immediately after DOMContentLoaded without waiting for network idle.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | marko-run | app first interaction from DOMContentLoaded | 16.1 | best | ms |
| 2 | tanstack-start | app first interaction from DOMContentLoaded | 31.7 | +96.89% | ms |
| 3 | next-app-router | app first interaction from DOMContentLoaded | 43.1 | +167.7% | ms |
| 4 | solid-start | app first interaction from DOMContentLoaded | 47.2 | +193.17% | ms |
| 5 | qwik-city | app first interaction from DOMContentLoaded | 49.2 | +205.59% | ms |
| 6 | mreact-app-router | app first interaction from DOMContentLoaded | 52.3 | +224.84% | ms |
| 7 | qwik-router-v2 | app first interaction from DOMContentLoaded | 64.9 | +303.11% | ms |
| 8 | mreact-app-router+log enabled | app first interaction from DOMContentLoaded | 98.3 | +510.56% | ms |

### app first interaction after networkidle

Measures the first click-to-visible-update latency after the interactive route has reached network idle.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | next-app-router | app first interaction after networkidle | 25.6 | best | ms |
| 2 | solid-start | app first interaction after networkidle | 26.9 | +5.08% | ms |
| 3 | mreact-app-router+log enabled | app first interaction after networkidle | 27.8 | +8.59% | ms |
| 4 | tanstack-start | app first interaction after networkidle | 28.2 | +10.16% | ms |
| 5 | mreact-app-router | app first interaction after networkidle | 28.7 | +12.11% | ms |
| 6 | marko-run | app first interaction after networkidle | 28.9 | +12.89% | ms |
| 7 | qwik-router-v2 | app first interaction after networkidle | 47.5 | +85.55% | ms |
| 8 | qwik-city | app first interaction after networkidle | 51.5 | +101.17% | ms |

### app second interaction latency

Measures the second click-to-visible-update latency after the route has already handled one client interaction.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | qwik-router-v2 | app second interaction latency | 27.5 | best | ms |
| 2 | tanstack-start | app second interaction latency | 31.4 | +14.18% | ms |
| 3 | next-app-router | app second interaction latency | 31.4 | +14.18% | ms |
| 4 | solid-start | app second interaction latency | 32 | +16.36% | ms |
| 5 | mreact-app-router | app second interaction latency | 32.1 | +16.73% | ms |
| 6 | marko-run | app second interaction latency | 32.2 | +17.09% | ms |
| 7 | mreact-app-router+log enabled | app second interaction latency | 32.3 | +17.45% | ms |
| 8 | qwik-city | app second interaction latency | 49 | +78.18% | ms |

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
| 4 | solid-start | app client bundle gzip bytes (server-only page) | 28773 |  | gzip bytes |
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
| 2 | mreact-app-router | app client bundle gzip bytes (interactive page) | 4126 | +120.17% | gzip bytes |
| 3 | mreact-app-router+log enabled | app client bundle gzip bytes (interactive page) | 4128 | +120.28% | gzip bytes |
| 4 | solid-start | app client bundle gzip bytes (interactive page) | 28773 | +1435.38% | gzip bytes |
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
| 2 | mreact-app-router | app client bundle gzip bytes (interactive page, minimal opt-out) | 3009 | +60.57% | gzip bytes |
| 3 | mreact-app-router+log enabled | app client bundle gzip bytes (interactive page, minimal opt-out) | 3010 | +60.62% | gzip bytes |
| 4 | solid-start | app client bundle gzip bytes (interactive page, minimal opt-out) | 28773 | +1435.38% | gzip bytes |
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
| router | marko-run | 0.10.0 | app render 1000 nodes | completed | throughput | ops/sec | 3360 | -33.47% | 0 | 3360 | 0.322 | 0.3168 | 0.7821 |  |
| router | marko-run | 0.10.0 | app streaming 1000 nodes | completed | throughput | ops/sec | 4051 | best | 0 | 4051 | 0.2675 | 0.256 | 0.6896 |  |
| router | marko-run | 0.10.0 | app dynamic route params data | completed | throughput | ops/sec | 2070 | -40.33% | 0 | 2070 | 0.5087 | 0.487 | 1.3618 |  |
| router | marko-run | 0.10.0 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | best | 0 | 20 | 50.5485 | 50.8143 | 51.1465 |  |
| router | marko-run | 0.10.0 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0% | 0 | 20 | 50.6853 | 50.7851 | 53.5512 |  |
| router | marko-run | 0.10.0 | app static cached route 1000 nodes | unsupported | throughput | ops/sec | 0 |  | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app static cached route 1000 nodes |
| router | marko-run | 0.10.0 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 1925 | -45.45% | 0 | 1925 | 0.5462 | 0.5768 | 1.3572 |  |
| router | marko-run | 0.10.0 | app streaming first byte 1000 nodes | completed | duration | ms | 0.4922 | +17.25% | 0 | 0 | 0.5518 | 0.645 | 0.7535 |  |
| router | marko-run | 0.10.0 | app streaming first chunk 1000 nodes | completed | duration | ms | 0.7372 | +45.75% | 0 | 0 | 0.6376 | 0.8347 | 0.8401 |  |
| router | marko-run | 0.10.0 | app streaming full body 1000 nodes | completed | duration | ms | 50.9938 | +0.75% | 0 | 0 | 51.0185 | 51.1201 | 51.1279 |  |
| router | marko-run | 0.10.0 | app client navigation route-to-route | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app client navigation route-to-route |
| router | marko-run | 0.10.0 | app initial page load JS before interaction | completed | duration | ms | 517.6903 | +0.33% | 0 | 0 | 517.8043 | 518.3153 | 518.373 |  |
| router | marko-run | 0.10.0 | app first interaction from DOMContentLoaded | completed | duration | ms | 16.1 | best | 0 | 0 | 19.7857 | 28.1 | 34 |  |
| router | marko-run | 0.10.0 | app first interaction after networkidle | completed | duration | ms | 28.9 | +12.89% | 0 | 0 | 26.4857 | 32.4 | 33.3 |  |
| router | marko-run | 0.10.0 | app second interaction latency | completed | duration | ms | 32.2 | +17.09% | 0 | 0 | 32.4143 | 32.3 | 34.1 |  |
| router | marko-run | 0.10.0 | app server cold start | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app server cold start |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 1874 |  | 1874 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 1874 | best | 1874 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 1874 | best | 1874 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app build output gzip bytes | unsupported | size | gzip bytes | 0 |  | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app build output gzip bytes |
| router | qwik-city | 1.19.2 | app render 1000 nodes | completed | throughput | ops/sec | 1474 | -70.81% | 0 | 1474 | 0.7024 | 0.7446 | 1.2467 |  |
| router | qwik-city | 1.19.2 | app streaming 1000 nodes | completed | throughput | ops/sec | 1453 | -64.13% | 0 | 1453 | 0.7138 | 0.693 | 1.2664 |  |
| router | qwik-city | 1.19.2 | app dynamic route params data | completed | throughput | ops/sec | 982 | -71.69% | 0 | 982 | 1.0436 | 1.0248 | 1.7486 |  |
| router | qwik-city | 1.19.2 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 19 | -5% | 0 | 19 | 51.2877 | 51.3894 | 51.7641 |  |
| router | qwik-city | 1.19.2 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0% | 0 | 20 | 50.7596 | 50.8386 | 51.5664 |  |
| router | qwik-city | 1.19.2 | app static cached route 1000 nodes | unsupported | throughput | ops/sec | 0 |  | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app static cached route 1000 nodes |
| router | qwik-city | 1.19.2 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 1033 | -70.73% | 0 | 1033 | 0.9874 | 0.9656 | 1.5932 |  |
| router | qwik-city | 1.19.2 | app streaming first byte 1000 nodes | completed | duration | ms | 0.5666 | +34.97% | 0 | 0 | 0.6479 | 0.8992 | 0.9122 |  |
| router | qwik-city | 1.19.2 | app streaming first chunk 1000 nodes | completed | duration | ms | 0.6331 | +25.17% | 0 | 0 | 0.6444 | 0.7624 | 0.7628 |  |
| router | qwik-city | 1.19.2 | app streaming full body 1000 nodes | completed | duration | ms | 51.5141 | +1.78% | 0 | 0 | 51.5013 | 51.8922 | 52.2111 |  |
| router | qwik-city | 1.19.2 | app client navigation route-to-route | completed | duration | ms | 98.6 | +84.99% | 0 | 0 | 99 | 100 | 103.7 |  |
| router | qwik-city | 1.19.2 | app initial page load JS before interaction | completed | duration | ms | 549.8506 | +6.57% | 0 | 0 | 551.1837 | 551.9895 | 570.9835 |  |
| router | qwik-city | 1.19.2 | app first interaction from DOMContentLoaded | completed | duration | ms | 49.2 | +205.59% | 0 | 0 | 47.3286 | 49.5 | 52.5 |  |
| router | qwik-city | 1.19.2 | app first interaction after networkidle | completed | duration | ms | 51.5 | +101.17% | 0 | 0 | 47.2143 | 52.5 | 53.3 |  |
| router | qwik-city | 1.19.2 | app second interaction latency | completed | duration | ms | 49 | +78.18% | 0 | 0 | 49.1286 | 49.8 | 50.5 |  |
| router | qwik-city | 1.19.2 | app server cold start | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app server cold start |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 47716 |  | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 47716 | +2446.21% | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 47716 | +2446.21% | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app build output gzip bytes | unsupported | size | gzip bytes | 0 |  | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app build output gzip bytes |
| router | qwik-router-v2 | 2.0.0-beta.35 | app render 1000 nodes | completed | throughput | ops/sec | 1031 | -79.58% | 0 | 1031 | 1.0969 | 0.9922 | 3.4264 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app streaming 1000 nodes | completed | throughput | ops/sec | 986 | -75.66% | 0 | 986 | 1.1324 | 0.9992 | 3.43 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app dynamic route params data | completed | throughput | ops/sec | 690 | -80.11% | 0 | 690 | 1.5961 | 1.4044 | 4.2314 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 19 | -5% | 0 | 19 | 52.0724 | 52.2131 | 53.9457 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 19 | -5% | 0 | 19 | 51.3016 | 51.392 | 52.4905 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app static cached route 1000 nodes | unsupported | throughput | ops/sec | 0 |  | 0 | 0 | 0 | 0 | 0 | qwik-router-v2 does not implement app static cached route 1000 nodes |
| router | qwik-router-v2 | 2.0.0-beta.35 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 665 | -81.16% | 0 | 665 | 1.6549 | 1.4789 | 4.4416 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app streaming first byte 1000 nodes | completed | duration | ms | 51.411 | +12146.55% | 0 | 0 | 51.4162 | 51.8459 | 51.946 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app streaming first chunk 1000 nodes | completed | duration | ms | 51.21 | +10024.56% | 0 | 0 | 51.385 | 51.6208 | 51.7128 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app streaming full body 1000 nodes | completed | duration | ms | 51.632 | +2.01% | 0 | 0 | 51.6453 | 51.7797 | 51.8093 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app client navigation route-to-route | completed | duration | ms | 103.2 | +93.62% | 0 | 0 | 102.2 | 103.5 | 103.7 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app initial page load JS before interaction | completed | duration | ms | 589.9894 | +14.35% | 0 | 0 | 593.8353 | 610.5923 | 636.9696 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app first interaction from DOMContentLoaded | completed | duration | ms | 64.9 | +303.11% | 0 | 0 | 63.1429 | 79.1 | 81.9 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app first interaction after networkidle | completed | duration | ms | 47.5 | +85.55% | 0 | 0 | 45.8857 | 49.8 | 53 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app second interaction latency | completed | duration | ms | 27.5 | best | 0 | 0 | 27.0714 | 27.8 | 27.8 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app server cold start | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | qwik-router-v2 does not implement app server cold start |
| router | qwik-router-v2 | 2.0.0-beta.35 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 68172 |  | 68172 | 0 | 0 | 0 | 0 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 68172 | +3537.78% | 68172 | 0 | 0 | 0 | 0 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 68172 | +3537.78% | 68172 | 0 | 0 | 0 | 0 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app build output gzip bytes | unsupported | size | gzip bytes | 0 |  | 0 | 0 | 0 | 0 | 0 | qwik-router-v2 does not implement app build output gzip bytes |
| router | solid-start | 1.3.2 | app render 1000 nodes | completed | throughput | ops/sec | 688 | -86.38% | 0 | 688 | 1.6468 | 1.615 | 7.0456 |  |
| router | solid-start | 1.3.2 | app streaming 1000 nodes | completed | throughput | ops/sec | 755 | -81.36% | 0 | 755 | 1.555 | 1.5816 | 5.4135 |  |
| router | solid-start | 1.3.2 | app dynamic route params data | completed | throughput | ops/sec | 740 | -78.67% | 0 | 740 | 1.4585 | 1.4926 | 2.4799 |  |
| router | solid-start | 1.3.2 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0% | 0 | 20 | 50.8421 | 51.1036 | 51.379 |  |
| router | solid-start | 1.3.2 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | best | 0 | 20 | 50.6574 | 50.8119 | 51.523 |  |
| router | solid-start | 1.3.2 | app static cached route 1000 nodes | unsupported | throughput | ops/sec | 0 |  | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app static cached route 1000 nodes |
| router | solid-start | 1.3.2 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 723 | -79.51% | 0 | 723 | 1.4662 | 1.4805 | 2.4977 |  |
| router | solid-start | 1.3.2 | app streaming first byte 1000 nodes | completed | duration | ms | 1.5836 | +277.23% | 0 | 0 | 1.5918 | 1.709 | 1.7147 |  |
| router | solid-start | 1.3.2 | app streaming first chunk 1000 nodes | completed | duration | ms | 1.515 | +199.53% | 0 | 0 | 1.6005 | 1.8365 | 1.9273 |  |
| router | solid-start | 1.3.2 | app streaming full body 1000 nodes | completed | duration | ms | 50.9098 | +0.58% | 0 | 0 | 50.7643 | 50.9534 | 50.9826 |  |
| router | solid-start | 1.3.2 | app client navigation route-to-route | completed | duration | ms | 53.3 | best | 0 | 0 | 53.5857 | 54.3 | 54.5 |  |
| router | solid-start | 1.3.2 | app initial page load JS before interaction | completed | duration | ms | 519.4237 | +0.67% | 0 | 0 | 519.3311 | 519.589 | 520.0578 |  |
| router | solid-start | 1.3.2 | app first interaction from DOMContentLoaded | completed | duration | ms | 47.2 | +193.17% | 0 | 0 | 53.6714 | 79.8 | 118.5 |  |
| router | solid-start | 1.3.2 | app first interaction after networkidle | completed | duration | ms | 26.9 | +5.08% | 0 | 0 | 27.7286 | 32.9 | 33.3 |  |
| router | solid-start | 1.3.2 | app second interaction latency | completed | duration | ms | 32 | +16.36% | 0 | 0 | 32 | 32.2 | 32.2 |  |
| router | solid-start | 1.3.2 | app server cold start | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app server cold start |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 28773 |  | 28773 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 28773 | +1435.38% | 28773 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 28773 | +1435.38% | 28773 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app build output gzip bytes | unsupported | size | gzip bytes | 0 |  | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app build output gzip bytes |
| router | tanstack-start | 1.167.65 | app render 1000 nodes | completed | throughput | ops/sec | 2148 | -57.47% | 0 | 2148 | 0.4932 | 0.4786 | 1.6295 |  |
| router | tanstack-start | 1.167.65 | app streaming 1000 nodes | completed | throughput | ops/sec | 2292 | -43.42% | 0 | 2292 | 0.4588 | 0.4323 | 1.5679 |  |
| router | tanstack-start | 1.167.65 | app dynamic route params data | completed | throughput | ops/sec | 1237 | -64.34% | 0 | 1237 | 0.8363 | 0.8001 | 1.8137 |  |
| router | tanstack-start | 1.167.65 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0% | 0 | 20 | 51.1709 | 51.2983 | 52.0887 |  |
| router | tanstack-start | 1.167.65 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0% | 0 | 20 | 50.6955 | 50.7927 | 51.2389 |  |
| router | tanstack-start | 1.167.65 | app static cached route 1000 nodes | unsupported | throughput | ops/sec | 0 |  | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app static cached route 1000 nodes |
| router | tanstack-start | 1.167.65 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 1261 | -64.27% | 0 | 1261 | 0.8161 | 0.8109 | 1.6382 |  |
| router | tanstack-start | 1.167.65 | app streaming first byte 1000 nodes | completed | duration | ms | 51.3254 | +12126.16% | 0 | 0 | 51.3203 | 51.4622 | 51.4987 |  |
| router | tanstack-start | 1.167.65 | app streaming first chunk 1000 nodes | completed | duration | ms | 50.9723 | +9977.56% | 0 | 0 | 50.9548 | 51.0103 | 51.0334 |  |
| router | tanstack-start | 1.167.65 | app streaming full body 1000 nodes | completed | duration | ms | 51.0142 | +0.79% | 0 | 0 | 51.019 | 51.0573 | 51.0581 |  |
| router | tanstack-start | 1.167.65 | app client navigation route-to-route | completed | duration | ms | 53.9 | +1.13% | 0 | 0 | 54.3429 | 55 | 56.1 |  |
| router | tanstack-start | 1.167.65 | app initial page load JS before interaction | completed | duration | ms | 521.7396 | +1.12% | 0 | 0 | 522.0931 | 522.4863 | 523.7119 |  |
| router | tanstack-start | 1.167.65 | app first interaction from DOMContentLoaded | completed | duration | ms | 31.7 | +96.89% | 0 | 0 | 33.8143 | 41.8 | 55 |  |
| router | tanstack-start | 1.167.65 | app first interaction after networkidle | completed | duration | ms | 28.2 | +10.16% | 0 | 0 | 28.0714 | 32.8 | 33.7 |  |
| router | tanstack-start | 1.167.65 | app second interaction latency | completed | duration | ms | 31.4 | +14.18% | 0 | 0 | 31.4286 | 31.7 | 32 |  |
| router | tanstack-start | 1.167.65 | app server cold start | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app server cold start |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 112814 |  | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 112814 | +5919.96% | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 112814 | +5919.96% | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app build output gzip bytes | unsupported | size | gzip bytes | 0 |  | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app build output gzip bytes |
| router | tanstack-start-solid | 2.0.0-beta.18 | app render 1000 nodes | completed | throughput | ops/sec | 542 | -89.27% | 0 | 542 | 1.9766 | 1.9231 | 7.3585 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app streaming 1000 nodes | completed | throughput | ops/sec | 576 | -85.78% | 0 | 576 | 1.8856 | 1.7766 | 7.4477 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app dynamic route params data | completed | throughput | ops/sec | 604 | -82.59% | 0 | 604 | 1.7908 | 1.6915 | 7.978 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 19 | -5% | 0 | 19 | 52.3387 | 52.3402 | 57.103 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 19 | -5% | 0 | 19 | 51.9889 | 52.102 | 52.7147 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app static cached route 1000 nodes | unsupported | throughput | ops/sec | 0 |  | 0 | 0 | 0 | 0 | 0 | tanstack-start-solid does not implement app static cached route 1000 nodes |
| router | tanstack-start-solid | 2.0.0-beta.18 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 615 | -82.57% | 0 | 615 | 1.7758 | 1.6848 | 8.2271 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app streaming first byte 1000 nodes | completed | duration | ms | 52.1805 | +12329.85% | 0 | 0 | 52.0456 | 52.2435 | 52.3805 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app streaming first chunk 1000 nodes | completed | duration | ms | 52.2064 | +10221.55% | 0 | 0 | 52.2586 | 52.3013 | 52.6133 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app streaming full body 1000 nodes | completed | duration | ms | 52.3864 | +3.5% | 0 | 0 | 52.4386 | 52.5617 | 52.8276 |  |
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
| router | next-app-router | 16.2.6 | app render 1000 nodes | completed | throughput | ops/sec | 199 | -96.06% | 0 | 199 | 5.0676 | 5.0286 | 6.9646 |  |
| router | next-app-router | 16.2.6 | app streaming 1000 nodes | completed | throughput | ops/sec | 202 | -95.01% | 0 | 202 | 5.0911 | 4.9241 | 8.8153 |  |
| router | next-app-router | 16.2.6 | app dynamic route params data | completed | throughput | ops/sec | 265 | -92.36% | 0 | 265 | 3.8782 | 3.7641 | 6.3835 |  |
| router | next-app-router | 16.2.6 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 18 | -10% | 0 | 18 | 54.6869 | 54.7643 | 57.1988 |  |
| router | next-app-router | 16.2.6 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 19 | -5% | 0 | 19 | 51.4562 | 51.7103 | 52.3208 |  |
| router | next-app-router | 16.2.6 | app static cached route 1000 nodes | completed | throughput | ops/sec | 895 | -84.71% | 0 | 895 | 1.1786 | 1.1085 | 3.7993 |  |
| router | next-app-router | 16.2.6 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 264 | -92.52% | 0 | 264 | 3.8776 | 3.7538 | 7.4728 |  |
| router | next-app-router | 16.2.6 | app streaming first byte 1000 nodes | completed | duration | ms | 1.6428 | +291.33% | 0 | 0 | 1.6401 | 1.6779 | 1.7633 |  |
| router | next-app-router | 16.2.6 | app streaming first chunk 1000 nodes | completed | duration | ms | 1.8706 | +269.83% | 0 | 0 | 1.8665 | 1.9187 | 1.9628 |  |
| router | next-app-router | 16.2.6 | app streaming full body 1000 nodes | completed | duration | ms | 54.7336 | +8.14% | 0 | 0 | 55.0865 | 54.9795 | 57.7476 |  |
| router | next-app-router | 16.2.6 | app client navigation route-to-route | completed | duration | ms | 55.7 | +4.5% | 0 | 0 | 55.4429 | 56 | 56.1 |  |
| router | next-app-router | 16.2.6 | app initial page load JS before interaction | completed | duration | ms | 593.852 | +15.1% | 0 | 0 | 594.6243 | 626.2815 | 644.1524 |  |
| router | next-app-router | 16.2.6 | app first interaction from DOMContentLoaded | completed | duration | ms | 43.1 | +167.7% | 0 | 0 | 46.0429 | 46.6 | 88.5 |  |
| router | next-app-router | 16.2.6 | app first interaction after networkidle | completed | duration | ms | 25.6 | best | 0 | 0 | 25.9857 | 29.6 | 32.1 |  |
| router | next-app-router | 16.2.6 | app second interaction latency | completed | duration | ms | 31.4 | +14.18% | 0 | 0 | 31.4143 | 31.6 | 31.7 |  |
| router | next-app-router | 16.2.6 | app server cold start | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app server cold start |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 185522 |  | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 185522 | +9799.79% | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 185522 | +9799.79% | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app build output gzip bytes | unsupported | size | gzip bytes | 0 |  | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app build output gzip bytes |
| router | mreact-app-router | workspace | app render 1000 nodes | completed | throughput | ops/sec | 3712 | -26.5% | 0 | 3712 | 0.2888 | 0.2821 | 0.6804 |  |
| router | mreact-app-router | workspace | app streaming 1000 nodes | completed | throughput | ops/sec | 3124 | -22.88% | 0 | 3124 | 0.3372 | 0.3278 | 0.9584 |  |
| router | mreact-app-router | workspace | app dynamic route params data | completed | throughput | ops/sec | 3229 | -6.92% | 0 | 3229 | 0.3391 | 0.3071 | 1.5533 |  |
| router | mreact-app-router | workspace | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0% | 0 | 20 | 51.0594 | 51.3158 | 52.7796 |  |
| router | mreact-app-router | workspace | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0% | 0 | 20 | 50.8372 | 51.0895 | 51.5652 |  |
| router | mreact-app-router | workspace | app static cached route 1000 nodes | completed | throughput | ops/sec | 5815 | -0.63% | 0 | 5815 | 0.1886 | 0.1734 | 0.6351 |  |
| router | mreact-app-router | workspace | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 3529 | best | 0 | 3529 | 0.3103 | 0.2814 | 1.4177 |  |
| router | mreact-app-router | workspace | app streaming first byte 1000 nodes | completed | duration | ms | 0.4198 | best | 0 | 0 | 0.4044 | 0.421 | 0.426 |  |
| router | mreact-app-router | workspace | app streaming first chunk 1000 nodes | completed | duration | ms | 0.5058 | best | 0 | 0 | 0.5098 | 0.5165 | 0.6844 |  |
| router | mreact-app-router | workspace | app streaming full body 1000 nodes | completed | duration | ms | 50.6142 | best | 0 | 0 | 50.9507 | 50.8849 | 54.0335 |  |
| router | mreact-app-router | workspace | app client navigation route-to-route | completed | duration | ms | 53.9 | +1.13% | 0 | 0 | 53.8857 | 54.4 | 54.9 |  |
| router | mreact-app-router | workspace | app initial page load JS before interaction | completed | duration | ms | 516.6705 | +0.14% | 0 | 0 | 516.6091 | 517.1551 | 517.785 |  |
| router | mreact-app-router | workspace | app first interaction from DOMContentLoaded | completed | duration | ms | 52.3 | +224.84% | 0 | 0 | 61.1 | 84.5 | 90.4 |  |
| router | mreact-app-router | workspace | app first interaction after networkidle | completed | duration | ms | 28.7 | +12.11% | 0 | 0 | 26.4143 | 31.4 | 34.3 |  |
| router | mreact-app-router | workspace | app second interaction latency | completed | duration | ms | 32.1 | +16.73% | 0 | 0 | 32.0857 | 32.4 | 32.6 |  |
| router | mreact-app-router | workspace | app server cold start | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app server cold start |
| router | mreact-app-router | workspace | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 0 |  | 0 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 4126 | +120.17% | 4126 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 3009 | +60.57% | 3009 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app build output gzip bytes | unsupported | size | gzip bytes | 0 |  | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app build output gzip bytes |
| router | mreact-app-router+log enabled | workspace | app render 1000 nodes | completed | throughput | ops/sec | 5050 | best | 0 | 5050 | 0.216 | 0.212 | 0.593 |  |
| router | mreact-app-router+log enabled | workspace | app streaming 1000 nodes | completed | throughput | ops/sec | 3662 | -9.6% | 0 | 3662 | 0.2905 | 0.2816 | 0.8453 |  |
| router | mreact-app-router+log enabled | workspace | app dynamic route params data | completed | throughput | ops/sec | 3469 | best | 0 | 3469 | 0.3184 | 0.2866 | 1.5348 |  |
| router | mreact-app-router+log enabled | workspace | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0% | 0 | 20 | 50.9901 | 51.2408 | 51.5848 |  |
| router | mreact-app-router+log enabled | workspace | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0% | 0 | 20 | 50.9134 | 51.1316 | 52.464 |  |
| router | mreact-app-router+log enabled | workspace | app static cached route 1000 nodes | completed | throughput | ops/sec | 5852 | best | 0 | 5852 | 0.1893 | 0.1707 | 0.6502 |  |
| router | mreact-app-router+log enabled | workspace | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 3436 | -2.64% | 0 | 3436 | 0.3218 | 0.2886 | 1.5697 |  |
| router | mreact-app-router+log enabled | workspace | app streaming first byte 1000 nodes | completed | duration | ms | 0.7239 | +72.44% | 0 | 0 | 0.7226 | 0.7337 | 0.7546 |  |
| router | mreact-app-router+log enabled | workspace | app streaming first chunk 1000 nodes | completed | duration | ms | 0.6819 | +34.82% | 0 | 0 | 0.7052 | 0.7832 | 0.867 |  |
| router | mreact-app-router+log enabled | workspace | app streaming full body 1000 nodes | completed | duration | ms | 50.9886 | +0.74% | 0 | 0 | 51.0032 | 51.0739 | 51.1009 |  |
| router | mreact-app-router+log enabled | workspace | app client navigation route-to-route | completed | duration | ms | 53.3 | 0% | 0 | 0 | 53.3286 | 53.8 | 54.3 |  |
| router | mreact-app-router+log enabled | workspace | app initial page load JS before interaction | completed | duration | ms | 515.9654 | best | 0 | 0 | 516.053 | 516.8157 | 516.8255 |  |
| router | mreact-app-router+log enabled | workspace | app first interaction from DOMContentLoaded | completed | duration | ms | 98.3 | +510.56% | 0 | 0 | 96.7286 | 115.4 | 128.9 |  |
| router | mreact-app-router+log enabled | workspace | app first interaction after networkidle | completed | duration | ms | 27.8 | +8.59% | 0 | 0 | 25.5286 | 28.3 | 32.1 |  |
| router | mreact-app-router+log enabled | workspace | app second interaction latency | completed | duration | ms | 32.3 | +17.45% | 0 | 0 | 32.2714 | 32.8 | 33 |  |
| router | mreact-app-router+log enabled | workspace | app server cold start | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | mreact-app-router+log enabled does not implement app server cold start |
| router | mreact-app-router+log enabled | workspace | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 0 |  | 0 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router+log enabled | workspace | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 4128 | +120.28% | 4128 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router+log enabled | workspace | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 3010 | +60.62% | 3010 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router+log enabled | workspace | app build output gzip bytes | unsupported | size | gzip bytes | 0 |  | 0 | 0 | 0 | 0 | 0 | mreact-app-router+log enabled does not implement app build output gzip bytes |
