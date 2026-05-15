# Router Benchmark

## Environment

- Date: 2026-05-15
- Git commit: aed194437dd84f6fb935bfe104a1a04aee1f5868
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
| 1 | mreact-app-router | app render 1000 nodes | 5999 | ops/sec |
| 2 | marko-run | app render 1000 nodes | 3257 | ops/sec |
| 3 | tanstack-start | app render 1000 nodes | 2247 | ops/sec |
| 4 | qwik-city | app render 1000 nodes | 1464 | ops/sec |
| 5 | solid-start | app render 1000 nodes | 708 | ops/sec |
| 6 | next-app-router | app render 1000 nodes | 197 | ops/sec |

### app streaming 1000 nodes

Streams a production app route with 1,000 simple text spans and validates the complete response body.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app streaming 1000 nodes | 3992 | ops/sec |
| 2 | marko-run | app streaming 1000 nodes | 3990 | ops/sec |
| 3 | tanstack-start | app streaming 1000 nodes | 2304 | ops/sec |
| 4 | qwik-city | app streaming 1000 nodes | 1404 | ops/sec |
| 5 | solid-start | app streaming 1000 nodes | 732 | ops/sec |
| 6 | next-app-router | app streaming 1000 nodes | 199 | ops/sec |

### app streaming first byte 1000 nodes

Measures elapsed time until fetch resolves response headers for the real streaming route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app streaming first byte 1000 nodes | 0.3636 | ms |
| 2 | qwik-city | app streaming first byte 1000 nodes | 0.4386 | ms |
| 3 | marko-run | app streaming first byte 1000 nodes | 0.4687 | ms |
| 4 | next-app-router | app streaming first byte 1000 nodes | 1.5456 | ms |
| 5 | solid-start | app streaming first byte 1000 nodes | 1.6003 | ms |
| 6 | tanstack-start | app streaming first byte 1000 nodes | 50.8952 | ms |

### app streaming first chunk 1000 nodes

Measures elapsed time until the first response body chunk arrives for the real streaming route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app streaming first chunk 1000 nodes | 0.3496 | ms |
| 2 | marko-run | app streaming first chunk 1000 nodes | 0.4927 | ms |
| 3 | qwik-city | app streaming first chunk 1000 nodes | 0.5703 | ms |
| 4 | solid-start | app streaming first chunk 1000 nodes | 1.5423 | ms |
| 5 | next-app-router | app streaming first chunk 1000 nodes | 1.7669 | ms |
| 6 | tanstack-start | app streaming first chunk 1000 nodes | 50.8424 | ms |

### app streaming full body 1000 nodes

Measures elapsed time until the complete real streaming response body is consumed and validated.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app streaming full body 1000 nodes | 50.5812 | ms |
| 2 | marko-run | app streaming full body 1000 nodes | 50.6905 | ms |
| 3 | tanstack-start | app streaming full body 1000 nodes | 50.9051 | ms |
| 4 | solid-start | app streaming full body 1000 nodes | 51.0383 | ms |
| 5 | qwik-city | app streaming full body 1000 nodes | 51.2174 | ms |
| 6 | next-app-router | app streaming full body 1000 nodes | 54.4463 | ms |

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
| 1 | marko-run | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 2 | solid-start | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 3 | mreact-app-router | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 4 | qwik-city | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 5 | tanstack-start | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 6 | next-app-router | app parallel async boundaries 2x50ms | 19 | ops/sec |

### app dynamic-attr grid 200 cells

Renders 200 cells with many dynamic escaped attributes, inline style values, and text content.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app dynamic-attr grid 200 cells | 3682 | ops/sec |
| 2 | marko-run | app dynamic-attr grid 200 cells | 2090 | ops/sec |
| 3 | tanstack-start | app dynamic-attr grid 200 cells | 1330 | ops/sec |
| 4 | qwik-city | app dynamic-attr grid 200 cells | 1032 | ops/sec |
| 5 | solid-start | app dynamic-attr grid 200 cells | 738 | ops/sec |
| 6 | next-app-router | app dynamic-attr grid 200 cells | 272 | ops/sec |

### app dynamic route params data

