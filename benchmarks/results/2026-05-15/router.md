# Router Benchmark

## Environment

- Date: 2026-05-15
- Git commit: e493835a4cfd100fd072c7a9de919ff79e58230b
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
| 1 | mreact-app-router | app render 1000 nodes | 5937 | ops/sec |
| 2 | marko-run | app render 1000 nodes | 3508 | ops/sec |
| 3 | tanstack-start | app render 1000 nodes | 2192 | ops/sec |
| 4 | qwik-city | app render 1000 nodes | 1463 | ops/sec |
| 5 | solid-start | app render 1000 nodes | 673 | ops/sec |
| 6 | next-app-router | app render 1000 nodes | 175 | ops/sec |

### app streaming 1000 nodes

Streams a production app route with 1,000 simple text spans and validates the complete response body.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app streaming 1000 nodes | 3974 | ops/sec |
| 2 | mreact-app-router | app streaming 1000 nodes | 3790 | ops/sec |
| 3 | tanstack-start | app streaming 1000 nodes | 2248 | ops/sec |
| 4 | qwik-city | app streaming 1000 nodes | 1400 | ops/sec |
| 5 | solid-start | app streaming 1000 nodes | 724 | ops/sec |
| 6 | next-app-router | app streaming 1000 nodes | 184 | ops/sec |

### app streaming first byte 1000 nodes

Measures elapsed time until fetch resolves response headers for the real streaming route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app streaming first byte 1000 nodes | 0.5102 | ms |
| 2 | mreact-app-router | app streaming first byte 1000 nodes | 0.5146 | ms |
| 3 | qwik-city | app streaming first byte 1000 nodes | 0.6433 | ms |
| 4 | next-app-router | app streaming first byte 1000 nodes | 1.488 | ms |
| 5 | solid-start | app streaming first byte 1000 nodes | 1.96 | ms |
| 6 | tanstack-start | app streaming first byte 1000 nodes | 51.0503 | ms |

### app streaming first chunk 1000 nodes

Measures elapsed time until the first response body chunk arrives for the real streaming route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app streaming first chunk 1000 nodes | 0.4585 | ms |
| 2 | marko-run | app streaming first chunk 1000 nodes | 0.6119 | ms |
| 3 | qwik-city | app streaming first chunk 1000 nodes | 0.6426 | ms |
| 4 | next-app-router | app streaming first chunk 1000 nodes | 1.4157 | ms |
| 5 | solid-start | app streaming first chunk 1000 nodes | 2.0108 | ms |
| 6 | tanstack-start | app streaming first chunk 1000 nodes | 51.2166 | ms |

### app streaming full body 1000 nodes

Measures elapsed time until the complete real streaming response body is consumed and validated.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app streaming full body 1000 nodes | 50.2029 | ms |
| 2 | mreact-app-router | app streaming full body 1000 nodes | 50.6717 | ms |
| 3 | tanstack-start | app streaming full body 1000 nodes | 50.9475 | ms |
| 4 | qwik-city | app streaming full body 1000 nodes | 51.4934 | ms |
| 5 | solid-start | app streaming full body 1000 nodes | 51.6682 | ms |
| 6 | next-app-router | app streaming full body 1000 nodes | 54.0128 | ms |

### app real streaming 1000 nodes (async 50ms)

Streams a route whose body waits on a 50 ms async boundary before the full 1,000-node response completes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 2 | marko-run | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 3 | solid-start | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 4 | tanstack-start | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 5 | qwik-city | app real streaming 1000 nodes (async 50ms) | 19 | ops/sec |
| 6 | next-app-router | app real streaming 1000 nodes (async 50ms) | 18 | ops/sec |

### app parallel async boundaries 2x50ms

Renders two sibling 50 ms async boundaries and reports whether total response latency stays near one boundary instead of waterfalling.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 2 | mreact-app-router | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 3 | solid-start | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 4 | qwik-city | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 5 | tanstack-start | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 6 | next-app-router | app parallel async boundaries 2x50ms | 19 | ops/sec |

### app dynamic-attr grid 200 cells

Renders 200 cells with many dynamic escaped attributes, inline style values, and text content.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app dynamic-attr grid 200 cells | 3648 | ops/sec |
| 2 | marko-run | app dynamic-attr grid 200 cells | 2210 | ops/sec |
| 3 | tanstack-start | app dynamic-attr grid 200 cells | 1285 | ops/sec |
| 4 | qwik-city | app dynamic-attr grid 200 cells | 965 | ops/sec |
| 5 | solid-start | app dynamic-attr grid 200 cells | 728 | ops/sec |
| 6 | next-app-router | app dynamic-attr grid 200 cells | 276 | ops/sec |

