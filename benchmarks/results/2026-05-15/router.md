# Router Benchmark

## Environment

- Date: 2026-05-15
- Git commit: 8b233191adf6d2a0f7956a2127a68bd57c5fd189
- Node: v24.13.0
- NODE_ENV: production
- pnpm: 10.19.0
- Platform: linux x64
- CPU: AMD Ryzen 9 9950X 16-Core Processor (32)
- Memory: 200106930176 bytes
- Package versions:
  - @builder.io/qwik: 1.19.2
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
| 1 | mreact-app-router | app render 1000 nodes | 5767 | ops/sec |
| 2 | marko-run | app render 1000 nodes | 3201 | ops/sec |
| 3 | tanstack-start | app render 1000 nodes | 2158 | ops/sec |
| 4 | qwik-city | app render 1000 nodes | 1421 | ops/sec |
| 5 | solid-start | app render 1000 nodes | 680 | ops/sec |
| 6 | next-app-router | app render 1000 nodes | 197 | ops/sec |

### app streaming 1000 nodes

Streams a production app route with 1,000 simple text spans and validates the complete response body.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app streaming 1000 nodes | 3532 | ops/sec |
| 2 | mreact-app-router | app streaming 1000 nodes | 3530 | ops/sec |
| 3 | tanstack-start | app streaming 1000 nodes | 2241 | ops/sec |
| 4 | qwik-city | app streaming 1000 nodes | 1365 | ops/sec |
| 5 | solid-start | app streaming 1000 nodes | 708 | ops/sec |
| 6 | next-app-router | app streaming 1000 nodes | 200 | ops/sec |

### app streaming first byte 1000 nodes

Measures elapsed time until fetch resolves response headers for the real streaming route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app streaming first byte 1000 nodes | 0.4233 | ms |
| 2 | qwik-city | app streaming first byte 1000 nodes | 0.4275 | ms |
| 3 | mreact-app-router | app streaming first byte 1000 nodes | 0.6135 | ms |
| 4 | solid-start | app streaming first byte 1000 nodes | 1.6106 | ms |
| 5 | next-app-router | app streaming first byte 1000 nodes | 2.0046 | ms |
| 6 | tanstack-start | app streaming first byte 1000 nodes | 50.7445 | ms |

### app streaming first chunk 1000 nodes

Measures elapsed time until the first response body chunk arrives for the real streaming route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | qwik-city | app streaming first chunk 1000 nodes | 0.493 | ms |
| 2 | mreact-app-router | app streaming first chunk 1000 nodes | 0.5688 | ms |
| 3 | marko-run | app streaming first chunk 1000 nodes | 0.5779 | ms |
| 4 | solid-start | app streaming first chunk 1000 nodes | 1.7003 | ms |
| 5 | next-app-router | app streaming first chunk 1000 nodes | 2.2008 | ms |
| 6 | tanstack-start | app streaming first chunk 1000 nodes | 50.7547 | ms |

### app streaming full body 1000 nodes

Measures elapsed time until the complete real streaming response body is consumed and validated.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | tanstack-start | app streaming full body 1000 nodes | 50.8125 | ms |
| 2 | marko-run | app streaming full body 1000 nodes | 51.0179 | ms |
| 3 | mreact-app-router | app streaming full body 1000 nodes | 51.0563 | ms |
| 4 | solid-start | app streaming full body 1000 nodes | 51.2068 | ms |
| 5 | qwik-city | app streaming full body 1000 nodes | 51.2313 | ms |
| 6 | next-app-router | app streaming full body 1000 nodes | 54.9676 | ms |

### app real streaming 1000 nodes (async 50ms)

Streams a route whose body waits on a 50 ms async boundary before the full 1,000-node response completes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 2 | mreact-app-router | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 3 | solid-start | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 4 | tanstack-start | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 5 | qwik-city | app real streaming 1000 nodes (async 50ms) | 19 | ops/sec |
| 6 | next-app-router | app real streaming 1000 nodes (async 50ms) | 18 | ops/sec |

### app parallel async boundaries 2x50ms

Renders two sibling 50 ms async boundaries and reports whether total response latency stays near one boundary instead of waterfalling.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | qwik-city | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 2 | marko-run | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 3 | solid-start | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 4 | mreact-app-router | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 5 | tanstack-start | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 6 | next-app-router | app parallel async boundaries 2x50ms | 19 | ops/sec |

### app dynamic-attr grid 200 cells

Renders 200 cells with many dynamic escaped attributes, inline style values, and text content.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app dynamic-attr grid 200 cells | 3040 | ops/sec |
| 2 | marko-run | app dynamic-attr grid 200 cells | 2066 | ops/sec |
| 3 | tanstack-start | app dynamic-attr grid 200 cells | 1280 | ops/sec |
| 4 | qwik-city | app dynamic-attr grid 200 cells | 982 | ops/sec |
| 5 | solid-start | app dynamic-attr grid 200 cells | 731 | ops/sec |
| 6 | next-app-router | app dynamic-attr grid 200 cells | 274 | ops/sec |

