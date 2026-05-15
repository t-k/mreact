# Router Benchmark

## Environment

- Date: 2026-05-15
- Git commit: 86b3ea2bb5a5b549b74150baaf4e6846b7d0283c
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
| 1 | mreact-app-router+log enabled | app render 1000 nodes | 6245 | ops/sec |
| 2 | mreact-app-router | app render 1000 nodes | 5489 | ops/sec |
| 3 | marko-run | app render 1000 nodes | 3099 | ops/sec |
| 4 | tanstack-start | app render 1000 nodes | 2020 | ops/sec |
| 5 | qwik-city | app render 1000 nodes | 1406 | ops/sec |
| 6 | solid-start | app render 1000 nodes | 648 | ops/sec |
| 7 | next-app-router | app render 1000 nodes | 173 | ops/sec |

### app streaming 1000 nodes

Streams a production app route with 1,000 simple text spans and validates the complete response body.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app streaming 1000 nodes | 3952 | ops/sec |
| 2 | mreact-app-router+log enabled | app streaming 1000 nodes | 3808 | ops/sec |
| 3 | mreact-app-router | app streaming 1000 nodes | 3557 | ops/sec |
| 4 | tanstack-start | app streaming 1000 nodes | 2245 | ops/sec |
| 5 | qwik-city | app streaming 1000 nodes | 1333 | ops/sec |
| 6 | solid-start | app streaming 1000 nodes | 708 | ops/sec |
| 7 | next-app-router | app streaming 1000 nodes | 180 | ops/sec |

### app streaming first byte 1000 nodes

Measures elapsed time until fetch resolves response headers for the real streaming route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app streaming first byte 1000 nodes | 0.7215 | ms |
| 2 | mreact-app-router | app streaming first byte 1000 nodes | 0.7321 | ms |
| 3 | qwik-city | app streaming first byte 1000 nodes | 0.7927 | ms |
| 4 | mreact-app-router+log enabled | app streaming first byte 1000 nodes | 0.7953 | ms |
| 5 | solid-start | app streaming first byte 1000 nodes | 1.6977 | ms |
| 6 | next-app-router | app streaming first byte 1000 nodes | 1.9499 | ms |
| 7 | tanstack-start | app streaming first byte 1000 nodes | 51.6611 | ms |

### app streaming first chunk 1000 nodes

Measures elapsed time until the first response body chunk arrives for the real streaming route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app streaming first chunk 1000 nodes | 0.7637 | ms |
| 2 | mreact-app-router | app streaming first chunk 1000 nodes | 0.8008 | ms |
| 3 | mreact-app-router+log enabled | app streaming first chunk 1000 nodes | 0.8269 | ms |
| 4 | qwik-city | app streaming first chunk 1000 nodes | 0.8428 | ms |
| 5 | solid-start | app streaming first chunk 1000 nodes | 1.8122 | ms |
| 6 | next-app-router | app streaming first chunk 1000 nodes | 2.0942 | ms |
| 7 | tanstack-start | app streaming first chunk 1000 nodes | 51.6401 | ms |

### app streaming full body 1000 nodes

Measures elapsed time until the complete real streaming response body is consumed and validated.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app streaming full body 1000 nodes | 51.2921 | ms |
| 2 | mreact-app-router+log enabled | app streaming full body 1000 nodes | 51.3392 | ms |
| 3 | solid-start | app streaming full body 1000 nodes | 51.3546 | ms |
| 4 | mreact-app-router | app streaming full body 1000 nodes | 51.4363 | ms |
| 5 | tanstack-start | app streaming full body 1000 nodes | 51.6653 | ms |
| 6 | qwik-city | app streaming full body 1000 nodes | 51.7817 | ms |
| 7 | next-app-router | app streaming full body 1000 nodes | 55.011 | ms |

### app real streaming 1000 nodes (async 50ms)

Streams a route whose body waits on a 50 ms async boundary before the full 1,000-node response completes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 2 | mreact-app-router+log enabled | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 3 | mreact-app-router | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 4 | solid-start | app real streaming 1000 nodes (async 50ms) | 19 | ops/sec |
| 5 | tanstack-start | app real streaming 1000 nodes (async 50ms) | 19 | ops/sec |
| 6 | qwik-city | app real streaming 1000 nodes (async 50ms) | 19 | ops/sec |
| 7 | next-app-router | app real streaming 1000 nodes (async 50ms) | 18 | ops/sec |

### app parallel async boundaries 2x50ms