### app dynamic route params data

Renders a dynamic route that combines route parameters with server data before producing HTML.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app dynamic route params data | 3814 | ops/sec |
| 2 | marko-run | app dynamic route params data | 2077 | ops/sec |
| 3 | tanstack-start | app dynamic route params data | 1203 | ops/sec |
| 4 | qwik-city | app dynamic route params data | 960 | ops/sec |
| 5 | solid-start | app dynamic route params data | 726 | ops/sec |
| 6 | next-app-router | app dynamic route params data | 270 | ops/sec |

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
| 3 | solid-start | app client bundle gzip bytes (server-only page) | 28775 | gzip bytes |
| 4 | qwik-city | app client bundle gzip bytes (server-only page) | 47716 | gzip bytes |
| 5 | tanstack-start | app client bundle gzip bytes (server-only page) | 112814 | gzip bytes |
| 6 | next-app-router | app client bundle gzip bytes (server-only page) | 185522 | gzip bytes |

### app client bundle gzip bytes (interactive page)

Measures gzip-compressed client JavaScript shipped for a minimal button-and-state interactive route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app client bundle gzip bytes (interactive page) | 1874 | gzip bytes |
| 2 | mreact-app-router | app client bundle gzip bytes (interactive page) | 4075 | gzip bytes |
| 3 | solid-start | app client bundle gzip bytes (interactive page) | 28775 | gzip bytes |
| 4 | qwik-city | app client bundle gzip bytes (interactive page) | 47716 | gzip bytes |
| 5 | tanstack-start | app client bundle gzip bytes (interactive page) | 112814 | gzip bytes |
| 6 | next-app-router | app client bundle gzip bytes (interactive page) | 185522 | gzip bytes |

### app client bundle gzip bytes (interactive page, minimal opt-out)