Renders a dynamic route that combines route parameters with server data before producing HTML.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app dynamic route params data | 3817 | ops/sec |
| 2 | marko-run | app dynamic route params data | 2141 | ops/sec |
| 3 | tanstack-start | app dynamic route params data | 1269 | ops/sec |
| 4 | qwik-city | app dynamic route params data | 983 | ops/sec |
| 5 | solid-start | app dynamic route params data | 755 | ops/sec |
| 6 | next-app-router | app dynamic route params data | 264 | ops/sec |

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
| 3 | solid-start | app client bundle gzip bytes (server-only page) | 28773 | gzip bytes |
| 4 | qwik-city | app client bundle gzip bytes (server-only page) | 47716 | gzip bytes |
| 5 | tanstack-start | app client bundle gzip bytes (server-only page) | 112814 | gzip bytes |
| 6 | next-app-router | app client bundle gzip bytes (server-only page) | 185526 | gzip bytes |

### app client bundle gzip bytes (interactive page)

Measures gzip-compressed client JavaScript shipped for a minimal button-and-state interactive route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app client bundle gzip bytes (interactive page) | 1874 | gzip bytes |
| 2 | mreact-app-router | app client bundle gzip bytes (interactive page) | 3990 | gzip bytes |
| 3 | solid-start | app client bundle gzip bytes (interactive page) | 28773 | gzip bytes |
| 4 | qwik-city | app client bundle gzip bytes (interactive page) | 47716 | gzip bytes |
| 5 | tanstack-start | app client bundle gzip bytes (interactive page) | 112814 | gzip bytes |
| 6 | next-app-router | app client bundle gzip bytes (interactive page) | 185526 | gzip bytes |

### app client bundle gzip bytes (interactive page, minimal opt-out)

Measures the same interactive route while opting out of optional client navigation runtime where the framework supports it.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app client bundle gzip bytes (interactive page, minimal opt-out) | 1874 | gzip bytes |
| 2 | mreact-app-router | app client bundle gzip bytes (interactive page, minimal opt-out) | 2872 | gzip bytes |
| 3 | solid-start | app client bundle gzip bytes (interactive page, minimal opt-out) | 28773 | gzip bytes |
| 4 | qwik-city | app client bundle gzip bytes (interactive page, minimal opt-out) | 47716 | gzip bytes |
| 5 | tanstack-start | app client bundle gzip bytes (interactive page, minimal opt-out) | 112814 | gzip bytes |
| 6 | next-app-router | app client bundle gzip bytes (interactive page, minimal opt-out) | 185526 | gzip bytes |

### app build output gzip bytes

Measures gzip-compressed production build output size when the adapter exposes build artifacts.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
|  | no completed results |  |  |  |

## Results