Renders two sibling 50 ms async boundaries and reports whether total response latency stays near one boundary instead of waterfalling.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | solid-start | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 2 | marko-run | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 3 | mreact-app-router+log enabled | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 4 | tanstack-start | app parallel async boundaries 2x50ms | 19 | ops/sec |
| 5 | qwik-city | app parallel async boundaries 2x50ms | 19 | ops/sec |
| 6 | mreact-app-router | app parallel async boundaries 2x50ms | 19 | ops/sec |
| 7 | next-app-router | app parallel async boundaries 2x50ms | 19 | ops/sec |

### app dynamic-attr grid 200 cells

Renders 200 cells with many dynamic escaped attributes, inline style values, and text content.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router+log enabled | app dynamic-attr grid 200 cells | 3494 | ops/sec |
| 2 | mreact-app-router | app dynamic-attr grid 200 cells | 3270 | ops/sec |
| 3 | marko-run | app dynamic-attr grid 200 cells | 1933 | ops/sec |
| 4 | tanstack-start | app dynamic-attr grid 200 cells | 1224 | ops/sec |
| 5 | qwik-city | app dynamic-attr grid 200 cells | 956 | ops/sec |
| 6 | solid-start | app dynamic-attr grid 200 cells | 708 | ops/sec |
| 7 | next-app-router | app dynamic-attr grid 200 cells | 272 | ops/sec |

### app dynamic route params data

Renders a dynamic route that combines route parameters with server data before producing HTML.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app dynamic route params data | 3548 | ops/sec |
| 2 | mreact-app-router+log enabled | app dynamic route params data | 3425 | ops/sec |
| 3 | marko-run | app dynamic route params data | 2062 | ops/sec |
| 4 | tanstack-start | app dynamic route params data | 1204 | ops/sec |
| 5 | qwik-city | app dynamic route params data | 921 | ops/sec |
| 6 | solid-start | app dynamic route params data | 716 | ops/sec |
| 7 | next-app-router | app dynamic route params data | 250 | ops/sec |

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
| 2 | mreact-app-router+log enabled | app client bundle gzip bytes (server-only page) | 0 | gzip bytes |
| 3 | marko-run | app client bundle gzip bytes (server-only page) | 1874 | gzip bytes |
| 4 | solid-start | app client bundle gzip bytes (server-only page) | 28771 | gzip bytes |
| 5 | qwik-city | app client bundle gzip bytes (server-only page) | 47716 | gzip bytes |
| 6 | tanstack-start | app client bundle gzip bytes (server-only page) | 112814 | gzip bytes |
| 7 | next-app-router | app client bundle gzip bytes (server-only page) | 185524 | gzip bytes |

### app client bundle gzip bytes (interactive page)

Measures gzip-compressed client JavaScript shipped for a minimal button-and-state interactive route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app client bundle gzip bytes (interactive page) | 1874 | gzip bytes |
| 2 | mreact-app-router+log enabled | app client bundle gzip bytes (interactive page) | 4029 | gzip bytes |
| 3 | mreact-app-router | app client bundle gzip bytes (interactive page) | 4031 | gzip bytes |
| 4 | solid-start | app client bundle gzip bytes (interactive page) | 28771 | gzip bytes |
| 5 | qwik-city | app client bundle gzip bytes (interactive page) | 47716 | gzip bytes |
| 6 | tanstack-start | app client bundle gzip bytes (interactive page) | 112814 | gzip bytes |
| 7 | next-app-router | app client bundle gzip bytes (interactive page) | 185524 | gzip bytes |

### app client bundle gzip bytes (interactive page, minimal opt-out)

Measures the same interactive route while opting out of optional client navigation runtime where the framework supports it.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app client bundle gzip bytes (interactive page, minimal opt-out) | 1874 | gzip bytes |
| 2 | mreact-app-router | app client bundle gzip bytes (interactive page, minimal opt-out) | 2904 | gzip bytes |
| 3 | mreact-app-router+log enabled | app client bundle gzip bytes (interactive page, minimal opt-out) | 2904 | gzip bytes |
| 4 | solid-start | app client bundle gzip bytes (interactive page, minimal opt-out) | 28771 | gzip bytes |
| 5 | qwik-city | app client bundle gzip bytes (interactive page, minimal opt-out) | 47716 | gzip bytes |
| 6 | tanstack-start | app client bundle gzip bytes (interactive page, minimal opt-out) | 112814 | gzip bytes |
| 7 | next-app-router | app client bundle gzip bytes (interactive page, minimal opt-out) | 185524 | gzip bytes |

