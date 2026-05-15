# Router Benchmark

## Environment

- Date: 2026-05-15
- Git commit: 89993321a6c66c70b69ccb6b4b2ef8fc05cc160d
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

## Rankings

### app render 1000 nodes

Renders a production app route that emits 1,000 simple text spans.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router+log enabled | app render 1000 nodes | 6281 | ops/sec |
| 2 | mreact-app-router | app render 1000 nodes | 5697 | ops/sec |
| 3 | marko-run | app render 1000 nodes | 3284 | ops/sec |
| 4 | tanstack-start | app render 1000 nodes | 2107 | ops/sec |
| 5 | qwik-city | app render 1000 nodes | 1405 | ops/sec |
| 6 | qwik-router-v2 | app render 1000 nodes | 1108 | ops/sec |
| 7 | solid-start | app render 1000 nodes | 626 | ops/sec |
| 8 | next-app-router | app render 1000 nodes | 170 | ops/sec |

### app streaming 1000 nodes

Streams a production app route with 1,000 simple text spans and validates the complete response body.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app streaming 1000 nodes | 3958 | ops/sec |
| 2 | mreact-app-router | app streaming 1000 nodes | 3927 | ops/sec |
| 3 | mreact-app-router+log enabled | app streaming 1000 nodes | 3884 | ops/sec |
| 4 | tanstack-start | app streaming 1000 nodes | 1910 | ops/sec |
| 5 | qwik-city | app streaming 1000 nodes | 1368 | ops/sec |
| 6 | qwik-router-v2 | app streaming 1000 nodes | 1027 | ops/sec |
| 7 | solid-start | app streaming 1000 nodes | 704 | ops/sec |
| 8 | next-app-router | app streaming 1000 nodes | 178 | ops/sec |

### app streaming first byte 1000 nodes

Measures elapsed time until fetch resolves response headers for the real streaming route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app streaming first byte 1000 nodes | 0.5392 | ms |
| 2 | mreact-app-router+log enabled | app streaming first byte 1000 nodes | 0.615 | ms |
| 3 | mreact-app-router | app streaming first byte 1000 nodes | 0.6294 | ms |
| 4 | qwik-city | app streaming first byte 1000 nodes | 0.9757 | ms |
| 5 | next-app-router | app streaming first byte 1000 nodes | 1.7039 | ms |
| 6 | solid-start | app streaming first byte 1000 nodes | 1.7618 | ms |
| 7 | tanstack-start | app streaming first byte 1000 nodes | 51.3584 | ms |
| 8 | qwik-router-v2 | app streaming first byte 1000 nodes | 51.9156 | ms |

### app streaming first chunk 1000 nodes

Measures elapsed time until the first response body chunk arrives for the real streaming route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app streaming first chunk 1000 nodes | 0.6003 | ms |
| 2 | mreact-app-router | app streaming first chunk 1000 nodes | 0.6569 | ms |
| 3 | mreact-app-router+log enabled | app streaming first chunk 1000 nodes | 0.9009 | ms |
| 4 | qwik-city | app streaming first chunk 1000 nodes | 0.9095 | ms |
| 5 | solid-start | app streaming first chunk 1000 nodes | 1.7942 | ms |
| 6 | next-app-router | app streaming first chunk 1000 nodes | 1.9113 | ms |
| 7 | tanstack-start | app streaming first chunk 1000 nodes | 51.4065 | ms |
| 8 | qwik-router-v2 | app streaming first chunk 1000 nodes | 51.8769 | ms |

### app streaming full body 1000 nodes

Measures elapsed time until the complete real streaming response body is consumed and validated.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app streaming full body 1000 nodes | 50.7637 | ms |
| 2 | mreact-app-router | app streaming full body 1000 nodes | 50.9392 | ms |
| 3 | tanstack-start | app streaming full body 1000 nodes | 51.1094 | ms |
| 4 | solid-start | app streaming full body 1000 nodes | 51.1339 | ms |
| 5 | mreact-app-router+log enabled | app streaming full body 1000 nodes | 51.1754 | ms |
| 6 | qwik-city | app streaming full body 1000 nodes | 51.8371 | ms |
| 7 | qwik-router-v2 | app streaming full body 1000 nodes | 51.8563 | ms |
| 8 | next-app-router | app streaming full body 1000 nodes | 54.562 | ms |

