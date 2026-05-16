# Router Benchmark

## Environment

- Date: 2026-05-16
- Git commit: 0cea018abbbe17899ad704f79a5c7cb38b247200
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
| 1 | mreact-app-router+log enabled | app render 1000 nodes | 4690 | ops/sec |
| 2 | mreact-app-router | app render 1000 nodes | 3639 | ops/sec |
| 3 | marko-run | app render 1000 nodes | 3289 | ops/sec |
| 4 | tanstack-start | app render 1000 nodes | 2147 | ops/sec |
| 5 | qwik-city | app render 1000 nodes | 1422 | ops/sec |
| 6 | qwik-router-v2 | app render 1000 nodes | 1090 | ops/sec |
| 7 | solid-start | app render 1000 nodes | 683 | ops/sec |
| 8 | tanstack-start-solid | app render 1000 nodes | 554 | ops/sec |
| 9 | next-app-router | app render 1000 nodes | 174 | ops/sec |

### app streaming 1000 nodes

Streams a production app route with 1,000 simple text spans and validates the complete response body.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app streaming 1000 nodes | 3959 | ops/sec |
| 2 | mreact-app-router+log enabled | app streaming 1000 nodes | 3528 | ops/sec |
| 3 | mreact-app-router | app streaming 1000 nodes | 3113 | ops/sec |
| 4 | tanstack-start | app streaming 1000 nodes | 2280 | ops/sec |
| 5 | qwik-city | app streaming 1000 nodes | 1367 | ops/sec |
| 6 | qwik-router-v2 | app streaming 1000 nodes | 1047 | ops/sec |
| 7 | solid-start | app streaming 1000 nodes | 732 | ops/sec |
| 8 | tanstack-start-solid | app streaming 1000 nodes | 572 | ops/sec |
| 9 | next-app-router | app streaming 1000 nodes | 180 | ops/sec |

### app streaming first byte 1000 nodes

Measures elapsed time until fetch resolves response headers for the real streaming route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app streaming first byte 1000 nodes | 0.3449 | ms |
| 2 | mreact-app-router+log enabled | app streaming first byte 1000 nodes | 0.4261 | ms |
| 3 | mreact-app-router | app streaming first byte 1000 nodes | 0.6034 | ms |
| 4 | qwik-city | app streaming first byte 1000 nodes | 0.6497 | ms |
| 5 | next-app-router | app streaming first byte 1000 nodes | 1.5473 | ms |
| 6 | solid-start | app streaming first byte 1000 nodes | 1.8138 | ms |
| 7 | tanstack-start | app streaming first byte 1000 nodes | 50.8098 | ms |
| 8 | qwik-router-v2 | app streaming first byte 1000 nodes | 51.4862 | ms |
| 9 | tanstack-start-solid | app streaming first byte 1000 nodes | 52.087 | ms |

### app streaming first chunk 1000 nodes

Measures elapsed time until the first response body chunk arrives for the real streaming route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app streaming first chunk 1000 nodes | 0.3555 | ms |
| 2 | mreact-app-router+log enabled | app streaming first chunk 1000 nodes | 0.5122 | ms |
| 3 | qwik-city | app streaming first chunk 1000 nodes | 0.5243 | ms |
| 4 | mreact-app-router | app streaming first chunk 1000 nodes | 0.7255 | ms |
| 5 | next-app-router | app streaming first chunk 1000 nodes | 1.5868 | ms |
| 6 | solid-start | app streaming first chunk 1000 nodes | 1.7109 | ms |
| 7 | tanstack-start | app streaming first chunk 1000 nodes | 50.9172 | ms |
| 8 | qwik-router-v2 | app streaming first chunk 1000 nodes | 51.5121 | ms |
| 9 | tanstack-start-solid | app streaming first chunk 1000 nodes | 52.1216 | ms |

### app streaming full body 1000 nodes