### app build output gzip bytes

Measures gzip-compressed production build output size when the adapter exposes build artifacts.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
|  | no completed results |  |  |  |

## Results

| suite | framework | version | case | status | metric | unit | value | gzip bytes | hz | mean ms | p75 ms | p99 ms | note |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| router | marko-run | 0.10.0 | app render 1000 nodes | completed | throughput | ops/sec | 3099 | 0 | 3099 | 0.355 | 0.359 | 1.0107 |  |
| router | marko-run | 0.10.0 | app streaming 1000 nodes | completed | throughput | ops/sec | 3952 | 0 | 3952 | 0.274 | 0.2662 | 0.6127 |  |
| router | marko-run | 0.10.0 | app dynamic route params data | completed | throughput | ops/sec | 2062 | 0 | 2062 | 0.5045 | 0.5054 | 1.2203 |  |
| router | marko-run | 0.10.0 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 50.8586 | 51.3105 | 51.6534 |  |
| router | marko-run | 0.10.0 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 51.0076 | 51.3489 | 51.7293 |  |
| router | marko-run | 0.10.0 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 1933 | 0 | 1933 | 0.5457 | 0.551 | 1.4595 |  |
| router | marko-run | 0.10.0 | app streaming first byte 1000 nodes | completed | duration | ms | 0.7215 | 0 | 0 | 0.7264 | 0.7555 | 0.7593 |  |
| router | marko-run | 0.10.0 | app streaming first chunk 1000 nodes | completed | duration | ms | 0.7637 | 0 | 0 | 0.7793 | 0.785 | 0.9486 |  |
| router | marko-run | 0.10.0 | app streaming full body 1000 nodes | completed | duration | ms | 51.2921 | 0 | 0 | 50.9962 | 51.3744 | 51.3998 |  |
| router | marko-run | 0.10.0 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app client navigation route-to-route |
| router | marko-run | 0.10.0 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app hydration first interaction |
| router | marko-run | 0.10.0 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app server cold start |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 1874 | 1874 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 1874 | 1874 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 1874 | 1874 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app build output gzip bytes |
| router | qwik-city | 1.19.2 | app render 1000 nodes | completed | throughput | ops/sec | 1406 | 0 | 1406 | 0.7494 | 0.7679 | 1.9305 |  |
| router | qwik-city | 1.19.2 | app streaming 1000 nodes | completed | throughput | ops/sec | 1333 | 0 | 1333 | 0.7843 | 0.7617 | 1.7404 |  |
| router | qwik-city | 1.19.2 | app dynamic route params data | completed | throughput | ops/sec | 921 | 0 | 921 | 1.126 | 1.1598 | 2.2071 |  |
| router | qwik-city | 1.19.2 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 19 | 0 | 19 | 51.7023 | 51.8171 | 52.4383 |  |
| router | qwik-city | 1.19.2 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 19 | 0 | 19 | 51.3176 | 51.4725 | 51.9763 |  |
| router | qwik-city | 1.19.2 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 956 | 0 | 956 | 1.083 | 1.0728 | 2.0766 |  |
| router | qwik-city | 1.19.2 | app streaming first byte 1000 nodes | completed | duration | ms | 0.7927 | 0 | 0 | 0.8208 | 0.8799 | 1.2214 |  |
| router | qwik-city | 1.19.2 | app streaming first chunk 1000 nodes | completed | duration | ms | 0.8428 | 0 | 0 | 0.8728 | 0.9362 | 1.0845 |  |
| router | qwik-city | 1.19.2 | app streaming full body 1000 nodes | completed | duration | ms | 51.7817 | 0 | 0 | 52.0199 | 52.3221 | 53.387 |  |
| router | qwik-city | 1.19.2 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app client navigation route-to-route |
| router | qwik-city | 1.19.2 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app hydration first interaction |
| router | qwik-city | 1.19.2 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app server cold start |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app build output gzip bytes |
| router | solid-start | 1.3.2 | app render 1000 nodes | completed | throughput | ops/sec | 648 | 0 | 648 | 1.7586 | 1.7048 | 8.2703 |  |
| router | solid-start | 1.3.2 | app streaming 1000 nodes | completed | throughput | ops/sec | 708 | 0 | 708 | 1.6347 | 1.6353 | 6.6115 |  |
| router | solid-start | 1.3.2 | app dynamic route params data | completed | throughput | ops/sec | 716 | 0 | 716 | 1.4902 | 1.5057 | 2.6776 |  |
| router | solid-start | 1.3.2 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 19 | 0 | 19 | 51.336 | 51.6626 | 52.0345 |  |
| router | solid-start | 1.3.2 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.8595 | 51.0272 | 51.4397 |  |
| router | solid-start | 1.3.2 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 708 | 0 | 708 | 1.4937 | 1.5269 | 2.4429 |  |
| router | solid-start | 1.3.2 | app streaming first byte 1000 nodes | completed | duration | ms | 1.6977 | 0 | 0 | 1.7953 | 2.0225 | 2.2374 |  |
| router | solid-start | 1.3.2 | app streaming first chunk 1000 nodes | completed | duration | ms | 1.8122 | 0 | 0 | 1.8233 | 1.9002 | 2.039 |  |
| router | solid-start | 1.3.2 | app streaming full body 1000 nodes | completed | duration | ms | 51.3546 | 0 | 0 | 51.1893 | 51.4176 | 51.5291 |  |
| router | solid-start | 1.3.2 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app client navigation route-to-route |
| router | solid-start | 1.3.2 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app hydration first interaction |
| router | solid-start | 1.3.2 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app server cold start |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 28771 | 28771 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 28771 | 28771 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 28771 | 28771 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app build output gzip bytes |
| router | tanstack-start | 1.167.65 | app render 1000 nodes | completed | throughput | ops/sec | 2020 | 0 | 2020 | 0.5283 | 0.5584 | 1.6133 |  |
| router | tanstack-start | 1.167.65 | app streaming 1000 nodes | completed | throughput | ops/sec | 2245 | 0 | 2245 | 0.4678 | 0.4448 | 1.5532 |  |
| router | tanstack-start | 1.167.65 | app dynamic route params data | completed | throughput | ops/sec | 1204 | 0 | 1204 | 0.854 | 0.8353 | 1.6715 |  |
| router | tanstack-start | 1.167.65 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 19 | 0 | 19 | 51.6927 | 51.8215 | 52.5669 |  |
| router | tanstack-start | 1.167.65 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 19 | 0 | 19 | 51.3016 | 51.5011 | 51.9279 |  |
| router | tanstack-start | 1.167.65 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 1224 | 0 | 1224 | 0.849 | 0.8525 | 1.8962 |  |
| router | tanstack-start | 1.167.65 | app streaming first byte 1000 nodes | completed | duration | ms | 51.6611 | 0 | 0 | 51.8081 | 52.1069 | 52.4735 |  |
| router | tanstack-start | 1.167.65 | app streaming first chunk 1000 nodes | completed | duration | ms | 51.6401 | 0 | 0 | 51.6606 | 51.7205 | 51.7753 |  |
| router | tanstack-start | 1.167.65 | app streaming full body 1000 nodes | completed | duration | ms | 51.6653 | 0 | 0 | 51.7456 | 51.8513 | 52.1143 |  |
| router | tanstack-start | 1.167.65 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app client navigation route-to-route |
| router | tanstack-start | 1.167.65 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app hydration first interaction |
| router | tanstack-start | 1.167.65 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app server cold start |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app build output gzip bytes |
| router | next-app-router | 16.2.6 | app render 1000 nodes | completed | throughput | ops/sec | 173 | 0 | 173 | 6.1336 | 5.9461 | 13.9025 |  |
| router | next-app-router | 16.2.6 | app streaming 1000 nodes | completed | throughput | ops/sec | 180 | 0 | 180 | 5.9271 | 5.7473 | 13.938 |  |
| router | next-app-router | 16.2.6 | app dynamic route params data | completed | throughput | ops/sec | 250 | 0 | 250 | 4.2344 | 4.0442 | 9.7871 |  |
| router | next-app-router | 16.2.6 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 18 | 0 | 18 | 55.3983 | 55.6202 | 61.4393 |  |
| router | next-app-router | 16.2.6 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 19 | 0 | 19 | 52.0367 | 52.3539 | 52.9065 |  |
| router | next-app-router | 16.2.6 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 272 | 0 | 272 | 3.9011 | 3.7123 | 9.6675 |  |
| router | next-app-router | 16.2.6 | app streaming first byte 1000 nodes | completed | duration | ms | 1.9499 | 0 | 0 | 1.9917 | 1.9993 | 2.3082 |  |
| router | next-app-router | 16.2.6 | app streaming first chunk 1000 nodes | completed | duration | ms | 2.0942 | 0 | 0 | 2.0775 | 2.1045 | 2.1158 |  |
| router | next-app-router | 16.2.6 | app streaming full body 1000 nodes | completed | duration | ms | 55.011 | 0 | 0 | 55.0351 | 55.243 | 55.2486 |  |
| router | next-app-router | 16.2.6 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app client navigation route-to-route |
| router | next-app-router | 16.2.6 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app hydration first interaction |
| router | next-app-router | 16.2.6 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app server cold start |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 185524 | 185524 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 185524 | 185524 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 185524 | 185524 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app build output gzip bytes |
| router | mreact-app-router | workspace | app render 1000 nodes | completed | throughput | ops/sec | 5489 | 0 | 5489 | 0.202 | 0.1899 | 0.51 |  |
| router | mreact-app-router | workspace | app streaming 1000 nodes | completed | throughput | ops/sec | 3557 | 0 | 3557 | 0.3068 | 0.3005 | 1.1892 |  |
| router | mreact-app-router | workspace | app dynamic route params data | completed | throughput | ops/sec | 3548 | 0 | 3548 | 0.3089 | 0.2857 | 1.5754 |  |
| router | mreact-app-router | workspace | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 51.2189 | 51.5569 | 52.1966 |  |
| router | mreact-app-router | workspace | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 19 | 0 | 19 | 51.4642 | 51.6114 | 53.5188 |  |
| router | mreact-app-router | workspace | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 3270 | 0 | 3270 | 0.3586 | 0.3151 | 1.6693 |  |
| router | mreact-app-router | workspace | app streaming first byte 1000 nodes | completed | duration | ms | 0.7321 | 0 | 0 | 0.7368 | 0.7602 | 0.7607 |  |
| router | mreact-app-router | workspace | app streaming first chunk 1000 nodes | completed | duration | ms | 0.8008 | 0 | 0 | 0.7864 | 0.8627 | 0.8712 |  |
| router | mreact-app-router | workspace | app streaming full body 1000 nodes | completed | duration | ms | 51.4363 | 0 | 0 | 51.2034 | 51.5707 | 51.6366 |  |
| router | mreact-app-router | workspace | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app client navigation route-to-route |
| router | mreact-app-router | workspace | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app hydration first interaction |
| router | mreact-app-router | workspace | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app server cold start |
| router | mreact-app-router | workspace | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 4031 | 4031 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 2904 | 2904 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app build output gzip bytes |
| router | mreact-app-router+log enabled | workspace | app render 1000 nodes | completed | throughput | ops/sec | 6245 | 0 | 6245 | 0.1779 | 0.1676 | 0.4997 |  |
| router | mreact-app-router+log enabled | workspace | app streaming 1000 nodes | completed | throughput | ops/sec | 3808 | 0 | 3808 | 0.2827 | 0.2646 | 0.8776 |  |
| router | mreact-app-router+log enabled | workspace | app dynamic route params data | completed | throughput | ops/sec | 3425 | 0 | 3425 | 0.3227 | 0.3039 | 1.602 |  |
| router | mreact-app-router+log enabled | workspace | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 51.1636 | 51.4076 | 52.8586 |  |
| router | mreact-app-router+log enabled | workspace | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 51.1028 | 51.3741 | 52.4439 |  |
| router | mreact-app-router+log enabled | workspace | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 3494 | 0 | 3494 | 0.3159 | 0.2939 | 1.5706 |  |
| router | mreact-app-router+log enabled | workspace | app streaming first byte 1000 nodes | completed | duration | ms | 0.7953 | 0 | 0 | 0.8042 | 0.8149 | 0.9639 |  |
| router | mreact-app-router+log enabled | workspace | app streaming first chunk 1000 nodes | completed | duration | ms | 0.8269 | 0 | 0 | 0.8039 | 0.8539 | 0.8618 |  |
| router | mreact-app-router+log enabled | workspace | app streaming full body 1000 nodes | completed | duration | ms | 51.3392 | 0 | 0 | 51.3248 | 51.5792 | 51.7136 |  |
| router | mreact-app-router+log enabled | workspace | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router+log enabled does not implement app client navigation route-to-route |
| router | mreact-app-router+log enabled | workspace | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router+log enabled does not implement app hydration first interaction |
| router | mreact-app-router+log enabled | workspace | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router+log enabled does not implement app server cold start |
| router | mreact-app-router+log enabled | workspace | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router+log enabled | workspace | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 4029 | 4029 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router+log enabled | workspace | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 2904 | 2904 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router+log enabled | workspace | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router+log enabled does not implement app build output gzip bytes |