### app real streaming 1000 nodes (async 50ms)

Streams a route whose body waits on a 50 ms async boundary before the full 1,000-node response completes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 2 | marko-run | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 3 | mreact-app-router+log enabled | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 4 | solid-start | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 5 | tanstack-start | app real streaming 1000 nodes (async 50ms) | 19 | ops/sec |
| 6 | qwik-city | app real streaming 1000 nodes (async 50ms) | 19 | ops/sec |
| 7 | qwik-router-v2 | app real streaming 1000 nodes (async 50ms) | 19 | ops/sec |
| 8 | next-app-router | app real streaming 1000 nodes (async 50ms) | 18 | ops/sec |

### app parallel async boundaries 2x50ms

Renders two sibling 50 ms async boundaries and reports whether total response latency stays near one boundary instead of waterfalling.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 2 | mreact-app-router | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 3 | solid-start | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 4 | tanstack-start | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 5 | mreact-app-router+log enabled | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 6 | qwik-city | app parallel async boundaries 2x50ms | 19 | ops/sec |
| 7 | qwik-router-v2 | app parallel async boundaries 2x50ms | 19 | ops/sec |
| 8 | next-app-router | app parallel async boundaries 2x50ms | 19 | ops/sec |

### app dynamic-attr grid 200 cells

Renders 200 cells with many dynamic escaped attributes, inline style values, and text content.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app dynamic-attr grid 200 cells | 3762 | ops/sec |
| 2 | mreact-app-router+log enabled | app dynamic-attr grid 200 cells | 3616 | ops/sec |
| 3 | marko-run | app dynamic-attr grid 200 cells | 2002 | ops/sec |
| 4 | tanstack-start | app dynamic-attr grid 200 cells | 1307 | ops/sec |
| 5 | qwik-city | app dynamic-attr grid 200 cells | 923 | ops/sec |
| 6 | solid-start | app dynamic-attr grid 200 cells | 711 | ops/sec |
| 7 | qwik-router-v2 | app dynamic-attr grid 200 cells | 670 | ops/sec |
| 8 | next-app-router | app dynamic-attr grid 200 cells | 245 | ops/sec |

### app dynamic route params data

Renders a dynamic route that combines route parameters with server data before producing HTML.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app dynamic route params data | 3818 | ops/sec |
| 2 | mreact-app-router+log enabled | app dynamic route params data | 3501 | ops/sec |
| 3 | marko-run | app dynamic route params data | 1979 | ops/sec |
| 4 | tanstack-start | app dynamic route params data | 992 | ops/sec |
| 5 | qwik-city | app dynamic route params data | 935 | ops/sec |
| 6 | solid-start | app dynamic route params data | 719 | ops/sec |
| 7 | qwik-router-v2 | app dynamic route params data | 708 | ops/sec |
| 8 | next-app-router | app dynamic route params data | 247 | ops/sec |

### app client navigation route-to-route

Measures route-to-route client navigation latency in a real browser when the adapter provides a browser probe.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | solid-start | app client navigation route-to-route | 54.1 | ms |
| 2 | mreact-app-router+log enabled | app client navigation route-to-route | 54.2 | ms |
| 3 | mreact-app-router | app client navigation route-to-route | 54.3 | ms |
| 4 | tanstack-start | app client navigation route-to-route | 55 | ms |
| 5 | next-app-router | app client navigation route-to-route | 55.6 | ms |
| 6 | qwik-city | app client navigation route-to-route | 100.2 | ms |
| 7 | qwik-router-v2 | app client navigation route-to-route | 101.5 | ms |

### app hydration first interaction

