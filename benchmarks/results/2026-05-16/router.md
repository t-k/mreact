# Router Benchmark

## Environment

- Date: 2026-05-16
- Git commit: ede4856ae3930d6faed308607fafec6a64571ab1
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

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app render 1000 nodes | 5311 | ops/sec |
| 2 | mreact-app-router+log enabled | app render 1000 nodes | 5085 | ops/sec |
| 3 | marko-run | app render 1000 nodes | 3361 | ops/sec |
| 4 | tanstack-start | app render 1000 nodes | 2111 | ops/sec |
| 5 | qwik-city | app render 1000 nodes | 1467 | ops/sec |
| 6 | qwik-router-v2 | app render 1000 nodes | 1123 | ops/sec |
| 7 | solid-start | app render 1000 nodes | 671 | ops/sec |
| 8 | tanstack-start-solid | app render 1000 nodes | 574 | ops/sec |
| 9 | next-app-router | app render 1000 nodes | 177 | ops/sec |

### app streaming 1000 nodes

Streams a production app route with 1,000 simple text spans and validates the complete response body.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app streaming 1000 nodes | 4042 | ops/sec |
| 2 | mreact-app-router | app streaming 1000 nodes | 3804 | ops/sec |
| 3 | mreact-app-router+log enabled | app streaming 1000 nodes | 3575 | ops/sec |
| 4 | tanstack-start | app streaming 1000 nodes | 2287 | ops/sec |
| 5 | qwik-city | app streaming 1000 nodes | 1452 | ops/sec |
| 6 | qwik-router-v2 | app streaming 1000 nodes | 1080 | ops/sec |
| 7 | solid-start | app streaming 1000 nodes | 747 | ops/sec |
| 8 | tanstack-start-solid | app streaming 1000 nodes | 585 | ops/sec |
| 9 | next-app-router | app streaming 1000 nodes | 187 | ops/sec |

### app streaming first byte 1000 nodes

Measures elapsed time until fetch resolves response headers for the real streaming route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | qwik-city | app streaming first byte 1000 nodes | 0.4018 | ms |
| 2 | mreact-app-router | app streaming first byte 1000 nodes | 0.4498 | ms |
| 3 | mreact-app-router+log enabled | app streaming first byte 1000 nodes | 0.5458 | ms |
| 4 | marko-run | app streaming first byte 1000 nodes | 0.6644 | ms |
| 5 | solid-start | app streaming first byte 1000 nodes | 1.4465 | ms |
| 6 | next-app-router | app streaming first byte 1000 nodes | 1.8905 | ms |
| 7 | tanstack-start | app streaming first byte 1000 nodes | 51.3416 | ms |
| 8 | qwik-router-v2 | app streaming first byte 1000 nodes | 51.5974 | ms |
| 9 | tanstack-start-solid | app streaming first byte 1000 nodes | 52.0422 | ms |

### app streaming first chunk 1000 nodes

Measures elapsed time until the first response body chunk arrives for the real streaming route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app streaming first chunk 1000 nodes | 0.4483 | ms |
| 2 | marko-run | app streaming first chunk 1000 nodes | 0.4631 | ms |
| 3 | qwik-city | app streaming first chunk 1000 nodes | 0.4865 | ms |
| 4 | mreact-app-router+log enabled | app streaming first chunk 1000 nodes | 0.6134 | ms |
| 5 | solid-start | app streaming first chunk 1000 nodes | 1.4827 | ms |
| 6 | next-app-router | app streaming first chunk 1000 nodes | 2.169 | ms |
| 7 | tanstack-start | app streaming first chunk 1000 nodes | 50.9581 | ms |
| 8 | qwik-router-v2 | app streaming first chunk 1000 nodes | 51.6367 | ms |
| 9 | tanstack-start-solid | app streaming first chunk 1000 nodes | 52.1242 | ms |

### app streaming full body 1000 nodes