### app dynamic route params data

Renders a dynamic route that combines route parameters with server data before producing HTML.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app dynamic route params data | 2958 | ops/sec |
| 2 | marko-run | app dynamic route params data | 1891 | ops/sec |
| 3 | tanstack-start | app dynamic route params data | 1218 | ops/sec |
| 4 | qwik-city | app dynamic route params data | 957 | ops/sec |
| 5 | solid-start | app dynamic route params data | 744 | ops/sec |
| 6 | next-app-router | app dynamic route params data | 262 | ops/sec |

### app client navigation route-to-route

Measures route-to-route client navigation latency in a real browser when the adapter provides a browser probe.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
|  | no completed results |  |  |  |

### app hydration first interaction

Measures time for the first client interaction to update visible UI after loading an interactive route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
|  | no completed results |  |  |  |

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
| 2 | marko-run | app client bundle gzip bytes (server-only page) | 1874 | gzip bytes |
| 3 | solid-start | app client bundle gzip bytes (server-only page) | 28774 | gzip bytes |
| 4 | qwik-city | app client bundle gzip bytes (server-only page) | 47716 | gzip bytes |
| 5 | tanstack-start | app client bundle gzip bytes (server-only page) | 112814 | gzip bytes |
| 6 | next-app-router | app client bundle gzip bytes (server-only page) | 185522 | gzip bytes |

### app client bundle gzip bytes (interactive page)

Measures gzip-compressed client JavaScript shipped for a minimal button-and-state interactive route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app client bundle gzip bytes (interactive page) | 1874 | gzip bytes |
| 2 | mreact-app-router | app client bundle gzip bytes (interactive page) | 4064 | gzip bytes |
| 3 | solid-start | app client bundle gzip bytes (interactive page) | 28774 | gzip bytes |
| 4 | qwik-city | app client bundle gzip bytes (interactive page) | 47716 | gzip bytes |
| 5 | tanstack-start | app client bundle gzip bytes (interactive page) | 112814 | gzip bytes |
| 6 | next-app-router | app client bundle gzip bytes (interactive page) | 185522 | gzip bytes |

### app client bundle gzip bytes (interactive page, minimal opt-out)

Measures the same interactive route while opting out of optional client navigation runtime where the framework supports it.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app client bundle gzip bytes (interactive page, minimal opt-out) | 1874 | gzip bytes |
| 2 | mreact-app-router | app client bundle gzip bytes (interactive page, minimal opt-out) | 2939 | gzip bytes |
| 3 | solid-start | app client bundle gzip bytes (interactive page, minimal opt-out) | 28774 | gzip bytes |
| 4 | qwik-city | app client bundle gzip bytes (interactive page, minimal opt-out) | 47716 | gzip bytes |
| 5 | tanstack-start | app client bundle gzip bytes (interactive page, minimal opt-out) | 112814 | gzip bytes |
| 6 | next-app-router | app client bundle gzip bytes (interactive page, minimal opt-out) | 185522 | gzip bytes |

### app build output gzip bytes

Measures gzip-compressed production build output size when the adapter exposes build artifacts.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
|  | no completed results |  |  |  |

## Results

