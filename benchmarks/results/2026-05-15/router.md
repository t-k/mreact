# Router Benchmark

## Environment

- Date: 2026-05-15
- Git commit: 4a35c71283da8d1742c4e677276fa7bcf6b13d32
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
| 1 | mreact-app-router+log enabled | app render 1000 nodes | 5678 | ops/sec |
| 2 | mreact-app-router | app render 1000 nodes | 5587 | ops/sec |
| 3 | marko-run | app render 1000 nodes | 3304 | ops/sec |
| 4 | tanstack-start | app render 1000 nodes | 2185 | ops/sec |
| 5 | qwik-city | app render 1000 nodes | 1440 | ops/sec |
| 6 | qwik-router-v2 | app render 1000 nodes | 1069 | ops/sec |
| 7 | solid-start | app render 1000 nodes | 688 | ops/sec |
| 8 | next-app-router | app render 1000 nodes | 166 | ops/sec |

### app streaming 1000 nodes

Streams a production app route with 1,000 simple text spans and validates the complete response body.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app streaming 1000 nodes | 3939 | ops/sec |
| 2 | mreact-app-router+log enabled | app streaming 1000 nodes | 3698 | ops/sec |
| 3 | mreact-app-router | app streaming 1000 nodes | 3688 | ops/sec |
| 4 | tanstack-start | app streaming 1000 nodes | 2234 | ops/sec |
| 5 | qwik-city | app streaming 1000 nodes | 1408 | ops/sec |
| 6 | qwik-router-v2 | app streaming 1000 nodes | 1008 | ops/sec |
| 7 | solid-start | app streaming 1000 nodes | 731 | ops/sec |
| 8 | next-app-router | app streaming 1000 nodes | 183 | ops/sec |

### app streaming first byte 1000 nodes

Measures elapsed time until fetch resolves response headers for the real streaming route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app streaming first byte 1000 nodes | 0.5324 | ms |
| 2 | mreact-app-router+log enabled | app streaming first byte 1000 nodes | 0.5343 | ms |
| 3 | marko-run | app streaming first byte 1000 nodes | 0.535 | ms |
| 4 | qwik-city | app streaming first byte 1000 nodes | 0.7227 | ms |
| 5 | solid-start | app streaming first byte 1000 nodes | 1.6599 | ms |
| 6 | next-app-router | app streaming first byte 1000 nodes | 1.7674 | ms |
| 7 | tanstack-start | app streaming first byte 1000 nodes | 50.805 | ms |
| 8 | qwik-router-v2 | app streaming first byte 1000 nodes | 51.5288 | ms |

### app streaming first chunk 1000 nodes

Measures elapsed time until the first response body chunk arrives for the real streaming route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app streaming first chunk 1000 nodes | 0.5729 | ms |
| 2 | marko-run | app streaming first chunk 1000 nodes | 0.6766 | ms |
| 3 | qwik-city | app streaming first chunk 1000 nodes | 0.7095 | ms |
| 4 | mreact-app-router+log enabled | app streaming first chunk 1000 nodes | 0.7995 | ms |
| 5 | solid-start | app streaming first chunk 1000 nodes | 1.8204 | ms |
| 6 | next-app-router | app streaming first chunk 1000 nodes | 2.0487 | ms |
| 7 | tanstack-start | app streaming first chunk 1000 nodes | 50.9622 | ms |
| 8 | qwik-router-v2 | app streaming first chunk 1000 nodes | 51.9133 | ms |

### app streaming full body 1000 nodes

Measures elapsed time until the complete real streaming response body is consumed and validated.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router+log enabled | app streaming full body 1000 nodes | 50.9491 | ms |
| 2 | mreact-app-router | app streaming full body 1000 nodes | 50.9693 | ms |
| 3 | tanstack-start | app streaming full body 1000 nodes | 51.0046 | ms |
| 4 | solid-start | app streaming full body 1000 nodes | 51.0181 | ms |
| 5 | marko-run | app streaming full body 1000 nodes | 51.1088 | ms |
| 6 | qwik-city | app streaming full body 1000 nodes | 51.338 | ms |
| 7 | qwik-router-v2 | app streaming full body 1000 nodes | 51.7596 | ms |
| 8 | next-app-router | app streaming full body 1000 nodes | 54.7866 | ms |