Measures elapsed time until the complete real streaming response body is consumed and validated.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router+log enabled | app streaming full body 1000 nodes | 50.7365 | ms |
| 2 | solid-start | app streaming full body 1000 nodes | 50.8047 | ms |
| 3 | mreact-app-router | app streaming full body 1000 nodes | 50.8102 | ms |
| 4 | marko-run | app streaming full body 1000 nodes | 50.8457 | ms |
| 5 | tanstack-start | app streaming full body 1000 nodes | 50.9776 | ms |
| 6 | qwik-city | app streaming full body 1000 nodes | 51.0665 | ms |
| 7 | qwik-router-v2 | app streaming full body 1000 nodes | 51.5169 | ms |
| 8 | tanstack-start-solid | app streaming full body 1000 nodes | 52.1478 | ms |
| 9 | next-app-router | app streaming full body 1000 nodes | 55.1156 | ms |

### app real streaming 1000 nodes (async 50ms)

Streams a route whose body waits on a 50 ms async boundary before the full 1,000-node response completes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 2 | mreact-app-router+log enabled | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 3 | solid-start | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 4 | marko-run | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 5 | tanstack-start | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 6 | qwik-city | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 7 | qwik-router-v2 | app real streaming 1000 nodes (async 50ms) | 19 | ops/sec |
| 8 | tanstack-start-solid | app real streaming 1000 nodes (async 50ms) | 19 | ops/sec |
| 9 | next-app-router | app real streaming 1000 nodes (async 50ms) | 18 | ops/sec |

### app parallel async boundaries 2x50ms

Renders two sibling 50 ms async boundaries and reports whether total response latency stays near one boundary instead of waterfalling.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 2 | qwik-city | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 3 | mreact-app-router+log enabled | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 4 | solid-start | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 5 | tanstack-start | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 6 | mreact-app-router | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 7 | qwik-router-v2 | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 8 | next-app-router | app parallel async boundaries 2x50ms | 19 | ops/sec |
| 9 | tanstack-start-solid | app parallel async boundaries 2x50ms | 19 | ops/sec |

### app static cached route 1000 nodes

Renders a static-cacheable app route with 1,000 simple text spans after the production server has warmed it.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app static cached route 1000 nodes | 6432 | ops/sec |
| 2 | mreact-app-router+log enabled | app static cached route 1000 nodes | 5677 | ops/sec |
| 3 | next-app-router | app static cached route 1000 nodes | 933 | ops/sec |

### app dynamic-attr grid 200 cells

Renders 200 cells with many dynamic escaped attributes, inline style values, and text content.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app dynamic-attr grid 200 cells | 3580 | ops/sec |
| 2 | mreact-app-router+log enabled | app dynamic-attr grid 200 cells | 3318 | ops/sec |
| 3 | marko-run | app dynamic-attr grid 200 cells | 2120 | ops/sec |
| 4 | tanstack-start | app dynamic-attr grid 200 cells | 1322 | ops/sec |
| 5 | qwik-city | app dynamic-attr grid 200 cells | 976 | ops/sec |
| 6 | solid-start | app dynamic-attr grid 200 cells | 767 | ops/sec |
| 7 | qwik-router-v2 | app dynamic-attr grid 200 cells | 692 | ops/sec |
| 8 | tanstack-start-solid | app dynamic-attr grid 200 cells | 617 | ops/sec |
| 9 | next-app-router | app dynamic-attr grid 200 cells | 260 | ops/sec |

### app dynamic route params data

Renders a dynamic route that combines route parameters with server data before producing HTML.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app dynamic route params data | 3502 | ops/sec |
| 2 | mreact-app-router+log enabled | app dynamic route params data | 3370 | ops/sec |
| 3 | marko-run | app dynamic route params data | 2132 | ops/sec |
| 4 | tanstack-start | app dynamic route params data | 1216 | ops/sec |
| 5 | qwik-city | app dynamic route params data | 967 | ops/sec |
| 6 | solid-start | app dynamic route params data | 728 | ops/sec |
| 7 | qwik-router-v2 | app dynamic route params data | 697 | ops/sec |
| 8 | tanstack-start-solid | app dynamic route params data | 613 | ops/sec |
| 9 | next-app-router | app dynamic route params data | 260 | ops/sec |

### app client navigation route-to-route

