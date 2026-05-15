# Router Benchmark

## Environment

- Date: 2026-05-15
- Git commit: 4e8daf17760490d680f3a32d9a8478ecb75b2719
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

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app render 1000 nodes | 5896 | ops/sec |
| 2 | marko-run | app render 1000 nodes | 3166 | ops/sec |
| 3 | tanstack-start | app render 1000 nodes | 2134 | ops/sec |
| 4 | qwik-city | app render 1000 nodes | 1404 | ops/sec |
| 5 | solid-start | app render 1000 nodes | 662 | ops/sec |
| 6 | next-app-router | app render 1000 nodes | 180 | ops/sec |

### app streaming 1000 nodes

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app streaming 1000 nodes | 4021 | ops/sec |
| 2 | mreact-app-router | app streaming 1000 nodes | 3482 | ops/sec |
| 3 | tanstack-start | app streaming 1000 nodes | 2228 | ops/sec |
| 4 | qwik-city | app streaming 1000 nodes | 1373 | ops/sec |
| 5 | solid-start | app streaming 1000 nodes | 706 | ops/sec |
| 6 | next-app-router | app streaming 1000 nodes | 189 | ops/sec |

### app real streaming 1000 nodes (async 50ms)

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 2 | mreact-app-router | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 3 | tanstack-start | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 4 | solid-start | app real streaming 1000 nodes (async 50ms) | 20 | ops/sec |
| 5 | qwik-city | app real streaming 1000 nodes (async 50ms) | 19 | ops/sec |
| 6 | next-app-router | app real streaming 1000 nodes (async 50ms) | 18 | ops/sec |

### app dynamic-attr grid 200 cells

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app dynamic-attr grid 200 cells | 2984 | ops/sec |
| 2 | marko-run | app dynamic-attr grid 200 cells | 2029 | ops/sec |
| 3 | tanstack-start | app dynamic-attr grid 200 cells | 1320 | ops/sec |
| 4 | qwik-city | app dynamic-attr grid 200 cells | 923 | ops/sec |
| 5 | solid-start | app dynamic-attr grid 200 cells | 748 | ops/sec |
| 6 | next-app-router | app dynamic-attr grid 200 cells | 256 | ops/sec |

### app client bundle gzip bytes (server-only page)

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact-app-router | app client bundle gzip bytes (server-only page) | 0 | gzip bytes |
| 2 | marko-run | app client bundle gzip bytes (server-only page) | 1872 | gzip bytes |
| 3 | solid-start | app client bundle gzip bytes (server-only page) | 28775 | gzip bytes |
| 4 | qwik-city | app client bundle gzip bytes (server-only page) | 47716 | gzip bytes |
| 5 | tanstack-start | app client bundle gzip bytes (server-only page) | 112814 | gzip bytes |
| 6 | next-app-router | app client bundle gzip bytes (server-only page) | 185522 | gzip bytes |

### app client bundle gzip bytes (interactive page)

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app client bundle gzip bytes (interactive page) | 1872 | gzip bytes |
| 2 | mreact-app-router | app client bundle gzip bytes (interactive page) | 4066 | gzip bytes |
| 3 | solid-start | app client bundle gzip bytes (interactive page) | 28775 | gzip bytes |
| 4 | qwik-city | app client bundle gzip bytes (interactive page) | 47716 | gzip bytes |
| 5 | tanstack-start | app client bundle gzip bytes (interactive page) | 112814 | gzip bytes |
| 6 | next-app-router | app client bundle gzip bytes (interactive page) | 185522 | gzip bytes |

### app client bundle gzip bytes (interactive page, minimal opt-out)

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko-run | app client bundle gzip bytes (interactive page, minimal opt-out) | 1872 | gzip bytes |
| 2 | mreact-app-router | app client bundle gzip bytes (interactive page, minimal opt-out) | 2939 | gzip bytes |
| 3 | solid-start | app client bundle gzip bytes (interactive page, minimal opt-out) | 28775 | gzip bytes |
| 4 | qwik-city | app client bundle gzip bytes (interactive page, minimal opt-out) | 47716 | gzip bytes |
| 5 | tanstack-start | app client bundle gzip bytes (interactive page, minimal opt-out) | 112814 | gzip bytes |
| 6 | next-app-router | app client bundle gzip bytes (interactive page, minimal opt-out) | 185522 | gzip bytes |

## Results