### app real streaming 1000 nodes (async 50ms)

Streams a route whose body waits on a 50 ms async boundary before the full 1,000-node response completes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 2 | marko-run | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 3 | mreact-app-router+log enabled | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 4 | solid-start | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 5 | tanstack-start | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 6 | qwik-city | app real streaming 1000 nodes (async 50ms) | 19 | ops/sec |
| 7 | qwik-router-v2 | app real streaming 1000 nodes (async 50ms) | 19 | ops/sec |
| 8 | next-app-router | app real streaming 1000 nodes (async 50ms) | 18 | ops/sec |

### app parallel async boundaries 2x50ms

Renders two sibling 50 ms async boundaries and reports whether total response latency stays near one boundary instead of waterfalling.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | solid-start | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 2 | marko-run | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 3 | mreact-app-router+log enabled | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 4 | mreact-app-router | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 5 | tanstack-start | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 6 | qwik-city | app parallel async boundaries 2x50ms | 20 | ops/sec |
| 7 | qwik-router-v2 | app parallel async boundaries 2x50ms | 19 | ops/sec |
| 8 | next-app-router | app parallel async boundaries 2x50ms | 19 | ops/sec |

### app dynamic-attr grid 200 cells

Renders 200 cells with many dynamic escaped attributes, inline style values, and text content.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router+log enabled | app dynamic-attr grid 200 cells | 3575 | ops/sec |
| 2 | mreact-app-router | app dynamic-attr grid 200 cells | 3221 | ops/sec |
| 3 | marko-run | app dynamic-attr grid 200 cells | 2099 | ops/sec |
| 4 | tanstack-start | app dynamic-attr grid 200 cells | 1293 | ops/sec |
| 5 | qwik-city | app dynamic-attr grid 200 cells | 986 | ops/sec |
| 6 | solid-start | app dynamic-attr grid 200 cells | 753 | ops/sec |
| 7 | qwik-router-v2 | app dynamic-attr grid 200 cells | 664 | ops/sec |
| 8 | next-app-router | app dynamic-attr grid 200 cells | 249 | ops/sec |

### app dynamic route params data

Renders a dynamic route that combines route parameters with server data before producing HTML.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app dynamic route params data | 3742 | ops/sec |
| 2 | mreact-app-router+log enabled | app dynamic route params data | 3560 | ops/sec |
| 3 | marko-run | app dynamic route params data | 2022 | ops/sec |
| 4 | tanstack-start | app dynamic route params data | 1244 | ops/sec |
| 5 | qwik-city | app dynamic route params data | 982 | ops/sec |
| 6 | solid-start | app dynamic route params data | 739 | ops/sec |
| 7 | qwik-router-v2 | app dynamic route params data | 673 | ops/sec |
| 8 | next-app-router | app dynamic route params data | 247 | ops/sec |

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
| 4 | solid-start | app client bundle gzip bytes (server-only page) | 28774 | gzip bytes |
| 5 | qwik-city | app client bundle gzip bytes (server-only page) | 47716 | gzip bytes |
| 6 | qwik-router-v2 | app client bundle gzip bytes (server-only page) | 68172 | gzip bytes |
| 7 | tanstack-start | app client bundle gzip bytes (server-only page) | 112814 | gzip bytes |
| 8 | next-app-router | app client bundle gzip bytes (server-only page) | 185522 | gzip bytes |

### app client bundle gzip bytes (interactive page)