Measures elapsed time until the complete real streaming response body is consumed and validated.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app streaming full body 1000 nodes | 50.7828 | ms |
| 2 | mreact-app-router | app streaming full body 1000 nodes | 50.8494 | ms |
| 3 | tanstack-start | app streaming full body 1000 nodes | 50.9941 | ms |
| 4 | solid-start | app streaming full body 1000 nodes | 51.0204 | ms |
| 5 | qwik-city | app streaming full body 1000 nodes | 51.0525 | ms |
| 6 | mreact-app-router+log enabled | app streaming full body 1000 nodes | 51.0885 | ms |
| 7 | qwik-router-v2 | app streaming full body 1000 nodes | 51.6362 | ms |
| 8 | tanstack-start-solid | app streaming full body 1000 nodes | 52.1397 | ms |
| 9 | next-app-router | app streaming full body 1000 nodes | 54.6038 | ms |

### app real streaming 1000 nodes (async 50ms)

Streams a route whose body waits on a 50 ms async boundary before the full 1,000-node response completes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 2 | mreact-app-router | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 3 | mreact-app-router+log enabled | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 4 | tanstack-start | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 5 | solid-start | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 6 | qwik-city | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 7 | qwik-router-v2 | app real streaming 1000 nodes (async 50ms) | 19 | ops/sec |
| 8 | tanstack-start-solid | app real streaming 1000 nodes (async 50ms) | 19 | ops/sec |
| 9 | next-app-router | app real streaming 1000 nodes (async 50ms) | 18 | ops/sec |

### app parallel async boundaries 2x50ms

Renders two sibling 50 ms async boundaries and reports whether total response latency stays near one boundary instead of waterfalling.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router+log enabled | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 2 | marko-run | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 3 | tanstack-start | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 4 | solid-start | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 5 | qwik-city | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 6 | mreact-app-router | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 7 | qwik-router-v2 | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 8 | next-app-router | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 9 | tanstack-start-solid | app parallel async boundaries 2x50ms | 19 | ops/sec |

### app dynamic-attr grid 200 cells

Renders 200 cells with many dynamic escaped attributes, inline style values, and text content.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app dynamic-attr grid 200 cells | 3399 | ops/sec |
| 2 | mreact-app-router+log enabled | app dynamic-attr grid 200 cells | 3375 | ops/sec |
| 3 | marko-run | app dynamic-attr grid 200 cells | 2123 | ops/sec |
| 4 | tanstack-start | app dynamic-attr grid 200 cells | 1251 | ops/sec |
| 5 | qwik-city | app dynamic-attr grid 200 cells | 994 | ops/sec |
| 6 | solid-start | app dynamic-attr grid 200 cells | 687 | ops/sec |
| 7 | qwik-router-v2 | app dynamic-attr grid 200 cells | 665 | ops/sec |
| 8 | tanstack-start-solid | app dynamic-attr grid 200 cells | 620 | ops/sec |
| 9 | next-app-router | app dynamic-attr grid 200 cells | 259 | ops/sec |

### app dynamic route params data

Renders a dynamic route that combines route parameters with server data before producing HTML.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router+log enabled | app dynamic route params data | 3416 | ops/sec |
| 2 | mreact-app-router | app dynamic route params data | 3393 | ops/sec |
| 3 | marko-run | app dynamic route params data | 2067 | ops/sec |
| 4 | tanstack-start | app dynamic route params data | 1238 | ops/sec |
| 5 | qwik-city | app dynamic route params data | 981 | ops/sec |
| 6 | solid-start | app dynamic route params data | 719 | ops/sec |
| 7 | qwik-router-v2 | app dynamic route params data | 676 | ops/sec |
| 8 | tanstack-start-solid | app dynamic route params data | 569 | ops/sec |
| 9 | next-app-router | app dynamic route params data | 250 | ops/sec |

### app client navigation route-to-route

Measures route-to-route client navigation latency in a real browser when the adapter provides a browser probe.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app client navigation route-to-route | 53.3 | ms |
| 2 | solid-start | app client navigation route-to-route | 53.5 | ms |
| 3 | mreact-app-router+log enabled | app client navigation route-to-route | 53.7 | ms |
| 4 | tanstack-start | app client navigation route-to-route | 54.4 | ms |
| 5 | next-app-router | app client navigation route-to-route | 54.9 | ms |
| 6 | qwik-city | app client navigation route-to-route | 99 | ms |
| 7 | qwik-router-v2 | app client navigation route-to-route | 103.2 | ms |

### app hydration first interaction