| suite | framework | version | case | status | metric | unit | value | gzip bytes | hz | mean ms | p75 ms | p99 ms | note |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| router | marko-run | 0.10.0 | app render 1000 nodes | completed | throughput | ops/sec | 3166 | 0 | 3166 | 0.34 | 0.3313 | 1.1092 |  |
| router | marko-run | 0.10.0 | app streaming 1000 nodes | completed | throughput | ops/sec | 4021 | 0 | 4021 | 0.271 | 0.2613 | 0.599 |  |
| router | marko-run | 0.10.0 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 50.7827 | 50.9819 | 51.5491 |  |
| router | marko-run | 0.10.0 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 2029 | 0 | 2029 | 0.5144 | 0.5163 | 1.3484 |  |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 1872 | 1872 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 1872 | 1872 | 0 | 0 | 0 | 0 |  |
| router | marko-run | 0.10.0 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 1872 | 1872 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app render 1000 nodes | completed | throughput | ops/sec | 1404 | 0 | 1404 | 0.7408 | 0.7634 | 1.4677 |  |
| router | qwik-city | 1.19.2 | app streaming 1000 nodes | completed | throughput | ops/sec | 1373 | 0 | 1373 | 0.7548 | 0.7325 | 1.5758 |  |
| router | qwik-city | 1.19.2 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 19 | 0 | 19 | 51.6534 | 51.7633 | 52.2609 |  |
| router | qwik-city | 1.19.2 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 923 | 0 | 923 | 1.1155 | 1.1249 | 2.0776 |  |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | qwik-city | 1.19.2 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 47716 | 47716 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app render 1000 nodes | completed | throughput | ops/sec | 662 | 0 | 662 | 1.6999 | 1.653 | 7.7315 |  |
| router | solid-start | 1.3.2 | app streaming 1000 nodes | completed | throughput | ops/sec | 706 | 0 | 706 | 1.6017 | 1.6217 | 6.1947 |  |
| router | solid-start | 1.3.2 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 51.2681 | 51.4983 | 52.3407 |  |
| router | solid-start | 1.3.2 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 748 | 0 | 748 | 1.4425 | 1.4789 | 2.5244 |  |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 28775 | 28775 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 28775 | 28775 | 0 | 0 | 0 | 0 |  |
| router | solid-start | 1.3.2 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 28775 | 28775 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app render 1000 nodes | completed | throughput | ops/sec | 2134 | 0 | 2134 | 0.4993 | 0.4748 | 1.6942 |  |
| router | tanstack-start | 1.167.65 | app streaming 1000 nodes | completed | throughput | ops/sec | 2228 | 0 | 2228 | 0.4699 | 0.4463 | 1.5832 |  |
| router | tanstack-start | 1.167.65 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 51.2096 | 51.3874 | 52.3484 |  |
| router | tanstack-start | 1.167.65 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 1320 | 0 | 1320 | 0.7864 | 0.7799 | 1.8098 |  |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | tanstack-start | 1.167.65 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 112814 | 112814 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app render 1000 nodes | completed | throughput | ops/sec | 180 | 0 | 180 | 5.7868 | 5.5853 | 10.6483 |  |
| router | next-app-router | 16.2.6 | app streaming 1000 nodes | completed | throughput | ops/sec | 189 | 0 | 189 | 5.4664 | 5.3029 | 9.5402 |  |
| router | next-app-router | 16.2.6 | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 18 | 0 | 18 | 55.4038 | 55.5345 | 59.8263 |  |
| router | next-app-router | 16.2.6 | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 256 | 0 | 256 | 4.0582 | 3.993 | 8.0574 |  |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 185522 | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 185522 | 185522 | 0 | 0 | 0 | 0 |  |
| router | next-app-router | 16.2.6 | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 185522 | 185522 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app render 1000 nodes | completed | throughput | ops/sec | 5896 | 0 | 5896 | 0.189 | 0.1731 | 0.596 |  |
| router | mreact-app-router | workspace | app streaming 1000 nodes | completed | throughput | ops/sec | 3482 | 0 | 3482 | 0.3061 | 0.2913 | 0.7109 |  |
| router | mreact-app-router | workspace | app real streaming 1000 nodes (async 50ms) | completed | throughput | ops/sec | 20 | 0 | 20 | 51.1118 | 51.3646 | 51.6383 |  |
| router | mreact-app-router | workspace | app dynamic-attr grid 200 cells | completed | throughput | ops/sec | 2984 | 0 | 2984 | 0.361 | 0.3373 | 1.5417 |  |
| router | mreact-app-router | workspace | app client bundle gzip bytes (server-only page) | completed | size | gzip bytes | 0 | 0 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app client bundle gzip bytes (interactive page) | completed | size | gzip bytes | 4066 | 4066 | 0 | 0 | 0 | 0 |  |
| router | mreact-app-router | workspace | app client bundle gzip bytes (interactive page, minimal opt-out) | completed | size | gzip bytes | 2939 | 2939 | 0 | 0 | 0 | 0 |  |