Measures route-to-route client navigation latency in a real browser when the adapter provides a browser probe.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | solid-start | app client navigation route-to-route | 53.4 | ms |
| 2 | mreact-app-router | app client navigation route-to-route | 53.7 | ms |
| 3 | mreact-app-router+log enabled | app client navigation route-to-route | 53.7 | ms |
| 4 | tanstack-start | app client navigation route-to-route | 54.1 | ms |
| 5 | next-app-router | app client navigation route-to-route | 54.5 | ms |
| 6 | qwik-city | app client navigation route-to-route | 99.5 | ms |
| 7 | qwik-router-v2 | app client navigation route-to-route | 101.8 | ms |

### app hydration first interaction

Measures time for the first client interaction to update visible UI after loading an interactive route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router+log enabled | app hydration first interaction | 18.7 | ms |
| 2 | mreact-app-router | app hydration first interaction | 20.3 | ms |
| 3 | solid-start | app hydration first interaction | 22.6 | ms |
| 4 | tanstack-start | app hydration first interaction | 27.4 | ms |
| 5 | marko-run | app hydration first interaction | 28 | ms |
| 6 | next-app-router | app hydration first interaction | 28.8 | ms |
| 7 | qwik-city | app hydration first interaction | 42.1 | ms |
| 8 | qwik-router-v2 | app hydration first interaction | 50.8 | ms |

### app server cold start

Measures production server cold-start latency when the adapter can isolate startup from build work.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
|  | no completed results |  |  |  |

### app client bundle gzip bytes (server-only page)

Measures gzip-compressed client JavaScript shipped for a route with no user-authored interactivity.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app client bundle gzip bytes (server-only page) | 0 | gzip bytes |
| 2 | mreact-app-router+log enabled | app client bundle gzip bytes (server-only page) | 0 | gzip bytes |
| 3 | marko-run | app client bundle gzip bytes (server-only page) | 1874 | gzip bytes |
| 4 | solid-start | app client bundle gzip bytes (server-only page) | 28774 | gzip bytes |
| 5 | qwik-city | app client bundle gzip bytes (server-only page) | 47716 | gzip bytes |
| 6 | tanstack-start-solid | app client bundle gzip bytes (server-only page) | 66437 | gzip bytes |
| 7 | qwik-router-v2 | app client bundle gzip bytes (server-only page) | 68172 | gzip bytes |
| 8 | tanstack-start | app client bundle gzip bytes (server-only page) | 112814 | gzip bytes |
| 9 | next-app-router | app client bundle gzip bytes (server-only page) | 185522 | gzip bytes |

### app client bundle gzip bytes (interactive page)

Measures gzip-compressed client JavaScript shipped for a minimal button-and-state interactive route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app client bundle gzip bytes (interactive page) | 1874 | gzip bytes |
| 2 | mreact-app-router+log enabled | app client bundle gzip bytes (interactive page) | 4029 | gzip bytes |
| 3 | mreact-app-router | app client bundle gzip bytes (interactive page) | 4030 | gzip bytes |
| 4 | solid-start | app client bundle gzip bytes (interactive page) | 28774 | gzip bytes |
| 5 | qwik-city | app client bundle gzip bytes (interactive page) | 47716 | gzip bytes |
| 6 | tanstack-start-solid | app client bundle gzip bytes (interactive page) | 66437 | gzip bytes |
| 7 | qwik-router-v2 | app client bundle gzip bytes (interactive page) | 68172 | gzip bytes |
| 8 | tanstack-start | app client bundle gzip bytes (interactive page) | 112814 | gzip bytes |
| 9 | next-app-router | app client bundle gzip bytes (interactive page) | 185522 | gzip bytes |

### app client bundle gzip bytes (interactive page, minimal opt-out)