Measures time for the first client interaction to update visible UI after loading an interactive route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app hydration first interaction | 20.8 | ms |
| 2 | marko-run | app hydration first interaction | 24.9 | ms |
| 3 | solid-start | app hydration first interaction | 24.9 | ms |
| 4 | tanstack-start | app hydration first interaction | 25 | ms |
| 5 | mreact-app-router+log enabled | app hydration first interaction | 26.3 | ms |
| 6 | next-app-router | app hydration first interaction | 31.8 | ms |
| 7 | qwik-city | app hydration first interaction | 44.4 | ms |
| 8 | qwik-router-v2 | app hydration first interaction | 47.7 | ms |

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
| 4 | solid-start | app client bundle gzip bytes (server-only page) | 28774 | gzip bytes |
| 5 | qwik-city | app client bundle gzip bytes (server-only page) | 47716 | gzip bytes |
| 6 | qwik-router-v2 | app client bundle gzip bytes (server-only page) | 68172 | gzip bytes |
| 7 | tanstack-start | app client bundle gzip bytes (server-only page) | 112814 | gzip bytes |
| 8 | next-app-router | app client bundle gzip bytes (server-only page) | 185522 | gzip bytes |

### app client bundle gzip bytes (interactive page)

Measures gzip-compressed client JavaScript shipped for a minimal button-and-state interactive route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app client bundle gzip bytes (interactive page) | 1872 | gzip bytes |
| 2 | mreact-app-router | app client bundle gzip bytes (interactive page) | 4029 | gzip bytes |
| 3 | mreact-app-router+log enabled | app client bundle gzip bytes (interactive page) | 4029 | gzip bytes |
| 4 | solid-start | app client bundle gzip bytes (interactive page) | 28774 | gzip bytes |
| 5 | qwik-city | app client bundle gzip bytes (interactive page) | 47716 | gzip bytes |
| 6 | qwik-router-v2 | app client bundle gzip bytes (interactive page) | 68172 | gzip bytes |
| 7 | tanstack-start | app client bundle gzip bytes (interactive page) | 112814 | gzip bytes |
| 8 | next-app-router | app client bundle gzip bytes (interactive page) | 185522 | gzip bytes |

### app client bundle gzip bytes (interactive page, minimal opt-out)

Measures the same interactive route while opting out of optional client navigation runtime where the framework supports it.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app client bundle gzip bytes (interactive page, minimal opt-out) | 1872 | gzip bytes |
| 2 | mreact-app-router+log enabled | app client bundle gzip bytes (interactive page, minimal opt-out) | 2902 | gzip bytes |
| 3 | mreact-app-router | app client bundle gzip bytes (interactive page, minimal opt-out) | 2903 | gzip bytes |
| 4 | solid-start | app client bundle gzip bytes (interactive page, minimal opt-out) | 28774 | gzip bytes |
| 5 | qwik-city | app client bundle gzip bytes (interactive page, minimal opt-out) | 47716 | gzip bytes |
| 6 | qwik-router-v2 | app client bundle gzip bytes (interactive page, minimal opt-out) | 68172 | gzip bytes |
| 7 | tanstack-start | app client bundle gzip bytes (interactive page, minimal opt-out) | 112814 | gzip bytes |
| 8 | next-app-router | app client bundle gzip bytes (interactive page, minimal opt-out) | 185522 | gzip bytes |

### app build output gzip bytes

Measures gzip-compressed production build output size when the adapter exposes build artifacts.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
|  | no completed results |  |  |  |

## Results