| suite | framework | version | case | status | metric | unit | value | gzip bytes | hz | mean ms | p75 ms | p99 ms | note |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| router | marko-run | 0.10.0 | app render 1000 nodes | completed | throughput | ops/sec | 3201 | 0 | 3201 | 0.3353 | 0.3303 | 0.8122 |  |
| router | marko-run | 0.10.0 | app streaming 1000 nodes | completed | throughput | ops/sec | 3532 | 0 | 3532 | 0.3082 | 0.3216 | 0.6067 |  |
| router | marko-run | 0.10.0 | app dynamic route params data | completed | throughput | ops/sec | 1891 | 0 | 1891 | 0.5584 | 0.5948 | 1.4644 |  |
| router | marko-run | 0.10.0 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 50.8399 | 51.1206 | 51.4311 |  |
| router | marko-run | 0.10.0 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.8366 | 51.0957 | 51.898 |  |
| router | marko-run | 0.10.0 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 2066 | 0 | 2066 | 0.5068 | 0.5123 | 1.1811 |  |
| router | marko-run | 0.10.0 | app streaming first byte 1000 nodes | completed | duration | ms | 0.4233 | 0 | 0 | 0.4405 | 0.4994 | 0.5308 |  |
| router | marko-run | 0.10.0 | app streaming first chunk 1000 nodes | completed | duration | ms | 0.5779 | 0 | 0 | 0.5629 | 0.6234 | 0.6241 |  |
| router | marko-run | 0.10.0 | app streaming full body 1000 nodes | completed | duration | ms | 51.0179 | 0 | 0 | 50.9642 | 51.1875 | 51.2459 |  |
| router | marko-run | 0.10.0 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app client navigation route-to-route |
| router | marko-run | 0.10.0 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app hydration first interaction |
| router | marko-run | 0.10.0 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app server cold start |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 1874 | 1874 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 1874 | 1874 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 1874 | 1874 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app build output gzip bytes |
| router | qwik-city | 1.19.2 | app render 1000 nodes | completed | throughput | ops/sec | 1421 | 0 | 1421 | 0.7395 | 0.7532 | 1.5048 |  |
| router | qwik-city | 1.19.2 | app streaming 1000 nodes | completed | throughput | ops/sec | 1365 | 0 | 1365 | 0.7656 | 0.7422 | 1.6236 |  |
| router | qwik-city | 1.19.2 | app dynamic route params data | completed | throughput | ops/sec | 957 | 0 | 957 | 1.0751 | 1.0354 | 2.1028 |  |
| router | qwik-city | 1.19.2 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 19 | 0 | 19 | 51.3154 | 51.3781 | 52.0095 |  |
| router | qwik-city | 1.19.2 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.824 | 50.8568 | 52.9041 |  |
| router | qwik-city | 1.19.2 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 982 | 0 | 982 | 1.0556 | 1.001 | 2.2975 |  |
| router | qwik-city | 1.19.2 | app streaming first byte 1000 nodes | completed | duration | ms | 0.4275 | 0 | 0 | 0.4461 | 0.4909 | 0.4992 |  |
| router | qwik-city | 1.19.2 | app streaming first chunk 1000 nodes | completed | duration | ms | 0.493 | 0 | 0 | 0.5508 | 0.5637 | 0.86 |  |
| router | qwik-city | 1.19.2 | app streaming full body 1000 nodes | completed | duration | ms | 51.2313 | 0 | 0 | 51.0796 | 51.2496 | 51.2917 |  |
| router | qwik-city | 1.19.2 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app client navigation route-to-route |
| router | qwik-city | 1.19.2 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app hydration first interaction |
| router | qwik-city | 1.19.2 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app server cold start |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app build output gzip bytes |
| router | solid-start | 1.3.2 | app render 1000 nodes | completed | throughput | ops/sec | 680 | 0 | 680 | 1.682 | 1.6504 | 7.4903 |  |
| router | solid-start | 1.3.2 | app streaming 1000 nodes | completed | throughput | ops/sec | 708 | 0 | 708 | 1.6205 | 1.6636 | 5.9959 |  |
| router | solid-start | 1.3.2 | app dynamic route params data | completed | throughput | ops/sec | 744 | 0 | 744 | 1.4437 | 1.4829 | 2.3984 |  |
| router | solid-start | 1.3.2 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 51.1079 | 51.3263 | 52.8407 |  |
| router | solid-start | 1.3.2 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.8628 | 51.0184 | 51.2032 |  |
| router | solid-start | 1.3.2 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 731 | 0 | 731 | 1.4513 | 1.477 | 2.4415 |  |
| router | solid-start | 1.3.2 | app streaming first byte 1000 nodes | completed | duration | ms | 1.6106 | 0 | 0 | 1.6693 | 1.8754 | 1.9453 |  |
| router | solid-start | 1.3.2 | app streaming first chunk 1000 nodes | completed | duration | ms | 1.7003 | 0 | 0 | 1.7128 | 1.7264 | 1.9123 |  |
| router | solid-start | 1.3.2 | app streaming full body 1000 nodes | completed | duration | ms | 51.2068 | 0 | 0 | 51.1073 | 51.3027 | 51.4317 |  |
| router | solid-start | 1.3.2 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app client navigation route-to-route |
| router | solid-start | 1.3.2 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app hydration first interaction |
| router | solid-start | 1.3.2 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app server cold start |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 28774 | 28774 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 28774 | 28774 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 28774 | 28774 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app build output gzip bytes |
| router | tanstack-start | 1.167.65 | app render 1000 nodes | completed | throughput | ops/sec | 2158 | 0 | 2158 | 0.4918 | 0.4675 | 1.6533 |  |
| router | tanstack-start | 1.167.65 | app streaming 1000 nodes | completed | throughput | ops/sec | 2241 | 0 | 2241 | 0.4728 | 0.4521 | 1.6034 |  |
| router | tanstack-start | 1.167.65 | app dynamic route params data | completed | throughput | ops/sec | 1218 | 0 | 1218 | 0.8455 | 0.8217 | 1.8197 |  |
| router | tanstack-start | 1.167.65 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 51.1855 | 51.302 | 51.8054 |  |
| router | tanstack-start | 1.167.65 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.9582 | 50.8323 | 56.7679 |  |
| router | tanstack-start | 1.167.65 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 1280 | 0 | 1280 | 0.8119 | 0.7996 | 1.6636 |  |
| router | tanstack-start | 1.167.65 | app streaming first byte 1000 nodes | completed | duration | ms | 50.7445 | 0 | 0 | 50.6087 | 50.7597 | 50.7791 |  |
| router | tanstack-start | 1.167.65 | app streaming first chunk 1000 nodes | completed | duration | ms | 50.7547 | 0 | 0 | 50.7713 | 50.7808 | 50.8788 |  |
| router | tanstack-start | 1.167.65 | app streaming full body 1000 nodes | completed | duration | ms | 50.8125 | 0 | 0 | 50.9989 | 51.3137 | 51.6869 |  |
| router | tanstack-start | 1.167.65 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app client navigation route-to-route |
| router | tanstack-start | 1.167.65 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app hydration first interaction |
| router | tanstack-start | 1.167.65 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app server cold start |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app build output gzip bytes |
| router | next-app-router | 16.2.6 | app render 1000 nodes | completed | throughput | ops/sec | 197 | 0 | 197 | 5.1096 | 5.0975 | 6.8032 |  |
| router | next-app-router | 16.2.6 | app streaming 1000 nodes | completed | throughput | ops/sec | 200 | 0 | 200 | 5.0813 | 4.937 | 8.6705 |  |
| router | next-app-router | 16.2.6 | app dynamic route params data | completed | throughput | ops/sec | 262 | 0 | 262 | 3.8865 | 3.7838 | 5.9324 |  |
| router | next-app-router | 16.2.6 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 18 | 0 | 18 | 55.2164 | 55.3294 | 59.3069 |  |
| router | next-app-router | 16.2.6 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 19 | 0 | 19 | 52.0824 | 52.3492 | 53.4357 |  |
| router | next-app-router | 16.2.6 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 274 | 0 | 274 | 3.7236 | 3.6516 | 5.8404 |  |
| router | next-app-router | 16.2.6 | app streaming first byte 1000 nodes | completed | duration | ms | 2.0046 | 0 | 0 | 2.203 | 2.0947 | 3.5135 |  |
| router | next-app-router | 16.2.6 | app streaming first chunk 1000 nodes | completed | duration | ms | 2.2008 | 0 | 0 | 2.185 | 2.218 | 2.2683 |  |
| router | next-app-router | 16.2.6 | app streaming full body 1000 nodes | completed | duration | ms | 54.9676 | 0 | 0 | 54.87 | 55.1942 | 55.4214 |  |
| router | next-app-router | 16.2.6 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app client navigation route-to-route |
| router | next-app-router | 16.2.6 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app hydration first interaction |
| router | next-app-router | 16.2.6 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app server cold start |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 185522 | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 185522 | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 185522 | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app build output gzip bytes |
| router | mreact-app-router | workspace | app render 1000 nodes | completed | throughput | ops/sec | 5767 | 0 | 5767 | 0.1889 | 0.179 | 0.4995 |  |
| router | mreact-app-router | workspace | app streaming 1000 nodes | completed | throughput | ops/sec | 3530 | 0 | 3530 | 0.2991 | 0.284 | 0.8364 |  |
| router | mreact-app-router | workspace | app dynamic route params data | completed | throughput | ops/sec | 2958 | 0 | 2958 | 0.3606 | 0.3358 | 1.5111 |  |
| router | mreact-app-router | workspace | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 50.8775 | 51.1095 | 52.3346 |  |
| router | mreact-app-router | workspace | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.8974 | 51.2203 | 51.6244 |  |
| router | mreact-app-router | workspace | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 3040 | 0 | 3040 | 0.3509 | 0.329 | 1.4786 |  |
| router | mreact-app-router | workspace | app streaming first byte 1000 nodes | completed | duration | ms | 0.6135 | 0 | 0 | 0.6542 | 0.7948 | 0.8205 |  |
| router | mreact-app-router | workspace | app streaming first chunk 1000 nodes | completed | duration | ms | 0.5688 | 0 | 0 | 0.5688 | 0.6115 | 0.6475 |  |
| router | mreact-app-router | workspace | app streaming full body 1000 nodes | completed | duration | ms | 51.0563 | 0 | 0 | 50.9845 | 51.2211 | 51.4856 |  |
| router | mreact-app-router | workspace | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app client navigation route-to-route |
| router | mreact-app-router | workspace | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app hydration first interaction |
| router | mreact-app-router | workspace | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app server cold start |
| router | mreact-app-router | workspace | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 4064 | 4064 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 2939 | 2939 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app build output gzip bytes |