Measures gzip-compressed client JavaScript shipped for a minimal button-and-state interactive route.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app client bundle gzip bytes (interactive page) | 1874 | gzip bytes |
| 2 | mreact-app-router | app client bundle gzip bytes (interactive page) | 4031 | gzip bytes |
| 3 | mreact-app-router+log enabled | app client bundle gzip bytes (interactive page) | 4031 | gzip bytes |
| 4 | solid-start | app client bundle gzip bytes (interactive page) | 28774 | gzip bytes |
| 5 | qwik-city | app client bundle gzip bytes (interactive page) | 47716 | gzip bytes |
| 6 | qwik-router-v2 | app client bundle gzip bytes (interactive page) | 68172 | gzip bytes |
| 7 | tanstack-start | app client bundle gzip bytes (interactive page) | 112814 | gzip bytes |
| 8 | next-app-router | app client bundle gzip bytes (interactive page) | 185522 | gzip bytes |

### app client bundle gzip bytes (interactive page, minimal opt-out)

Measures the same interactive route while opting out of optional client navigation runtime where the framework supports it.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app client bundle gzip bytes (interactive page, minimal opt-out) | 1874 | gzip bytes |
| 2 | mreact-app-router | app client bundle gzip bytes (interactive page, minimal opt-out) | 2902 | gzip bytes |
| 3 | mreact-app-router+log enabled | app client bundle gzip bytes (interactive page, minimal opt-out) | 2904 | gzip bytes |
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
| router | marko-run | 0.10.0 | app render 1000 nodes | completed | throughput | ops/sec | 3304 | 0 | 3304 | 0.3233 | 0.3192 | 0.758 |  |
| router | marko-run | 0.10.0 | app streaming 1000 nodes | completed | throughput | ops/sec | 3939 | 0 | 3939 | 0.2739 | 0.2665 | 0.5965 |  |
| router | marko-run | 0.10.0 | app dynamic route params data | completed | throughput | ops/sec | 2022 | 0 | 2022 | 0.5143 | 0.5085 | 1.2512 |  |
| router | marko-run | 0.10.0 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 50.8931 | 51.3581 | 51.9329 |  |
| router | marko-run | 0.10.0 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.8837 | 51.0898 | 51.3491 |  |
| router | marko-run | 0.10.0 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 2099 | 0 | 2099 | 0.4996 | 0.4889 | 1.4191 |  |
| router | marko-run | 0.10.0 | app streaming first byte 1000 nodes | completed | duration | ms | 0.535 | 0 | 0 | 0.5581 | 0.6136 | 0.6522 |  |
| router | marko-run | 0.10.0 | app streaming first chunk 1000 nodes | completed | duration | ms | 0.6766 | 0 | 0 | 0.6695 | 0.7436 | 0.7507 |  |
| router | marko-run | 0.10.0 | app streaming full body 1000 nodes | completed | duration | ms | 51.1088 | 0 | 0 | 51.0901 | 51.2218 | 52.1099 |  |
| router | marko-run | 0.10.0 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app client navigation route-to-route |
| router | marko-run | 0.10.0 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app hydration first interaction |
| router | marko-run | 0.10.0 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app server cold start |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 1874 | 1874 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 1874 | 1874 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 1874 | 1874 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | marko-run does not implement app build output gzip bytes |
| router | qwik-city | 1.19.2 | app render 1000 nodes | completed | throughput | ops/sec | 1440 | 0 | 1440 | 0.7219 | 0.7388 | 1.4075 |  |
| router | qwik-city | 1.19.2 | app streaming 1000 nodes | completed | throughput | ops/sec | 1408 | 0 | 1408 | 0.7401 | 0.7053 | 1.5849 |  |
| router | qwik-city | 1.19.2 | app dynamic route params data | completed | throughput | ops/sec | 982 | 0 | 982 | 1.0539 | 1.005 | 2.1584 |  |
| router | qwik-city | 1.19.2 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 19 | 0 | 19 | 51.3942 | 51.5933 | 52.1726 |  |
| router | qwik-city | 1.19.2 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 51.1173 | 51.3465 | 51.539 |  |
| router | qwik-city | 1.19.2 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 986 | 0 | 986 | 1.0544 | 1.0223 | 2.1154 |  |
| router | qwik-city | 1.19.2 | app streaming first byte 1000 nodes | completed | duration | ms | 0.7227 | 0 | 0 | 0.7261 | 0.8046 | 0.8132 |  |
| router | qwik-city | 1.19.2 | app streaming first chunk 1000 nodes | completed | duration | ms | 0.7095 | 0 | 0 | 0.7427 | 0.8536 | 1.0895 |  |
| router | qwik-city | 1.19.2 | app streaming full body 1000 nodes | completed | duration | ms | 51.338 | 0 | 0 | 51.2039 | 51.6256 | 51.6955 |  |
| router | qwik-city | 1.19.2 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app client navigation route-to-route |
| router | qwik-city | 1.19.2 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app hydration first interaction |
| router | qwik-city | 1.19.2 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app server cold start |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | qwik-city does not implement app build output gzip bytes |
| router | qwik-router-v2 | 2.0.0-beta.35 | app render 1000 nodes | completed | throughput | ops/sec | 1069 | 0 | 1069 | 1.0588 | 0.9555 | 3.4657 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app streaming 1000 nodes | completed | throughput | ops/sec | 1008 | 0 | 1008 | 1.1188 | 1.005 | 3.738 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app dynamic route params data | completed | throughput | ops/sec | 673 | 0 | 673 | 1.7021 | 1.4576 | 5.7065 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 19 | 0 | 19 | 52.3795 | 52.5546 | 54.6674 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 19 | 0 | 19 | 51.4216 | 51.6502 | 52.5248 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 664 | 0 | 664 | 1.6594 | 1.4944 | 4.6443 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app streaming first byte 1000 nodes | completed | duration | ms | 51.5288 | 0 | 0 | 51.7017 | 52.0199 | 52.2413 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app streaming first chunk 1000 nodes | completed | duration | ms | 51.9133 | 0 | 0 | 51.9579 | 52.4166 | 52.4583 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app streaming full body 1000 nodes | completed | duration | ms | 51.7596 | 0 | 0 | 52.073 | 52.5904 | 53.2501 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | qwik-router-v2 does not implement app client navigation route-to-route |
| router | qwik-router-v2 | 2.0.0-beta.35 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | qwik-router-v2 does not implement app hydration first interaction |
| router | qwik-router-v2 | 2.0.0-beta.35 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | qwik-router-v2 does not implement app server cold start |
| router | qwik-router-v2 | 2.0.0-beta.35 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 68172 | 68172 | 0 | 0 | 0 | 0 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 68172 | 68172 | 0 | 0 | 0 | 0 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 68172 | 68172 | 0 | 0 | 0 | 0 |  |
| router | qwik-router-v2 | 2.0.0-beta.35 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | qwik-router-v2 does not implement app build output gzip bytes |
| router | solid-start | 1.3.2 | app render 1000 nodes | completed | throughput | ops/sec | 688 | 0 | 688 | 1.6635 | 1.6409 | 7.0997 |  |
| router | solid-start | 1.3.2 | app streaming 1000 nodes | completed | throughput | ops/sec | 731 | 0 | 731 | 1.5778 | 1.583 | 5.8642 |  |
| router | solid-start | 1.3.2 | app dynamic route params data | completed | throughput | ops/sec | 739 | 0 | 739 | 1.4601 | 1.5104 | 2.3742 |  |
| router | solid-start | 1.3.2 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 51.1623 | 51.3776 | 52.4437 |  |
| router | solid-start | 1.3.2 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.7794 | 51.05 | 51.3116 |  |
| router | solid-start | 1.3.2 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 753 | 0 | 753 | 1.436 | 1.4793 | 2.3281 |  |
| router | solid-start | 1.3.2 | app streaming first byte 1000 nodes | completed | duration | ms | 1.6599 | 0 | 0 | 1.6877 | 1.8828 | 1.9435 |  |
| router | solid-start | 1.3.2 | app streaming first chunk 1000 nodes | completed | duration | ms | 1.8204 | 0 | 0 | 2.1006 | 1.9088 | 3.826 |  |
| router | solid-start | 1.3.2 | app streaming full body 1000 nodes | completed | duration | ms | 51.0181 | 0 | 0 | 50.9563 | 51.2429 | 51.3521 |  |
| router | solid-start | 1.3.2 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app client navigation route-to-route |
| router | solid-start | 1.3.2 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app hydration first interaction |
| router | solid-start | 1.3.2 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app server cold start |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 28774 | 28774 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 28774 | 28774 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 28774 | 28774 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | solid-start does not implement app build output gzip bytes |
| router | tanstack-start | 1.167.65 | app render 1000 nodes | completed | throughput | ops/sec | 2185 | 0 | 2185 | 0.4837 | 0.4652 | 1.5788 |  |
| router | tanstack-start | 1.167.65 | app streaming 1000 nodes | completed | throughput | ops/sec | 2234 | 0 | 2234 | 0.4709 | 0.446 | 1.6184 |  |
| router | tanstack-start | 1.167.65 | app dynamic route params data | completed | throughput | ops/sec | 1244 | 0 | 1244 | 0.8358 | 0.7884 | 2.148 |  |
| router | tanstack-start | 1.167.65 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 51.258 | 51.3766 | 52.1624 |  |
| router | tanstack-start | 1.167.65 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 51.111 | 51.3655 | 51.6467 |  |
| router | tanstack-start | 1.167.65 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 1293 | 0 | 1293 | 0.8022 | 0.7964 | 1.7496 |  |
| router | tanstack-start | 1.167.65 | app streaming first byte 1000 nodes | completed | duration | ms | 50.805 | 0 | 0 | 50.5928 | 50.9322 | 50.9606 |  |
| router | tanstack-start | 1.167.65 | app streaming first chunk 1000 nodes | completed | duration | ms | 50.9622 | 0 | 0 | 51.0084 | 51.4096 | 51.4659 |  |
| router | tanstack-start | 1.167.65 | app streaming full body 1000 nodes | completed | duration | ms | 51.0046 | 0 | 0 | 51.1007 | 51.1029 | 51.8445 |  |
| router | tanstack-start | 1.167.65 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app client navigation route-to-route |
| router | tanstack-start | 1.167.65 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app hydration first interaction |
| router | tanstack-start | 1.167.65 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app server cold start |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | tanstack-start does not implement app build output gzip bytes |
| router | next-app-router | 16.2.6 | app render 1000 nodes | completed | throughput | ops/sec | 166 | 0 | 166 | 6.4296 | 6.0607 | 14.4972 |  |
| router | next-app-router | 16.2.6 | app streaming 1000 nodes | completed | throughput | ops/sec | 183 | 0 | 183 | 5.7932 | 5.3937 | 13.5383 |  |
| router | next-app-router | 16.2.6 | app dynamic route params data | completed | throughput | ops/sec | 247 | 0 | 247 | 4.2333 | 4.0006 | 8.9575 |  |
| router | next-app-router | 16.2.6 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 18 | 0 | 18 | 55.4931 | 55.5023 | 60.4057 |  |
| router | next-app-router | 16.2.6 | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 19 | 0 | 19 | 52.0769 | 52.3915 | 53.0046 |  |
| router | next-app-router | 16.2.6 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 249 | 0 | 249 | 4.3109 | 4.2008 | 10.8305 |  |
| router | next-app-router | 16.2.6 | app streaming first byte 1000 nodes | completed | duration | ms | 1.7674 | 0 | 0 | 1.869 | 1.951 | 2.4233 |  |
| router | next-app-router | 16.2.6 | app streaming first chunk 1000 nodes | completed | duration | ms | 2.0487 | 0 | 0 | 2.8329 | 2.5265 | 7.8964 |  |
| router | next-app-router | 16.2.6 | app streaming full body 1000 nodes | completed | duration | ms | 54.7866 | 0 | 0 | 54.8015 | 54.9905 | 55.0215 |  |
| router | next-app-router | 16.2.6 | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app client navigation route-to-route |
| router | next-app-router | 16.2.6 | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app hydration first interaction |
| router | next-app-router | 16.2.6 | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app server cold start |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 185522 | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 185522 | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 185522 | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | next-app-router does not implement app build output gzip bytes |
| router | mreact-app-router | workspace | app render 1000 nodes | completed | throughput | ops/sec | 5587 | 0 | 5587 | 0.1984 | 0.1866 | 0.5048 |  |
| router | mreact-app-router | workspace | app streaming 1000 nodes | completed | throughput | ops/sec | 3688 | 0 | 3688 | 0.2919 | 0.276 | 0.7029 |  |
| router | mreact-app-router | workspace | app dynamic route params data | completed | throughput | ops/sec | 3742 | 0 | 3742 | 0.2927 | 0.2678 | 1.5446 |  |
| router | mreact-app-router | workspace | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 50.8657 | 51.1287 | 51.5879 |  |
| router | mreact-app-router | workspace | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.9823 | 51.0277 | 53.8308 |  |
| router | mreact-app-router | workspace | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 3221 | 0 | 3221 | 0.3375 | 0.3134 | 1.535 |  |
| router | mreact-app-router | workspace | app streaming first byte 1000 nodes | completed | duration | ms | 0.5324 | 0 | 0 | 0.5622 | 0.6416 | 0.6504 |  |
| router | mreact-app-router | workspace | app streaming first chunk 1000 nodes | completed | duration | ms | 0.5729 | 0 | 0 | 0.5963 | 0.6462 | 0.7445 |  |
| router | mreact-app-router | workspace | app streaming full body 1000 nodes | completed | duration | ms | 50.9693 | 0 | 0 | 50.8794 | 51.1184 | 51.1715 |  |
| router | mreact-app-router | workspace | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app client navigation route-to-route |
| router | mreact-app-router | workspace | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app hydration first interaction |
| router | mreact-app-router | workspace | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app server cold start |
| router | mreact-app-router | workspace | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 4031 | 4031 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 2902 | 2902 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router does not implement app build output gzip bytes |
| router | mreact-app-router+log enabled | workspace | app render 1000 nodes | completed | throughput | ops/sec | 5678 | 0 | 5678 | 0.1936 | 0.1849 | 0.4701 |  |
| router | mreact-app-router+log enabled | workspace | app streaming 1000 nodes | completed | throughput | ops/sec | 3698 | 0 | 3698 | 0.2901 | 0.2705 | 0.9496 |  |
| router | mreact-app-router+log enabled | workspace | app dynamic route params data | completed | throughput | ops/sec | 3560 | 0 | 3560 | 0.3104 | 0.2793 | 1.5367 |  |
| router | mreact-app-router+log enabled | workspace | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 50.9639 | 51.2309 | 51.4992 |  |
| router | mreact-app-router+log enabled | workspace | app parallel async boundaries 2x50ms | completed | throughput | ops/sec | 20 | 0 | 20 | 50.9084 | 51.2144 | 51.6326 |  |
| router | mreact-app-router+log enabled | workspace | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 3575 | 0 | 3575 | 0.3042 | 0.2786 | 1.4821 |  |
| router | mreact-app-router+log enabled | workspace | app streaming first byte 1000 nodes | completed | duration | ms | 0.5343 | 0 | 0 | 0.626 | 0.7418 | 0.8588 |  |
| router | mreact-app-router+log enabled | workspace | app streaming first chunk 1000 nodes | completed | duration | ms | 0.7995 | 0 | 0 | 0.807 | 0.8217 | 1.0669 |  |
| router | mreact-app-router+log enabled | workspace | app streaming full body 1000 nodes | completed | duration | ms | 50.9491 | 0 | 0 | 50.7618 | 51.0127 | 51.1535 |  |
| router | mreact-app-router+log enabled | workspace | app client navigation route-to-route | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router+log enabled does not implement app client navigation route-to-route |
| router | mreact-app-router+log enabled | workspace | app hydration first interaction | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router+log enabled does not implement app hydration first interaction |
| router | mreact-app-router+log enabled | workspace | app server cold start | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router+log enabled does not implement app server cold start |
| router | mreact-app-router+log enabled | workspace | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router+log enabled | workspace | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 4031 | 4031 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router+log enabled | workspace | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 2904 | 2904 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router+log enabled | workspace | app build output gzip bytes | unsupported | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 | mreact-app-router+log enabled does not implement app build output gzip bytes |