Measures time for the first client interaction to update visible UI after loading an interactive route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app hydration first interaction | 21.1 | ms |
| 2 | mreact-app-router | app hydration first interaction | 21.3 | ms |
| 3 | solid-start | app hydration first interaction | 22.9 | ms |
| 4 | tanstack-start | app hydration first interaction | 24.5 | ms |
| 5 | mreact-app-router+log enabled | app hydration first interaction | 25.1 | ms |
| 6 | next-app-router | app hydration first interaction | 32.8 | ms |
| 7 | qwik-city | app hydration first interaction | 42.9 | ms |
| 8 | qwik-router-v2 | app hydration first interaction | 45.4 | ms |

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
| 3 | marko-run | app client bundle gzip bytes (server-only page) | 1872 | gzip bytes |
| 4 | solid-start | app client bundle gzip bytes (server-only page) | 28773 | gzip bytes |
| 5 | qwik-city | app client bundle gzip bytes (server-only page) | 47716 | gzip bytes |
| 6 | tanstack-start-solid | app client bundle gzip bytes (server-only page) | 66437 | gzip bytes |
| 7 | qwik-router-v2 | app client bundle gzip bytes (server-only page) | 68172 | gzip bytes |
| 8 | tanstack-start | app client bundle gzip bytes (server-only page) | 112814 | gzip bytes |
| 9 | next-app-router | app client bundle gzip bytes (server-only page) | 185522 | gzip bytes |

### app client bundle gzip bytes (interactive page)

Measures gzip-compressed client JavaScript shipped for a minimal button-and-state interactive route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app client bundle gzip bytes (interactive page) | 1872 | gzip bytes |
| 2 | mreact-app-router | app client bundle gzip bytes (interactive page) | 4029 | gzip bytes |
| 3 | mreact-app-router+log enabled | app client bundle gzip bytes (interactive page) | 4030 | gzip bytes |
| 4 | solid-start | app client bundle gzip bytes (interactive page) | 28773 | gzip bytes |
| 5 | qwik-city | app client bundle gzip bytes (interactive page) | 47716 | gzip bytes |
| 6 | tanstack-start-solid | app client bundle gzip bytes (interactive page) | 66437 | gzip bytes |
| 7 | qwik-router-v2 | app client bundle gzip bytes (interactive page) | 68172 | gzip bytes |
| 8 | tanstack-start | app client bundle gzip bytes (interactive page) | 112814 | gzip bytes |
| 9 | next-app-router | app client bundle gzip bytes (interactive page) | 185522 | gzip bytes |

### app client bundle gzip bytes (interactive page, minimal opt-out)