Measures the same interactive route while opting out of optional client navigation runtime where the framework supports it.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app client bundle gzip bytes (interactive page, minimal opt-out) | 1874 | gzip bytes |
| 2 | mreact-app-router+log enabled | app client bundle gzip bytes (interactive page, minimal opt-out) | 2906 | gzip bytes |
| 3 | mreact-app-router | app client bundle gzip bytes (interactive page, minimal opt-out) | 2907 | gzip bytes |
| 4 | solid-start | app client bundle gzip bytes (interactive page, minimal opt-out) | 28774 | gzip bytes |
| 5 | qwik-city | app client bundle gzip bytes (interactive page, minimal opt-out) | 47716 | gzip bytes |
| 6 | tanstack-start-solid | app client bundle gzip bytes (interactive page, minimal opt-out) | 66437 | gzip bytes |
| 7 | qwik-router-v2 | app client bundle gzip bytes (interactive page, minimal opt-out) | 68172 | gzip bytes |
| 8 | tanstack-start | app client bundle gzip bytes (interactive page, minimal opt-out) | 112814 | gzip bytes |
| 9 | next-app-router | app client bundle gzip bytes (interactive page, minimal opt-out) | 185522 | gzip bytes |

### app build output gzip bytes

Measures gzip-compressed production build output size when the adapter exposes build artifacts.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
|  | no completed results |  |  |  |

## Results