| suite | framework | version | case | status | metric | unit | value | gzip bytes | hz | mean ms | p75 ms | p99 ms | note |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| router | marko-run | 0.10.0 | app render 1000 nodes | completed | throughput | ops/sec | 3257 | 0 | 3257 | 0.3296 | 0.327 | 1.0952 |  |
| router | marko-run | 0.10.0 | app streaming 1000 nodes | completed | throughput | ops/sec | 3990 | 0 | 3990 | 0.2706 | 0.2619 | 0.5887 |  |
| router | marko-run | 0.10.0 | app dynamic route params data | completed | throughput | ops/sec | 2141 | 0 | 2141 | 0.4775 | 0.4734 | 1.0457 |  |
| router | marko-run | 0.10.0 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 50.6305 | 50.8816 | 51.4804 |  |
| router | marko-run | 0.10.0 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.564 | 50.7704 | 51.2519 |  |
| router | marko-run | 0.10.0 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 2090 | 0 | 2090 | 0.5016 | 0.4843 | 1.3565 |  |
| router | marko-run | 0.10.0 | app streaming first byte 1000 nodes | completed | duration | ms | 0.4687 | 0 | 0 | 0.4899 | 0.599 | 0.6965 |  |
| router | marko-run | 0.10.0 | app streaming first chunk 1000 nodes | completed | duration | ms | 0.4927 | 0 | 0 | 0.4679 | 0.5091 | 0.5338 |  |
| router | marko-run | 0.10.0 | app streaming full body 1000 nodes | completed | duration | ms | 50.6905 | 0 | 0 | 50.3695 | 50.7766 | 50.7846 |  |
| router | marko-run | 0.10.0 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app client navigation route-to-route |
| router | marko-run | 0.10.0 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app hydration first interaction |
| router | marko-run | 0.10.0 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app server cold start |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 1874 | 1874 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 1874 | 1874 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 1874 | 1874 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app build output gzip bytes |
| router | qwik-city | 1.19.2 | app render 1000 nodes | completed | throughput | ops/sec | 1464 | 0 | 1464 | 0.7142 | 0.7352 | 1.5628 |  |
| router | qwik-city | 1.19.2 | app streaming 1000 nodes | completed | throughput | ops/sec | 1404 | 0 | 1404 | 0.74 | 0.7192 | 1.5807 |  |
| router | qwik-city | 1.19.2 | app dynamic route params data | completed | throughput | ops/sec | 983 | 0 | 983 | 1.0426 | 1.0184 | 1.9409 |  |
| router | qwik-city | 1.19.2 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 19 | 0 | 19 | 51.3753 | 51.5013 | 51.9525 |  |
| router | qwik-city | 1.19.2 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.8614 | 51.0205 | 51.6752 |  |
| router | qwik-city | 1.19.2 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 1032 | 0 | 1032 | 0.9948 | 0.9732 | 1.87 |  |
| router | qwik-city | 1.19.2 | app streaming first byte 1000 nodes | completed | duration | ms | 0.4386 | 0 | 0 | 0.5758 | 0.7955 | 0.7974 |  |
| router | qwik-city | 1.19.2 | app streaming first chunk 1000 nodes | completed | duration | ms | 0.5703 | 0 | 0 | 0.5556 | 0.5861 | 0.6058 |  |
| router | qwik-city | 1.19.2 | app streaming full body 1000 nodes | completed | duration | ms | 51.2174 | 0 | 0 | 51.2395 | 51.4372 | 51.6877 |  |
| router | qwik-city | 1.19.2 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app client navigation route-to-route |
| router | qwik-city | 1.19.2 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app hydration first interaction |
| router | qwik-city | 1.19.2 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app server cold start |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app build output gzip bytes |
| router | solid-start | 1.3.2 | app render 1000 nodes | completed | throughput | ops/sec | 708 | 0 | 708 | 1.6498 | 1.6273 | 7.3569 |  |
| router | solid-start | 1.3.2 | app streaming 1000 nodes | completed | throughput | ops/sec | 732 | 0 | 732 | 1.5853 | 1.6142 | 6.1704 |  |
| router | solid-start | 1.3.2 | app dynamic route params data | completed | throughput | ops/sec | 755 | 0 | 755 | 1.4452 | 1.4884 | 2.4751 |  |
| router | solid-start | 1.3.2 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 51.0327 | 51.1171 | 52.4769 |  |
| router | solid-start | 1.3.2 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.6843 | 50.8789 | 51.4271 |  |
| router | solid-start | 1.3.2 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 738 | 0 | 738 | 1.4465 | 1.4737 | 2.3701 |  |
| router | solid-start | 1.3.2 | app streaming first byte 1000 nodes | completed | duration | ms | 1.6003 | 0 | 0 | 1.607 | 1.6679 | 1.81 |  |
| router | solid-start | 1.3.2 | app streaming first chunk 1000 nodes | completed | duration | ms | 1.5423 | 0 | 0 | 1.6173 | 1.7752 | 1.9449 |  |
| router | solid-start | 1.3.2 | app streaming full body 1000 nodes | completed | duration | ms | 51.0383 | 0 | 0 | 51.0953 | 51.1907 | 51.2022 |  |
| router | solid-start | 1.3.2 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app client navigation route-to-route |
| router | solid-start | 1.3.2 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app hydration first interaction |
| router | solid-start | 1.3.2 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app server cold start |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 28773 | 28773 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 28773 | 28773 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 28773 | 28773 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app build output gzip bytes |
| router | tanstack-start | 1.167.65 | app render 1000 nodes | completed | throughput | ops/sec | 2247 | 0 | 2247 | 0.4753 | 0.4481 | 1.6233 |  |
| router | tanstack-start | 1.167.65 | app streaming 1000 nodes | completed | throughput | ops/sec | 2304 | 0 | 2304 | 0.4578 | 0.4382 | 1.6451 |  |
| router | tanstack-start | 1.167.65 | app dynamic route params data | completed | throughput | ops/sec | 1269 | 0 | 1269 | 0.8112 | 0.7836 | 1.8463 |  |
| router | tanstack-start | 1.167.65 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 51.1776 | 51.4237 | 51.8397 |  |
| router | tanstack-start | 1.167.65 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 51.0898 | 51.2191 | 51.5209 |  |
| router | tanstack-start | 1.167.65 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 1330 | 0 | 1330 | 0.7733 | 0.7614 | 1.6985 |  |
| router | tanstack-start | 1.167.65 | app streaming first byte 1000 nodes | completed | duration | ms | 50.8952 | 0 | 0 | 50.9788 | 51.0098 | 51.4682 |  |
| router | tanstack-start | 1.167.65 | app streaming first chunk 1000 nodes | completed | duration | ms | 50.8424 | 0 | 0 | 50.8748 | 50.8963 | 51.1584 |  |
| router | tanstack-start | 1.167.65 | app streaming full body 1000 nodes | completed | duration | ms | 50.9051 | 0 | 0 | 50.8996 | 50.9353 | 50.9845 |  |
| router | tanstack-start | 1.167.65 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app client navigation route-to-route |
| router | tanstack-start | 1.167.65 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app hydration first interaction |
| router | tanstack-start | 1.167.65 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app server cold start |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app build output gzip bytes |
| router | next-app-router | 16.2.6 | app render 1000 nodes | completed | throughput | ops/sec | 197 | 0 | 197 | 5.0972 | 5.0923 | 6.7055 |  |
| router | next-app-router | 16.2.6 | app streaming 1000 nodes | completed | throughput | ops/sec | 199 | 0 | 199 | 5.0963 | 4.9925 | 7.9255 |  |
| router | next-app-router | 16.2.6 | app dynamic route params data | completed | throughput | ops/sec | 264 | 0 | 264 | 3.8572 | 3.7709 | 5.9824 |  |
| router | next-app-router | 16.2.6 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 18 | 0 | 18 | 54.4584 | 54.4724 | 57.5402 |  |
| router | next-app-router | 16.2.6 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 19 | 0 | 19 | 51.3092 | 51.4517 | 52.6992 |  |
| router | next-app-router | 16.2.6 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 272 | 0 | 272 | 3.7358 | 3.6916 | 5.9659 |  |
| router | next-app-router | 16.2.6 | app streaming first byte 1000 nodes | completed | duration | ms | 1.5456 | 0 | 0 | 1.725 | 1.8819 | 2.762 |  |
| router | next-app-router | 16.2.6 | app streaming first chunk 1000 nodes | completed | duration | ms | 1.7669 | 0 | 0 | 1.8036 | 1.8938 | 2.1328 |  |
| router | next-app-router | 16.2.6 | app streaming full body 1000 nodes | completed | duration | ms | 54.4463 | 0 | 0 | 54.4221 | 54.5421 | 54.8295 |  |
| router | next-app-router | 16.2.6 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app client navigation route-to-route |
| router | next-app-router | 16.2.6 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app hydration first interaction |
| router | next-app-router | 16.2.6 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app server cold start |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 185526 | 185526 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 185526 | 185526 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 185526 | 185526 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app build output gzip bytes |
| router | mreact-app-router | workspace | app render 1000 nodes | completed | throughput | ops/sec | 5999 | 0 | 5999 | 0.1833 | 0.171 | 0.5351 |  |
| router | mreact-app-router | workspace | app streaming 1000 nodes | completed | throughput | ops/sec | 3992 | 0 | 3992 | 0.2678 | 0.2558 | 0.6975 |  |
| router | mreact-app-router | workspace | app dynamic route params data | completed | throughput | ops/sec | 3817 | 0 | 3817 | 0.2853 | 0.2612 | 1.2955 |  |
| router | mreact-app-router | workspace | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 50.7343 | 50.8955 | 53.0462 |  |
| router | mreact-app-router | workspace | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.7685 | 50.9501 | 52.609 |  |
| router | mreact-app-router | workspace | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 3682 | 0 | 3682 | 0.2924 | 0.2705 | 1.2796 |  |
| router | mreact-app-router | workspace | app streaming first byte 1000 nodes | completed | duration | ms | 0.3636 | 0 | 0 | 0.3784 | 0.3877 | 0.4534 |  |
| router | mreact-app-router | workspace | app streaming first chunk 1000 nodes | completed | duration | ms | 0.3496 | 0 | 0 | 0.3471 | 0.3538 | 0.3694 |  |
| router | mreact-app-router | workspace | app streaming full body 1000 nodes | completed | duration | ms | 50.5812 | 0 | 0 | 50.5848 | 50.6128 | 50.6539 |  |
| router | mreact-app-router | workspace | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app client navigation route-to-route |
| router | mreact-app-router | workspace | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app hydration first interaction |
| router | mreact-app-router | workspace | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app server cold start |
| router | mreact-app-router | workspace | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 3990 | 3990 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 2872 | 2872 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app build output gzip bytes |