Measures the same interactive route while opting out of optional client navigation runtime where the framework supports it.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app client bundle gzip bytes (interactive page, minimal opt-out) | 1872 | gzip bytes |
| 2 | mreact-app-router | app client bundle gzip bytes (interactive page, minimal opt-out) | 2906 | gzip bytes |
| 3 | mreact-app-router+log enabled | app client bundle gzip bytes (interactive page, minimal opt-out) | 2907 | gzip bytes |
| 4 | solid-start | app client bundle gzip bytes (interactive page, minimal opt-out) | 28773 | gzip bytes |
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
| router | marko-run | 0.10.0 | app render 1000 nodes | completed | throughput | ops/sec | 3289 | 0 | 3289 | 0.3258 | 0.3118 | 0.7791 |  |
| router | marko-run | 0.10.0 | app streaming 1000 nodes | completed | throughput | ops/sec | 3959 | 0 | 3959 | 0.2735 | 0.2598 | 0.755 |  |
| router | marko-run | 0.10.0 | app dynamic route params data | completed | throughput | ops/sec | 2067 | 0 | 2067 | 0.5048 | 0.4842 | 1.3805 |  |
| router | marko-run | 0.10.0 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 50.5367 | 50.7982 | 51.2095 |  |
| router | marko-run | 0.10.0 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.5653 | 50.8534 | 51.129 |  |
| router | marko-run | 0.10.0 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 2123 | 0 | 2123 | 0.4927 | 0.4863 | 1.1434 |  |
| router | marko-run | 0.10.0 | app streaming first byte 1000 nodes | completed | duration | ms | 0.3449 | 0 | 0 | 0.3714 | 0.407 | 0.5133 |  |
| router | marko-run | 0.10.0 | app streaming first chunk 1000 nodes | completed | duration | ms | 0.3555 | 0 | 0 | 0.3529 | 0.3722 | 0.3776 |  |
| router | marko-run | 0.10.0 | app streaming full body 1000 nodes | completed | duration | ms | 50.7828 | 0 | 0 | 50.5034 | 50.9025 | 51.119 |  |
| router | marko-run | 0.10.0 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app client navigation route-to-route |
| router | marko-run | 0.10.0 | app hydration first interaction | completed | duration | ms | 21.1 | 0 | 0 | 22.4714 | 24.9 | 32.7 |  |
| router | marko-run | 0.10.0 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app server cold start |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 1872 | 1872 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 1872 | 1872 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 1872 | 1872 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app build output gzip bytes |
| router | qwik-city | 1.19.2 | app render 1000 nodes | completed | throughput | ops/sec | 1422 | 0 | 1422 | 0.7298 | 0.7571 | 1.2992 |  |
| router | qwik-city | 1.19.2 | app streaming 1000 nodes | completed | throughput | ops/sec | 1367 | 0 | 1367 | 0.7543 | 0.7284 | 1.3609 |  |
| router | qwik-city | 1.19.2 | app dynamic route params data | completed | throughput | ops/sec | 981 | 0 | 981 | 1.0388 | 1.0145 | 1.6521 |  |
| router | qwik-city | 1.19.2 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 51.2257 | 51.3009 | 51.7205 |  |
| router | qwik-city | 1.19.2 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.7846 | 50.8819 | 51.193 |  |
| router | qwik-city | 1.19.2 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 994 | 0 | 994 | 1.0311 | 1.0007 | 1.6448 |  |
| router | qwik-city | 1.19.2 | app streaming first byte 1000 nodes | completed | duration | ms | 0.6497 | 0 | 0 | 0.6937 | 0.7936 | 1.174 |  |
| router | qwik-city | 1.19.2 | app streaming first chunk 1000 nodes | completed | duration | ms | 0.5243 | 0 | 0 | 0.5116 | 0.5337 | 0.544 |  |
| router | qwik-city | 1.19.2 | app streaming full body 1000 nodes | completed | duration | ms | 51.0525 | 0 | 0 | 51.0152 | 51.1237 | 51.1544 |  |
| router | qwik-city | 1.19.2 | app client navigation route-to-route | completed | duration | ms | 99 | 0 | 0 | 98.9143 | 99.4 | 99.8 |  |
| router | qwik-city | 1.19.2 | app hydration first interaction | completed | duration | ms | 42.9 | 0 | 0 | 44.4571 | 46.4 | 52.4 |  |
| router | qwik-city | 1.19.2 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app server cold start |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app build output gzip bytes |
| router | qwik-router-v2 | 2.0.0-beta.35 | app render 1000 nodes | completed | throughput | ops/sec | 1090 | 0 | 1090 | 1.0451 | 0.9252 | 3.3362 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app streaming 1000 nodes | completed | throughput | ops/sec | 1047 | 0 | 1047 | 1.0796 | 0.9364 | 3.2862 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app dynamic route params data | completed | throughput | ops/sec | 676 | 0 | 676 | 1.6461 | 1.4514 | 4.38 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 19 | 0 | 19 | 51.6227 | 51.6007 | 53.5814 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 51.0076 | 51.0775 | 52.2891 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 665 | 0 | 665 | 1.6599 | 1.5368 | 4.4173 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app streaming first byte 1000 nodes | completed | duration | ms | 51.4862 | 0 | 0 | 51.5499 | 51.5633 | 51.8451 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app streaming first chunk 1000 nodes | completed | duration | ms | 51.5121 | 0 | 0 | 51.3496 | 51.6188 | 51.9262 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app streaming full body 1000 nodes | completed | duration | ms | 51.6362 | 0 | 0 | 51.9984 | 51.8877 | 54.0788 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app client navigation route-to-route | completed | duration | ms | 103.2 | 0 | 0 | 102.1286 | 103.5 | 104.6 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app hydration first interaction | completed | duration | ms | 45.4 | 0 | 0 | 45.2714 | 46.9 | 51.5 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | qwik-router-v2 does not implement app server cold start |
| router | qwik-router-v2 | 2.0.0-beta.35 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 68172 | 68172 | 0 | 0 | 0 | 0 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 68172 | 68172 | 0 | 0 | 0 | 0 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 68172 | 68172 | 0 | 0 | 0 | 0 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | qwik-router-v2 does not implement app build output gzip bytes |
| router | solid-start | 1.3.2 | app render 1000 nodes | completed | throughput | ops/sec | 683 | 0 | 683 | 1.67 | 1.64 | 7.203 |  |
| router | solid-start | 1.3.2 | app streaming 1000 nodes | completed | throughput | ops/sec | 732 | 0 | 732 | 1.573 | 1.5869 | 5.6992 |  |
| router | solid-start | 1.3.2 | app dynamic route params data | completed | throughput | ops/sec | 719 | 0 | 719 | 1.4867 | 1.5026 | 2.7449 |  |
| router | solid-start | 1.3.2 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 50.9251 | 51.005 | 51.8425 |  |
| router | solid-start | 1.3.2 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.7295 | 51.017 | 51.5049 |  |
| router | solid-start | 1.3.2 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 687 | 0 | 687 | 1.5292 | 1.5365 | 2.8017 |  |
| router | solid-start | 1.3.2 | app streaming first byte 1000 nodes | completed | duration | ms | 1.8138 | 0 | 0 | 1.8165 | 1.9129 | 2.046 |  |
| router | solid-start | 1.3.2 | app streaming first chunk 1000 nodes | completed | duration | ms | 1.7109 | 0 | 0 | 1.7038 | 1.8306 | 1.8469 |  |
| router | solid-start | 1.3.2 | app streaming full body 1000 nodes | completed | duration | ms | 51.0204 | 0 | 0 | 51.0499 | 51.0849 | 51.1956 |  |
| router | solid-start | 1.3.2 | app client navigation route-to-route | completed | duration | ms | 53.5 | 0 | 0 | 53.3 | 53.8 | 54.3 |  |
| router | solid-start | 1.3.2 | app hydration first interaction | completed | duration | ms | 22.9 | 0 | 0 | 25.0714 | 31.4 | 33.3 |  |
| router | solid-start | 1.3.2 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app server cold start |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 28773 | 28773 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 28773 | 28773 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 28773 | 28773 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app build output gzip bytes |
| router | tanstack-start | 1.167.65 | app render 1000 nodes | completed | throughput | ops/sec | 2147 | 0 | 2147 | 0.4934 | 0.4742 | 1.695 |  |
| router | tanstack-start | 1.167.65 | app streaming 1000 nodes | completed | throughput | ops/sec | 2280 | 0 | 2280 | 0.4573 | 0.4374 | 1.6443 |  |
| router | tanstack-start | 1.167.65 | app dynamic route params data | completed | throughput | ops/sec | 1238 | 0 | 1238 | 0.8338 | 0.8036 | 1.9104 |  |
| router | tanstack-start | 1.167.65 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 50.7849 | 50.86 | 51.523 |  |
| router | tanstack-start | 1.167.65 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.6577 | 50.7429 | 51.257 |  |
| router | tanstack-start | 1.167.65 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 1251 | 0 | 1251 | 0.8258 | 0.8143 | 1.5792 |  |
| router | tanstack-start | 1.167.65 | app streaming first byte 1000 nodes | completed | duration | ms | 50.8098 | 0 | 0 | 50.8351 | 50.8808 | 50.9256 |  |
| router | tanstack-start | 1.167.65 | app streaming first chunk 1000 nodes | completed | duration | ms | 50.9172 | 0 | 0 | 51.0014 | 51.2068 | 51.291 |  |
| router | tanstack-start | 1.167.65 | app streaming full body 1000 nodes | completed | duration | ms | 50.9941 | 0 | 0 | 51.0196 | 51.0865 | 51.0903 |  |
| router | tanstack-start | 1.167.65 | app client navigation route-to-route | completed | duration | ms | 54.4 | 0 | 0 | 54.8143 | 55.3 | 58.5 |  |
| router | tanstack-start | 1.167.65 | app hydration first interaction | completed | duration | ms | 24.5 | 0 | 0 | 24.7571 | 29.6 | 30.6 |  |
| router | tanstack-start | 1.167.65 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app server cold start |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app build output gzip bytes |
| router | tanstack-start-solid | 2.0.0-beta.18 | app render 1000 nodes | completed | throughput | ops/sec | 554 | 0 | 554 | 1.9673 | 1.8775 | 7.6931 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app streaming 1000 nodes | completed | throughput | ops/sec | 572 | 0 | 572 | 1.904 | 1.7594 | 8.2009 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app dynamic route params data | completed | throughput | ops/sec | 569 | 0 | 569 | 1.9168 | 1.7214 | 7.8819 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 19 | 0 | 19 | 52.4383 | 52.4871 | 56.6535 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 19 | 0 | 19 | 51.7646 | 51.8645 | 52.8214 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 620 | 0 | 620 | 1.7693 | 1.6519 | 8.5086 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app streaming first byte 1000 nodes | completed | duration | ms | 52.087 | 0 | 0 | 51.9363 | 52.1766 | 52.2134 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app streaming first chunk 1000 nodes | completed | duration | ms | 52.1216 | 0 | 0 | 52.2666 | 52.463 | 52.8762 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app streaming full body 1000 nodes | completed | duration | ms | 52.1397 | 0 | 0 | 53.2019 | 52.4114 | 59.3357 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start-solid does not implement app client navigation route-to-route |
| router | tanstack-start-solid | 2.0.0-beta.18 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start-solid does not implement app hydration first interaction |
| router | tanstack-start-solid | 2.0.0-beta.18 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start-solid does not implement app server cold start |
| router | tanstack-start-solid | 2.0.0-beta.18 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 66437 | 66437 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 66437 | 66437 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 66437 | 66437 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start-solid | 2.0.0-beta.18 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start-solid does not implement app build output gzip bytes |
| router | next-app-router | 16.2.6 | app render 1000 nodes | completed | throughput | ops/sec | 174 | 0 | 174 | 6.0788 | 5.8515 | 13.2786 |  |
| router | next-app-router | 16.2.6 | app streaming 1000 nodes | completed | throughput | ops/sec | 180 | 0 | 180 | 5.953 | 5.6146 | 13.5808 |  |
| router | next-app-router | 16.2.6 | app dynamic route params data | completed | throughput | ops/sec | 250 | 0 | 250 | 4.1952 | 3.912 | 8.807 |  |
| router | next-app-router | 16.2.6 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 18 | 0 | 18 | 54.8878 | 55.1239 | 59.8847 |  |
| router | next-app-router | 16.2.6 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 51.2643 | 51.3643 | 52.2616 |  |
| router | next-app-router | 16.2.6 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 259 | 0 | 259 | 4.0808 | 3.8231 | 9.4177 |  |
| router | next-app-router | 16.2.6 | app streaming first byte 1000 nodes | completed | duration | ms | 1.5473 | 0 | 0 | 1.5224 | 1.7387 | 1.8301 |  |
| router | next-app-router | 16.2.6 | app streaming first chunk 1000 nodes | completed | duration | ms | 1.5868 | 0 | 0 | 1.7538 | 2.2161 | 2.4631 |  |
| router | next-app-router | 16.2.6 | app streaming full body 1000 nodes | completed | duration | ms | 54.6038 | 0 | 0 | 55.043 | 54.9501 | 59.1767 |  |
| router | next-app-router | 16.2.6 | app client navigation route-to-route | completed | duration | ms | 54.9 | 0 | 0 | 53.9571 | 55.9 | 56 |  |
| router | next-app-router | 16.2.6 | app hydration first interaction | completed | duration | ms | 32.8 | 0 | 0 | 29.2429 | 33.7 | 34 |  |
| router | next-app-router | 16.2.6 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app server cold start |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 185522 | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 185522 | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 185522 | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app build output gzip bytes |
| router | mreact-app-router | workspace | app render 1000 nodes | completed | throughput | ops/sec | 3639 | 0 | 3639 | 0.2934 | 0.2973 | 0.6698 |  |
| router | mreact-app-router | workspace | app streaming 1000 nodes | completed | throughput | ops/sec | 3113 | 0 | 3113 | 0.3442 | 0.3366 | 1.2166 |  |
| router | mreact-app-router | workspace | app dynamic route params data | completed | throughput | ops/sec | 3393 | 0 | 3393 | 0.3238 | 0.2912 | 1.5267 |  |
| router | mreact-app-router | workspace | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 50.6414 | 50.8264 | 51.2838 |  |
| router | mreact-app-router | workspace | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.8093 | 51.0111 | 51.4419 |  |
| router | mreact-app-router | workspace | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 3399 | 0 | 3399 | 0.3243 | 0.2908 | 1.5335 |  |
| router | mreact-app-router | workspace | app streaming first byte 1000 nodes | completed | duration | ms | 0.6034 | 0 | 0 | 0.6596 | 0.8084 | 0.8598 |  |
| router | mreact-app-router | workspace | app streaming first chunk 1000 nodes | completed | duration | ms | 0.7255 | 0 | 0 | 0.721 | 0.8053 | 0.8491 |  |
| router | mreact-app-router | workspace | app streaming full body 1000 nodes | completed | duration | ms | 50.8494 | 0 | 0 | 50.682 | 50.905 | 50.9246 |  |
| router | mreact-app-router | workspace | app client navigation route-to-route | completed | duration | ms | 53.3 | 0 | 0 | 53.5571 | 54.2 | 54.2 |  |
| router | mreact-app-router | workspace | app hydration first interaction | completed | duration | ms | 21.3 | 0 | 0 | 23.4286 | 30 | 31.2 |  |
| router | mreact-app-router | workspace | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app server cold start |
| router | mreact-app-router | workspace | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 4029 | 4029 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 2906 | 2906 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app build output gzip bytes |
| router | mreact-app-router+log enabled | workspace | app render 1000 nodes | completed | throughput | ops/sec | 4690 | 0 | 4690 | 0.2308 | 0.2287 | 0.5915 |  |
| router | mreact-app-router+log enabled | workspace | app streaming 1000 nodes | completed | throughput | ops/sec | 3528 | 0 | 3528 | 0.305 | 0.2859 | 1.315 |  |
| router | mreact-app-router+log enabled | workspace | app dynamic route params data | completed | throughput | ops/sec | 3416 | 0 | 3416 | 0.3238 | 0.2887 | 1.5083 |  |
| router | mreact-app-router+log enabled | workspace | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 50.6535 | 50.7707 | 51.3378 |  |
| router | mreact-app-router+log enabled | workspace | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.5532 | 50.7566 | 51.1712 |  |
| router | mreact-app-router+log enabled | workspace | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 3375 | 0 | 3375 | 0.3293 | 0.2924 | 1.5775 |  |
| router | mreact-app-router+log enabled | workspace | app streaming first byte 1000 nodes | completed | duration | ms | 0.4261 | 0 | 0 | 0.4553 | 0.5262 | 0.5317 |  |
| router | mreact-app-router+log enabled | workspace | app streaming first chunk 1000 nodes | completed | duration | ms | 0.5122 | 0 | 0 | 0.5372 | 0.6003 | 0.6187 |  |
| router | mreact-app-router+log enabled | workspace | app streaming full body 1000 nodes | completed | duration | ms | 51.0885 | 0 | 0 | 51.0482 | 51.3904 | 51.3911 |  |
| router | mreact-app-router+log enabled | workspace | app client navigation route-to-route | completed | duration | ms | 53.7 | 0 | 0 | 53.8 | 54.4 | 54.7 |  |
| router | mreact-app-router+log enabled | workspace | app hydration first interaction | completed | duration | ms | 25.1 | 0 | 0 | 24.5857 | 28.5 | 30.5 |  |
| router | mreact-app-router+log enabled | workspace | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router+log enabled does not implement app server cold start |
| router | mreact-app-router+log enabled | workspace | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router+log enabled | workspace | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 4030 | 4030 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router+log enabled | workspace | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 2907 | 2907 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router+log enabled | workspace | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router+log enabled does not implement app build output gzip bytes |