| suite | framework | version | case | status | metric | unit | value | gzip bytes | hz | mean ms | p75 ms | p99 ms | note |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| router | marko-run | 0.10.0 | app render 1000 nodes | completed | throughput | ops/sec | 3284 | 0 | 3284 | 0.3318 | 0.3204 | 0.8933 |  |
| router | marko-run | 0.10.0 | app streaming 1000 nodes | completed | throughput | ops/sec | 3958 | 0 | 3958 | 0.2759 | 0.2613 | 0.71 |  |
| router | marko-run | 0.10.0 | app dynamic route params data | completed | throughput | ops/sec | 1979 | 0 | 1979 | 0.53 | 0.5234 | 1.2319 |  |
| router | marko-run | 0.10.0 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 50.8314 | 51.192 | 51.3834 |  |
| router | marko-run | 0.10.0 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.8224 | 51.0732 | 53.9314 |  |
| router | marko-run | 0.10.0 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 2002 | 0 | 2002 | 0.5215 | 0.5288 | 1.0216 |  |
| router | marko-run | 0.10.0 | app streaming first byte 1000 nodes | completed | duration | ms | 0.5392 | 0 | 0 | 0.6503 | 0.6259 | 1.3559 |  |
| router | marko-run | 0.10.0 | app streaming first chunk 1000 nodes | completed | duration | ms | 0.6003 | 0 | 0 | 0.6082 | 0.7334 | 0.7586 |  |
| router | marko-run | 0.10.0 | app streaming full body 1000 nodes | completed | duration | ms | 50.7637 | 0 | 0 | 50.6485 | 50.8207 | 50.9059 |  |
| router | marko-run | 0.10.0 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app client navigation route-to-route |
| router | marko-run | 0.10.0 | app hydration first interaction | completed | duration | ms | 24.9 | 0 | 0 | 23.9714 | 28.9 | 31.8 |  |
| router | marko-run | 0.10.0 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app server cold start |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 1872 | 1872 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 1872 | 1872 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 1872 | 1872 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app build output gzip bytes |
| router | qwik-city | 1.19.2 | app render 1000 nodes | completed | throughput | ops/sec | 1405 | 0 | 1405 | 0.7457 | 0.7819 | 1.5076 |  |
| router | qwik-city | 1.19.2 | app streaming 1000 nodes | completed | throughput | ops/sec | 1368 | 0 | 1368 | 0.7559 | 0.7464 | 1.3323 |  |
| router | qwik-city | 1.19.2 | app dynamic route params data | completed | throughput | ops/sec | 935 | 0 | 935 | 1.1065 | 1.0559 | 2.2591 |  |
| router | qwik-city | 1.19.2 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 19 | 0 | 19 | 52.1431 | 52.7459 | 53.4431 |  |
| router | qwik-city | 1.19.2 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 19 | 0 | 19 | 51.321 | 51.5151 | 51.8595 |  |
| router | qwik-city | 1.19.2 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 923 | 0 | 923 | 1.1228 | 1.1266 | 2.1397 |  |
| router | qwik-city | 1.19.2 | app streaming first byte 1000 nodes | completed | duration | ms | 0.9757 | 0 | 0 | 1.7315 | 1.1095 | 6.6632 |  |
| router | qwik-city | 1.19.2 | app streaming first chunk 1000 nodes | completed | duration | ms | 0.9095 | 0 | 0 | 0.9068 | 0.9194 | 0.9563 |  |
| router | qwik-city | 1.19.2 | app streaming full body 1000 nodes | completed | duration | ms | 51.8371 | 0 | 0 | 51.7721 | 51.9137 | 52.0499 |  |
| router | qwik-city | 1.19.2 | app client navigation route-to-route | completed | duration | ms | 100.2 | 0 | 0 | 100.0571 | 100.7 | 101 |  |
| router | qwik-city | 1.19.2 | app hydration first interaction | completed | duration | ms | 44.4 | 0 | 0 | 45.0857 | 48.8 | 54.5 |  |
| router | qwik-city | 1.19.2 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app server cold start |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app build output gzip bytes |
| router | qwik-router-v2 | 2.0.0-beta.35 | app render 1000 nodes | completed | throughput | ops/sec | 1108 | 0 | 1108 | 1.0338 | 0.9316 | 3.715 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app streaming 1000 nodes | completed | throughput | ops/sec | 1027 | 0 | 1027 | 1.1147 | 0.9944 | 3.7106 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app dynamic route params data | completed | throughput | ops/sec | 708 | 0 | 708 | 1.5815 | 1.4094 | 4.6153 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 19 | 0 | 19 | 52.3716 | 52.3689 | 54.4821 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 19 | 0 | 19 | 51.554 | 51.7407 | 53.1585 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 670 | 0 | 670 | 1.6405 | 1.4675 | 4.4119 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app streaming first byte 1000 nodes | completed | duration | ms | 51.9156 | 0 | 0 | 51.8914 | 52.0372 | 52.1378 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app streaming first chunk 1000 nodes | completed | duration | ms | 51.8769 | 0 | 0 | 52.2571 | 52.0849 | 54.6561 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app streaming full body 1000 nodes | completed | duration | ms | 51.8563 | 0 | 0 | 52.0934 | 52.1255 | 53.5326 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app client navigation route-to-route | completed | duration | ms | 101.5 | 0 | 0 | 101.5571 | 103.7 | 105.3 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app hydration first interaction | completed | duration | ms | 47.7 | 0 | 0 | 45.8857 | 48.7 | 50.7 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | qwik-router-v2 does not implement app server cold start |
| router | qwik-router-v2 | 2.0.0-beta.35 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 68172 | 68172 | 0 | 0 | 0 | 0 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 68172 | 68172 | 0 | 0 | 0 | 0 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 68172 | 68172 | 0 | 0 | 0 | 0 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | qwik-router-v2 does not implement app build output gzip bytes |
| router | solid-start | 1.3.2 | app render 1000 nodes | completed | throughput | ops/sec | 626 | 0 | 626 | 1.8071 | 1.7131 | 8.1586 |  |
| router | solid-start | 1.3.2 | app streaming 1000 nodes | completed | throughput | ops/sec | 704 | 0 | 704 | 1.6453 | 1.6675 | 5.9196 |  |
| router | solid-start | 1.3.2 | app dynamic route params data | completed | throughput | ops/sec | 719 | 0 | 719 | 1.5116 | 1.5585 | 3.2166 |  |
| router | solid-start | 1.3.2 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 51.2611 | 51.5395 | 52.2982 |  |
| router | solid-start | 1.3.2 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.8988 | 51.0768 | 52.1992 |  |
| router | solid-start | 1.3.2 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 711 | 0 | 711 | 1.5049 | 1.5572 | 2.9147 |  |
| router | solid-start | 1.3.2 | app streaming first byte 1000 nodes | completed | duration | ms | 1.7618 | 0 | 0 | 1.7724 | 1.8491 | 1.8657 |  |
| router | solid-start | 1.3.2 | app streaming first chunk 1000 nodes | completed | duration | ms | 1.7942 | 0 | 0 | 1.8195 | 1.8837 | 3.249 |  |
| router | solid-start | 1.3.2 | app streaming full body 1000 nodes | completed | duration | ms | 51.1339 | 0 | 0 | 50.9189 | 51.2987 | 51.4258 |  |
| router | solid-start | 1.3.2 | app client navigation route-to-route | completed | duration | ms | 54.1 | 0 | 0 | 54.1286 | 54.9 | 55.4 |  |
| router | solid-start | 1.3.2 | app hydration first interaction | completed | duration | ms | 24.9 | 0 | 0 | 23.0571 | 26.5 | 27.1 |  |
| router | solid-start | 1.3.2 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app server cold start |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 28774 | 28774 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 28774 | 28774 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 28774 | 28774 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app build output gzip bytes |
| router | tanstack-start | 1.167.65 | app render 1000 nodes | completed | throughput | ops/sec | 2107 | 0 | 2107 | 0.505 | 0.5047 | 1.5635 |  |
| router | tanstack-start | 1.167.65 | app streaming 1000 nodes | completed | throughput | ops/sec | 1910 | 0 | 1910 | 0.5652 | 0.6042 | 1.8758 |  |
| router | tanstack-start | 1.167.65 | app dynamic route params data | completed | throughput | ops/sec | 992 | 0 | 992 | 1.0608 | 1.133 | 2.5609 |  |
| router | tanstack-start | 1.167.65 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 19 | 0 | 19 | 51.5652 | 51.764 | 52.4854 |  |
| router | tanstack-start | 1.167.65 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.9693 | 51.1477 | 51.6025 |  |
| router | tanstack-start | 1.167.65 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 1307 | 0 | 1307 | 0.7946 | 0.7798 | 1.7693 |  |
| router | tanstack-start | 1.167.65 | app streaming first byte 1000 nodes | completed | duration | ms | 51.3584 | 0 | 0 | 51.3168 | 51.4085 | 51.4842 |  |
| router | tanstack-start | 1.167.65 | app streaming first chunk 1000 nodes | completed | duration | ms | 51.4065 | 0 | 0 | 51.3958 | 51.5665 | 51.6152 |  |
| router | tanstack-start | 1.167.65 | app streaming full body 1000 nodes | completed | duration | ms | 51.1094 | 0 | 0 | 51.0368 | 51.3003 | 51.4374 |  |
| router | tanstack-start | 1.167.65 | app client navigation route-to-route | completed | duration | ms | 55 | 0 | 0 | 54.8 | 55 | 55.3 |  |
| router | tanstack-start | 1.167.65 | app hydration first interaction | completed | duration | ms | 25 | 0 | 0 | 24.5714 | 29.8 | 32.9 |  |
| router | tanstack-start | 1.167.65 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app server cold start |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app build output gzip bytes |
| router | next-app-router | 16.2.6 | app render 1000 nodes | completed | throughput | ops/sec | 170 | 0 | 170 | 6.2383 | 5.8984 | 13.892 |  |
| router | next-app-router | 16.2.6 | app streaming 1000 nodes | completed | throughput | ops/sec | 178 | 0 | 178 | 5.9926 | 5.9665 | 13.1992 |  |
| router | next-app-router | 16.2.6 | app dynamic route params data | completed | throughput | ops/sec | 247 | 0 | 247 | 4.3039 | 4.0481 | 10.0247 |  |
| router | next-app-router | 16.2.6 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 18 | 0 | 18 | 55.158 | 55.4025 | 60.6406 |  |
| router | next-app-router | 16.2.6 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 19 | 0 | 19 | 52.1616 | 52.4269 | 57.3573 |  |
| router | next-app-router | 16.2.6 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 245 | 0 | 245 | 4.3023 | 4.1007 | 9.5065 |  |
| router | next-app-router | 16.2.6 | app streaming first byte 1000 nodes | completed | duration | ms | 1.7039 | 0 | 0 | 1.7266 | 1.8201 | 2.1224 |  |
| router | next-app-router | 16.2.6 | app streaming first chunk 1000 nodes | completed | duration | ms | 1.9113 | 0 | 0 | 1.9312 | 2.0296 | 2.1594 |  |
| router | next-app-router | 16.2.6 | app streaming full body 1000 nodes | completed | duration | ms | 54.562 | 0 | 0 | 54.7419 | 54.742 | 55.7882 |  |
| router | next-app-router | 16.2.6 | app client navigation route-to-route | completed | duration | ms | 55.6 | 0 | 0 | 55.7143 | 56.4 | 56.6 |  |
| router | next-app-router | 16.2.6 | app hydration first interaction | completed | duration | ms | 31.8 | 0 | 0 | 29.3286 | 32.6 | 34.1 |  |
| router | next-app-router | 16.2.6 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app server cold start |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 185522 | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 185522 | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 185522 | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app build output gzip bytes |
| router | mreact-app-router | workspace | app render 1000 nodes | completed | throughput | ops/sec | 5697 | 0 | 5697 | 0.193 | 0.1824 | 0.653 |  |
| router | mreact-app-router | workspace | app streaming 1000 nodes | completed | throughput | ops/sec | 3927 | 0 | 3927 | 0.2711 | 0.2592 | 0.9174 |  |
| router | mreact-app-router | workspace | app dynamic route params data | completed | throughput | ops/sec | 3818 | 0 | 3818 | 0.288 | 0.2602 | 1.2885 |  |
| router | mreact-app-router | workspace | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 50.7966 | 51.0451 | 51.5364 |  |
| router | mreact-app-router | workspace | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.8449 | 51.0877 | 53.3246 |  |
| router | mreact-app-router | workspace | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 3762 | 0 | 3762 | 0.2924 | 0.2633 | 1.3048 |  |
| router | mreact-app-router | workspace | app streaming first byte 1000 nodes | completed | duration | ms | 0.6294 | 0 | 0 | 0.6263 | 0.7273 | 0.8116 |  |
| router | mreact-app-router | workspace | app streaming first chunk 1000 nodes | completed | duration | ms | 0.6569 | 0 | 0 | 0.6415 | 0.712 | 0.7644 |  |
| router | mreact-app-router | workspace | app streaming full body 1000 nodes | completed | duration | ms | 50.9392 | 0 | 0 | 50.9603 | 51.0149 | 51.1412 |  |
| router | mreact-app-router | workspace | app client navigation route-to-route | completed | duration | ms | 54.3 | 0 | 0 | 54.7286 | 54.5 | 60.7 |  |
| router | mreact-app-router | workspace | app hydration first interaction | completed | duration | ms | 20.8 | 0 | 0 | 23.0571 | 32.6 | 33 |  |
| router | mreact-app-router | workspace | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app server cold start |
| router | mreact-app-router | workspace | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 4029 | 4029 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 2903 | 2903 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app build output gzip bytes |
| router | mreact-app-router+log enabled | workspace | app render 1000 nodes | completed | throughput | ops/sec | 6281 | 0 | 6281 | 0.1773 | 0.16 | 0.6296 |  |
| router | mreact-app-router+log enabled | workspace | app streaming 1000 nodes | completed | throughput | ops/sec | 3884 | 0 | 3884 | 0.276 | 0.2581 | 1.1876 |  |
| router | mreact-app-router+log enabled | workspace | app dynamic route params data | completed | throughput | ops/sec | 3501 | 0 | 3501 | 0.3174 | 0.2844 | 1.3911 |  |
| router | mreact-app-router+log enabled | workspace | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 51.0922 | 51.296 | 54.2898 |  |
| router | mreact-app-router+log enabled | workspace | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 51.0309 | 51.2168 | 51.4068 |  |
| router | mreact-app-router+log enabled | workspace | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 3616 | 0 | 3616 | 0.3058 | 0.2734 | 1.3968 |  |
| router | mreact-app-router+log enabled | workspace | app streaming first byte 1000 nodes | completed | duration | ms | 0.615 | 0 | 0 | 0.6459 | 0.7652 | 0.8127 |  |
| router | mreact-app-router+log enabled | workspace | app streaming first chunk 1000 nodes | completed | duration | ms | 0.9009 | 0 | 0 | 0.8356 | 0.9497 | 0.9882 |  |
| router | mreact-app-router+log enabled | workspace | app streaming full body 1000 nodes | completed | duration | ms | 51.1754 | 0 | 0 | 51.1496 | 51.374 | 51.5159 |  |
| router | mreact-app-router+log enabled | workspace | app client navigation route-to-route | completed | duration | ms | 54.2 | 0 | 0 | 54.1429 | 54.4 | 54.9 |  |
| router | mreact-app-router+log enabled | workspace | app hydration first interaction | completed | duration | ms | 26.3 | 0 | 0 | 25.8286 | 28.4 | 30.1 |  |
| router | mreact-app-router+log enabled | workspace | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router+log enabled does not implement app server cold start |
| router | mreact-app-router+log enabled | workspace | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router+log enabled | workspace | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 4029 | 4029 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router+log enabled | workspace | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 2902 | 2902 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router+log enabled | workspace | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router+log enabled does not implement app build output gzip bytes |