Measures the same interactive route while opting out of optional client navigation runtime where the framework supports it.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app client bundle gzip bytes (interactive page, minimal opt-out) | 1874 | gzip bytes |
| 2 | mreact-app-router | app client bundle gzip bytes (interactive page, minimal opt-out) | 2954 | gzip bytes |
| 3 | solid-start | app client bundle gzip bytes (interactive page, minimal opt-out) | 28775 | gzip bytes |
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
| router | marko-run | 0.10.0 | app render 1000 nodes | completed | throughput | ops/sec | 3508 | 0 | 3508 | 0.3052 | 0.2987 | 0.9115 |  |
| router | marko-run | 0.10.0 | app streaming 1000 nodes | completed | throughput | ops/sec | 3974 | 0 | 3974 | 0.2722 | 0.2649 | 0.5689 |  |
| router | marko-run | 0.10.0 | app dynamic route params data | completed | throughput | ops/sec | 2077 | 0 | 2077 | 0.499 | 0.4924 | 1.1833 |  |
| router | marko-run | 0.10.0 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 50.7943 | 51.0065 | 51.5251 |  |
| router | marko-run | 0.10.0 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.7132 | 50.9926 | 51.4 |  |
| router | marko-run | 0.10.0 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 2210 | 0 | 2210 | 0.4719 | 0.4708 | 1.2211 |  |
| router | marko-run | 0.10.0 | app streaming first byte 1000 nodes | completed | duration | ms | 0.5102 | 0 | 0 | 0.4998 | 0.5581 | 0.5649 |  |
| router | marko-run | 0.10.0 | app streaming first chunk 1000 nodes | completed | duration | ms | 0.6119 | 0 | 0 | 0.5985 | 0.691 | 0.7822 |  |
| router | marko-run | 0.10.0 | app streaming full body 1000 nodes | completed | duration | ms | 50.2029 | 0 | 0 | 50.5621 | 51.3456 | 51.4392 |  |
| router | marko-run | 0.10.0 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app client navigation route-to-route |
| router | marko-run | 0.10.0 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app hydration first interaction |
| router | marko-run | 0.10.0 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app server cold start |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 1874 | 1874 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 1874 | 1874 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 1874 | 1874 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app build output gzip bytes |
| router | qwik-city | 1.19.2 | app render 1000 nodes | completed | throughput | ops/sec | 1463 | 0 | 1463 | 0.7058 | 0.7251 | 1.2815 |  |
| router | qwik-city | 1.19.2 | app streaming 1000 nodes | completed | throughput | ops/sec | 1400 | 0 | 1400 | 0.737 | 0.7197 | 1.2818 |  |
| router | qwik-city | 1.19.2 | app dynamic route params data | completed | throughput | ops/sec | 960 | 0 | 960 | 1.0701 | 1.0528 | 2.1249 |  |
| router | qwik-city | 1.19.2 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 19 | 0 | 19 | 51.3105 | 51.41 | 51.9595 |  |
| router | qwik-city | 1.19.2 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.9782 | 51.1333 | 51.4865 |  |
| router | qwik-city | 1.19.2 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 965 | 0 | 965 | 1.0648 | 1.0552 | 2.0656 |  |
| router | qwik-city | 1.19.2 | app streaming first byte 1000 nodes | completed | duration | ms | 0.6433 | 0 | 0 | 0.6665 | 0.6993 | 0.9638 |  |
| router | qwik-city | 1.19.2 | app streaming first chunk 1000 nodes | completed | duration | ms | 0.6426 | 0 | 0 | 0.711 | 0.8342 | 0.9202 |  |
| router | qwik-city | 1.19.2 | app streaming full body 1000 nodes | completed | duration | ms | 51.4934 | 0 | 0 | 51.4633 | 51.5379 | 51.7098 |  |
| router | qwik-city | 1.19.2 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app client navigation route-to-route |
| router | qwik-city | 1.19.2 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app hydration first interaction |
| router | qwik-city | 1.19.2 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app server cold start |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app build output gzip bytes |
| router | solid-start | 1.3.2 | app render 1000 nodes | completed | throughput | ops/sec | 673 | 0 | 673 | 1.6655 | 1.6244 | 6.9144 |  |
| router | solid-start | 1.3.2 | app streaming 1000 nodes | completed | throughput | ops/sec | 724 | 0 | 724 | 1.6011 | 1.5962 | 6.4952 |  |
| router | solid-start | 1.3.2 | app dynamic route params data | completed | throughput | ops/sec | 726 | 0 | 726 | 1.4536 | 1.4871 | 2.3406 |  |
| router | solid-start | 1.3.2 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 51.1076 | 51.2674 | 52.0688 |  |
| router | solid-start | 1.3.2 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.8703 | 51.0767 | 51.417 |  |
| router | solid-start | 1.3.2 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 728 | 0 | 728 | 1.4783 | 1.5046 | 2.4237 |  |
| router | solid-start | 1.3.2 | app streaming first byte 1000 nodes | completed | duration | ms | 1.96 | 0 | 0 | 1.9686 | 1.9835 | 1.9886 |  |
| router | solid-start | 1.3.2 | app streaming first chunk 1000 nodes | completed | duration | ms | 2.0108 | 0 | 0 | 2.0035 | 2.0426 | 2.0455 |  |
| router | solid-start | 1.3.2 | app streaming full body 1000 nodes | completed | duration | ms | 51.6682 | 0 | 0 | 51.418 | 51.7127 | 51.7516 |  |
| router | solid-start | 1.3.2 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app client navigation route-to-route |
| router | solid-start | 1.3.2 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app hydration first interaction |
| router | solid-start | 1.3.2 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app server cold start |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 28775 | 28775 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 28775 | 28775 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 28775 | 28775 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app build output gzip bytes |
| router | tanstack-start | 1.167.65 | app render 1000 nodes | completed | throughput | ops/sec | 2192 | 0 | 2192 | 0.4848 | 0.4638 | 1.6675 |  |
| router | tanstack-start | 1.167.65 | app streaming 1000 nodes | completed | throughput | ops/sec | 2248 | 0 | 2248 | 0.4652 | 0.4441 | 1.6416 |  |
| router | tanstack-start | 1.167.65 | app dynamic route params data | completed | throughput | ops/sec | 1203 | 0 | 1203 | 0.8864 | 0.8414 | 2.1433 |  |
| router | tanstack-start | 1.167.65 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 51.1602 | 51.2895 | 51.7999 |  |
| router | tanstack-start | 1.167.65 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 51.058 | 51.1748 | 52.7998 |  |
| router | tanstack-start | 1.167.65 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 1285 | 0 | 1285 | 0.808 | 0.7956 | 1.7252 |  |
| router | tanstack-start | 1.167.65 | app streaming first byte 1000 nodes | completed | duration | ms | 51.0503 | 0 | 0 | 51.0616 | 51.1888 | 51.2003 |  |
| router | tanstack-start | 1.167.65 | app streaming first chunk 1000 nodes | completed | duration | ms | 51.2166 | 0 | 0 | 51.0873 | 51.2869 | 51.2871 |  |
| router | tanstack-start | 1.167.65 | app streaming full body 1000 nodes | completed | duration | ms | 50.9475 | 0 | 0 | 51.0045 | 51.1449 | 51.1464 |  |
| router | tanstack-start | 1.167.65 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app client navigation route-to-route |
| router | tanstack-start | 1.167.65 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app hydration first interaction |
| router | tanstack-start | 1.167.65 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app server cold start |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app build output gzip bytes |
| router | next-app-router | 16.2.6 | app render 1000 nodes | completed | throughput | ops/sec | 175 | 0 | 175 | 6.0515 | 5.7626 | 12.736 |  |
| router | next-app-router | 16.2.6 | app streaming 1000 nodes | completed | throughput | ops/sec | 184 | 0 | 184 | 5.7308 | 5.5171 | 13.0499 |  |
| router | next-app-router | 16.2.6 | app dynamic route params data | completed | throughput | ops/sec | 270 | 0 | 270 | 3.8725 | 3.6595 | 8.4332 |  |
| router | next-app-router | 16.2.6 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 18 | 0 | 18 | 54.582 | 54.4588 | 59.1967 |  |
| router | next-app-router | 16.2.6 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 19 | 0 | 19 | 51.3029 | 51.4445 | 52.5223 |  |
| router | next-app-router | 16.2.6 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 276 | 0 | 276 | 3.792 | 3.5724 | 8.308 |  |
| router | next-app-router | 16.2.6 | app streaming first byte 1000 nodes | completed | duration | ms | 1.488 | 0 | 0 | 1.5145 | 1.6671 | 1.7117 |  |
| router | next-app-router | 16.2.6 | app streaming first chunk 1000 nodes | completed | duration | ms | 1.4157 | 0 | 0 | 1.5669 | 1.6304 | 2.0745 |  |
| router | next-app-router | 16.2.6 | app streaming full body 1000 nodes | completed | duration | ms | 54.0128 | 0 | 0 | 53.9809 | 54.1188 | 54.1923 |  |
| router | next-app-router | 16.2.6 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app client navigation route-to-route |
| router | next-app-router | 16.2.6 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app hydration first interaction |
| router | next-app-router | 16.2.6 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app server cold start |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 185522 | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 185522 | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 185522 | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app build output gzip bytes |
| router | mreact-app-router | workspace | app render 1000 nodes | completed | throughput | ops/sec | 5937 | 0 | 5937 | 0.1837 | 0.1721 | 0.5539 |  |
| router | mreact-app-router | workspace | app streaming 1000 nodes | completed | throughput | ops/sec | 3790 | 0 | 3790 | 0.2809 | 0.2673 | 0.6482 |  |
| router | mreact-app-router | workspace | app dynamic route params data | completed | throughput | ops/sec | 3814 | 0 | 3814 | 0.2873 | 0.2592 | 1.3971 |  |
| router | mreact-app-router | workspace | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 50.7301 | 50.8536 | 51.546 |  |
| router | mreact-app-router | workspace | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.8339 | 51.1697 | 52.2293 |  |
| router | mreact-app-router | workspace | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 3648 | 0 | 3648 | 0.2992 | 0.2712 | 1.4282 |  |
| router | mreact-app-router | workspace | app streaming first byte 1000 nodes | completed | duration | ms | 0.5146 | 0 | 0 | 0.5567 | 0.5967 | 0.7899 |  |
| router | mreact-app-router | workspace | app streaming first chunk 1000 nodes | completed | duration | ms | 0.4585 | 0 | 0 | 0.4698 | 0.4949 | 0.5472 |  |
| router | mreact-app-router | workspace | app streaming full body 1000 nodes | completed | duration | ms | 50.6717 | 0 | 0 | 50.6699 | 50.7031 | 50.7119 |  |
| router | mreact-app-router | workspace | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app client navigation route-to-route |
| router | mreact-app-router | workspace | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app hydration first interaction |
| router | mreact-app-router | workspace | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app server cold start |
| router | mreact-app-router | workspace | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 4075 | 4075 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 2954 | 2954 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app build output gzip bytes |