| suite | framework | version | case | status | metric | unit | value | gzip bytes | hz | mean ms | p75 ms | p99 ms | note |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| router | marko-run | 0.10.0 | app render 1000 nodes | completed | throughput | ops/sec | 3361 | 0 | 3361 | 0.3244 | 0.3148 | 0.8648 |  |
| router | marko-run | 0.10.0 | app streaming 1000 nodes | completed | throughput | ops/sec | 4042 | 0 | 4042 | 0.2697 | 0.2513 | 0.7287 |  |
| router | marko-run | 0.10.0 | app dynamic route params data | completed | throughput | ops/sec | 2132 | 0 | 2132 | 0.4903 | 0.4675 | 1.3663 |  |
| router | marko-run | 0.10.0 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 51.0603 | 51.0256 | 59.4357 |  |
| router | marko-run | 0.10.0 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.4607 | 50.6148 | 51.0594 |  |
| router | marko-run | 0.10.0 | app static cached route 1000 nodes | unsupported | throughput | ops/sec | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app static cached route 1000 nodes |
| router | marko-run | 0.10.0 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 2120 | 0 | 2120 | 0.4949 | 0.4803 | 1.2804 |  |
| router | marko-run | 0.10.0 | app streaming first byte 1000 nodes | completed | duration | ms | 0.6644 | 0 | 0 | 0.6925 | 0.7783 | 0.7906 |  |
| router | marko-run | 0.10.0 | app streaming first chunk 1000 nodes | completed | duration | ms | 0.4631 | 0 | 0 | 0.4644 | 0.5297 | 0.5486 |  |
| router | marko-run | 0.10.0 | app streaming full body 1000 nodes | completed | duration | ms | 50.8457 | 0 | 0 | 50.7157 | 50.9917 | 51.0125 |  |
| router | marko-run | 0.10.0 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app client navigation route-to-route |
| router | marko-run | 0.10.0 | app hydration first interaction | completed | duration | ms | 28 | 0 | 0 | 25.9857 | 29.1 | 33.3 |  |
| router | marko-run | 0.10.0 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app server cold start |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 1874 | 1874 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 1874 | 1874 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 1874 | 1874 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app build output gzip bytes |
| router | qwik-city | 1.19.2 | app render 1000 nodes | completed | throughput | ops/sec | 1467 | 0 | 1467 | 0.7159 | 0.732 | 1.7664 |  |
| router | qwik-city | 1.19.2 | app streaming 1000 nodes | completed | throughput | ops/sec | 1452 | 0 | 1452 | 0.7094 | 0.688 | 1.2756 |  |
| router | qwik-city | 1.19.2 | app dynamic route params data | completed | throughput | ops/sec | 967 | 0 | 967 | 1.0525 | 1.0306 | 1.6849 |  |
| router | qwik-city | 1.19.2 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 51.1078 | 51.1366 | 51.7953 |  |
| router | qwik-city | 1.19.2 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.6715 | 50.7188 | 51.4916 |  |
| router | qwik-city | 1.19.2 | app static cached route 1000 nodes | unsupported | throughput | ops/sec | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app static cached route 1000 nodes |
| router | qwik-city | 1.19.2 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 976 | 0 | 976 | 1.0463 | 1.023 | 1.7112 |  |
| router | qwik-city | 1.19.2 | app streaming first byte 1000 nodes | completed | duration | ms | 0.4018 | 0 | 0 | 0.4479 | 0.415 | 0.8084 |  |
| router | qwik-city | 1.19.2 | app streaming first chunk 1000 nodes | completed | duration | ms | 0.4865 | 0 | 0 | 0.5239 | 0.5113 | 0.907 |  |
| router | qwik-city | 1.19.2 | app streaming full body 1000 nodes | completed | duration | ms | 51.0665 | 0 | 0 | 51.0802 | 51.0912 | 51.1355 |  |
| router | qwik-city | 1.19.2 | app client navigation route-to-route | completed | duration | ms | 99.5 | 0 | 0 | 100.0571 | 101 | 102.4 |  |
| router | qwik-city | 1.19.2 | app hydration first interaction | completed | duration | ms | 42.1 | 0 | 0 | 42.2571 | 43.3 | 46.9 |  |
| router | qwik-city | 1.19.2 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app server cold start |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app build output gzip bytes |
| router | qwik-router-v2 | 2.0.0-beta.35 | app render 1000 nodes | completed | throughput | ops/sec | 1123 | 0 | 1123 | 1.0185 | 0.915 | 3.2243 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app streaming 1000 nodes | completed | throughput | ops/sec | 1080 | 0 | 1080 | 1.0333 | 0.9054 | 3.1328 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app dynamic route params data | completed | throughput | ops/sec | 697 | 0 | 697 | 1.5754 | 1.403 | 4.1929 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 19 | 0 | 19 | 51.7683 | 51.7297 | 53.8797 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.9204 | 50.932 | 52.3328 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app static cached route 1000 nodes | unsupported | throughput | ops/sec | 0 | 0 | 0 | 0 | 0 | 0 | qwik-router-v2 does not implement app static cached route 1000 nodes |
| router | qwik-router-v2 | 2.0.0-beta.35 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 692 | 0 | 692 | 1.5818 | 1.4263 | 4.2247 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app streaming first byte 1000 nodes | completed | duration | ms | 51.5974 | 0 | 0 | 51.5384 | 51.7059 | 51.7867 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app streaming first chunk 1000 nodes | completed | duration | ms | 51.6367 | 0 | 0 | 51.6793 | 51.8611 | 51.8685 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app streaming full body 1000 nodes | completed | duration | ms | 51.5169 | 0 | 0 | 51.5453 | 51.6152 | 51.726 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app client navigation route-to-route | completed | duration | ms | 101.8 | 0 | 0 | 101.5 | 103.6 | 103.6 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app hydration first interaction | completed | duration | ms | 50.8 | 0 | 0 | 49.9429 | 53.6 | 53.7 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | qwik-router-v2 does not implement app server cold start |
| router | qwik-router-v2 | 2.0.0-beta.35 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 68172 | 68172 | 0 | 0 | 0 | 0 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 68172 | 68172 | 0 | 0 | 0 | 0 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 68172 | 68172 | 0 | 0 | 0 | 0 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | qwik-router-v2 does not implement app build output gzip bytes |
| router | solid-start | 1.3.2 | app render 1000 nodes | completed | throughput | ops/sec | 671 | 0 | 671 | 1.6845 | 1.6451 | 6.959 |  |
| router | solid-start | 1.3.2 | app streaming 1000 nodes | completed | throughput | ops/sec | 747 | 0 | 747 | 1.5708 | 1.5834 | 5.8812 |  |
| router | solid-start | 1.3.2 | app dynamic route params data | completed | throughput | ops/sec | 728 | 0 | 728 | 1.4674 | 1.4849 | 2.4857 |  |
| router | solid-start | 1.3.2 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 50.8646 | 50.9785 | 51.5434 |  |
| router | solid-start | 1.3.2 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.8229 | 51.0442 | 52.4622 |  |
| router | solid-start | 1.3.2 | app static cached route 1000 nodes | unsupported | throughput | ops/sec | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app static cached route 1000 nodes |
| router | solid-start | 1.3.2 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 767 | 0 | 767 | 1.4336 | 1.4947 | 2.3414 |  |
| router | solid-start | 1.3.2 | app streaming first byte 1000 nodes | completed | duration | ms | 1.4465 | 0 | 0 | 1.4598 | 1.4848 | 1.5341 |  |
| router | solid-start | 1.3.2 | app streaming first chunk 1000 nodes | completed | duration | ms | 1.4827 | 0 | 0 | 1.5374 | 1.4891 | 1.885 |  |
| router | solid-start | 1.3.2 | app streaming full body 1000 nodes | completed | duration | ms | 50.8047 | 0 | 0 | 50.8077 | 50.8189 | 50.852 |  |
| router | solid-start | 1.3.2 | app client navigation route-to-route | completed | duration | ms | 53.4 | 0 | 0 | 53.5 | 54.3 | 54.4 |  |
| router | solid-start | 1.3.2 | app hydration first interaction | completed | duration | ms | 22.6 | 0 | 0 | 24.3714 | 31.5 | 32.9 |  |
| router | solid-start | 1.3.2 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app server cold start |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 28774 | 28774 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 28774 | 28774 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 28774 | 28774 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app build output gzip bytes |
| router | tanstack-start | 1.167.65 | app render 1000 nodes | completed | throughput | ops/sec | 2111 | 0 | 2111 | 0.5023 | 0.4767 | 1.5845 |  |
| router | tanstack-start | 1.167.65 | app streaming 1000 nodes | completed | throughput | ops/sec | 2287 | 0 | 2287 | 0.4561 | 0.4376 | 1.5323 |  |
| router | tanstack-start | 1.167.65 | app dynamic route params data | completed | throughput | ops/sec | 1216 | 0 | 1216 | 0.8521 | 0.8066 | 1.8526 |  |
| router | tanstack-start | 1.167.65 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 51.0746 | 51.2289 | 51.9401 |  |
| router | tanstack-start | 1.167.65 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.8865 | 50.9899 | 51.6433 |  |
| router | tanstack-start | 1.167.65 | app static cached route 1000 nodes | unsupported | throughput | ops/sec | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app static cached route 1000 nodes |
| router | tanstack-start | 1.167.65 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 1322 | 0 | 1322 | 0.7807 | 0.7726 | 1.5616 |  |
| router | tanstack-start | 1.167.65 | app streaming first byte 1000 nodes | completed | duration | ms | 51.3416 | 0 | 0 | 51.3443 | 51.5086 | 51.7199 |  |
| router | tanstack-start | 1.167.65 | app streaming first chunk 1000 nodes | completed | duration | ms | 50.9581 | 0 | 0 | 50.9823 | 51.0541 | 51.201 |  |
| router | tanstack-start | 1.167.65 | app streaming full body 1000 nodes | completed | duration | ms | 50.9776 | 0 | 0 | 51.0269 | 51.2206 | 51.4234 |  |
| router | tanstack-start | 1.167.65 | app client navigation route-to-route | completed | duration | ms | 54.1 | 0 | 0 | 54.3286 | 54.9 | 55.2 |  |
| router | tanstack-start | 1.167.65 | app hydration first interaction | completed | duration | ms | 27.4 | 0 | 0 | 27.5714 | 31 | 33.8 |  |
| router | tanstack-start | 1.167.65 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app server cold start |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app build output gzip bytes |
| router | tanstack-start-solid | 2.0.0-beta.18 | app render 1000 nodes | completed | throughput | ops/sec | 574 | 0 | 574 | 1.9099 | 1.8479 | 7.4539 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app streaming 1000 nodes | completed | throughput | ops/sec | 585 | 0 | 585 | 1.856 | 1.7348 | 7.5229 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app dynamic route params data | completed | throughput | ops/sec | 613 | 0 | 613 | 1.7679 | 1.6664 | 7.9514 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 19 | 0 | 19 | 52.46 | 52.6031 | 56.685 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 19 | 0 | 19 | 51.8936 | 51.8877 | 54.4832 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app static cached route 1000 nodes | unsupported | throughput | ops/sec | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start-solid does not implement app static cached route 1000 nodes |
| router | tanstack-start-solid | 2.0.0-beta.18 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 617 | 0 | 617 | 1.7582 | 1.6743 | 7.7365 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app streaming first byte 1000 nodes | completed | duration | ms | 52.0422 | 0 | 0 | 51.878 | 52.4373 | 52.6351 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app streaming first chunk 1000 nodes | completed | duration | ms | 52.1242 | 0 | 0 | 51.8658 | 52.3009 | 52.3422 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app streaming full body 1000 nodes | completed | duration | ms | 52.1478 | 0 | 0 | 52.7834 | 52.3371 | 57.3034 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start-solid does not implement app client navigation route-to-route |
| router | tanstack-start-solid | 2.0.0-beta.18 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start-solid does not implement app hydration first interaction |
| router | tanstack-start-solid | 2.0.0-beta.18 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start-solid does not implement app server cold start |
| router | tanstack-start-solid | 2.0.0-beta.18 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 66437 | 66437 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 66437 | 66437 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 66437 | 66437 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start-solid does not implement app build output gzip bytes |
| router | next-app-router | 16.2.6 | app render 1000 nodes | completed | throughput | ops/sec | 177 | 0 | 177 | 5.9402 | 5.7624 | 12.1695 |  |
| router | next-app-router | 16.2.6 | app streaming 1000 nodes | completed | throughput | ops/sec | 187 | 0 | 187 | 5.7118 | 5.3495 | 13.813 |  |
| router | next-app-router | 16.2.6 | app dynamic route params data | completed | throughput | ops/sec | 260 | 0 | 260 | 4.027 | 3.7822 | 8.2791 |  |
| router | next-app-router | 16.2.6 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 18 | 0 | 18 | 54.918 | 54.947 | 59.6999 |  |
| router | next-app-router | 16.2.6 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 19 | 0 | 19 | 51.4847 | 51.7049 | 52.1849 |  |
| router | next-app-router | 16.2.6 | app static cached route 1000 nodes | completed | throughput | ops/sec | 933 | 0 | 933 | 1.1317 | 1.0605 | 3.4131 |  |
| router | next-app-router | 16.2.6 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 260 | 0 | 260 | 4.037 | 3.8314 | 8.8783 |  |
| router | next-app-router | 16.2.6 | app streaming first byte 1000 nodes | completed | duration | ms | 1.8905 | 0 | 0 | 1.8647 | 1.9658 | 1.9808 |  |
| router | next-app-router | 16.2.6 | app streaming first chunk 1000 nodes | completed | duration | ms | 2.169 | 0 | 0 | 2.8884 | 2.2803 | 7.387 |  |
| router | next-app-router | 16.2.6 | app streaming full body 1000 nodes | completed | duration | ms | 55.1156 | 0 | 0 | 55.1572 | 55.311 | 55.6431 |  |
| router | next-app-router | 16.2.6 | app client navigation route-to-route | completed | duration | ms | 54.5 | 0 | 0 | 55.8714 | 55.6 | 64.5 |  |
| router | next-app-router | 16.2.6 | app hydration first interaction | completed | duration | ms | 28.8 | 0 | 0 | 26.3714 | 30.7 | 31.8 |  |
| router | next-app-router | 16.2.6 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app server cold start |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 185522 | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 185522 | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 185522 | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app build output gzip bytes |
| router | mreact-app-router | workspace | app render 1000 nodes | completed | throughput | ops/sec | 5311 | 0 | 5311 | 0.2058 | 0.1961 | 0.616 |  |
| router | mreact-app-router | workspace | app streaming 1000 nodes | completed | throughput | ops/sec | 3804 | 0 | 3804 | 0.2786 | 0.2653 | 0.882 |  |
| router | mreact-app-router | workspace | app dynamic route params data | completed | throughput | ops/sec | 3502 | 0 | 3502 | 0.3154 | 0.2819 | 1.4977 |  |
| router | mreact-app-router | workspace | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 50.6549 | 50.7865 | 52.2683 |  |
| router | mreact-app-router | workspace | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.8979 | 51.083 | 52.2375 |  |
| router | mreact-app-router | workspace | app static cached route 1000 nodes | completed | throughput | ops/sec | 6432 | 0 | 6432 | 0.1717 | 0.1557 | 0.5787 |  |
| router | mreact-app-router | workspace | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 3580 | 0 | 3580 | 0.309 | 0.2755 | 1.4951 |  |
| router | mreact-app-router | workspace | app streaming first byte 1000 nodes | completed | duration | ms | 0.4498 | 0 | 0 | 0.4801 | 0.5411 | 0.7555 |  |
| router | mreact-app-router | workspace | app streaming first chunk 1000 nodes | completed | duration | ms | 0.4483 | 0 | 0 | 0.4632 | 0.4907 | 0.5162 |  |
| router | mreact-app-router | workspace | app streaming full body 1000 nodes | completed | duration | ms | 50.8102 | 0 | 0 | 50.8189 | 50.8279 | 51.7061 |  |
| router | mreact-app-router | workspace | app client navigation route-to-route | completed | duration | ms | 53.7 | 0 | 0 | 53.8286 | 54.3 | 55.7 |  |
| router | mreact-app-router | workspace | app hydration first interaction | completed | duration | ms | 20.3 | 0 | 0 | 22.8857 | 31.4 | 32.2 |  |
| router | mreact-app-router | workspace | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app server cold start |
| router | mreact-app-router | workspace | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 4030 | 4030 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 2907 | 2907 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app build output gzip bytes |
| router | mreact-app-router+log enabled | workspace | app render 1000 nodes | completed | throughput | ops/sec | 5085 | 0 | 5085 | 0.2163 | 0.2083 | 0.7177 |  |
| router | mreact-app-router+log enabled | workspace | app streaming 1000 nodes | completed | throughput | ops/sec | 3575 | 0 | 3575 | 0.2969 | 0.2843 | 0.9443 |  |
| router | mreact-app-router+log enabled | workspace | app dynamic route params data | completed | throughput | ops/sec | 3370 | 0 | 3370 | 0.3263 | 0.2953 | 1.5077 |  |
| router | mreact-app-router+log enabled | workspace | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 50.7512 | 50.8917 | 51.1924 |  |
| router | mreact-app-router+log enabled | workspace | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.7056 | 50.9142 | 51.6376 |  |
| router | mreact-app-router+log enabled | workspace | app static cached route 1000 nodes | completed | throughput | ops/sec | 5677 | 0 | 5677 | 0.1948 | 0.1807 | 0.6484 |  |
| router | mreact-app-router+log enabled | workspace | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 3318 | 0 | 3318 | 0.3359 | 0.2973 | 1.5537 |  |
| router | mreact-app-router+log enabled | workspace | app streaming first byte 1000 nodes | completed | duration | ms | 0.5458 | 0 | 0 | 0.5567 | 0.6909 | 0.7249 |  |
| router | mreact-app-router+log enabled | workspace | app streaming first chunk 1000 nodes | completed | duration | ms | 0.6134 | 0 | 0 | 0.625 | 0.7138 | 0.8424 |  |
| router | mreact-app-router+log enabled | workspace | app streaming full body 1000 nodes | completed | duration | ms | 50.7365 | 0 | 0 | 50.6338 | 50.8222 | 51.0082 |  |
| router | mreact-app-router+log enabled | workspace | app client navigation route-to-route | completed | duration | ms | 53.7 | 0 | 0 | 53.7286 | 54.4 | 54.4 |  |
| router | mreact-app-router+log enabled | workspace | app hydration first interaction | completed | duration | ms | 18.7 | 0 | 0 | 24.2571 | 32 | 32.7 |  |
| router | mreact-app-router+log enabled | workspace | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router+log enabled does not implement app server cold start |
| router | mreact-app-router+log enabled | workspace | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router+log enabled | workspace | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 4029 | 4029 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router+log enabled | workspace | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 2906 | 2906 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router+log enabled | workspace | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router+log enabled does not implement app build output gzip bytes |
