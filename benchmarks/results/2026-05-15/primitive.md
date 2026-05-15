# Primitive Benchmark

## Environment

- Date: 2026-05-15
- Git commit: e796a2b2c45ded3f8ed9bd8f7a8eca6d7b1e6a1e
- Node: v24.13.0
- NODE_ENV: production
- pnpm: 10.19.0
- Platform: linux x64
- CPU: AMD Ryzen 9 9950X 16-Core Processor (32)
- Memory: 200106930176 bytes
- Package versions:
  - @builder.io/qwik: 1.19.2
  - marko: 5.38.39
  - react: 19.2.6
  - react-dom: 19.2.6
  - solid-js: 1.9.12

## Rankings

### create 1k rows

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | create 1k rows | 4.2969 | ms |
| 2 | react | create 1k rows | 4.3927 | ms |
| 3 | solid | create 1k rows | 4.4788 | ms |
| 4 | qwik | create 1k rows | 5.4854 | ms |
| 5 | marko | create 1k rows | 8.2183 | ms |

### update every 10th in 10k rows

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | react | update every 10th in 10k rows | 2.7284 | ms |
| 2 | mreact | update every 10th in 10k rows | 2.7361 | ms |
| 3 | marko | update every 10th in 10k rows | 23.0426 | ms |
| 4 | qwik | update every 10th in 10k rows | 34.5814 | ms |
| 5 | solid | update every 10th in 10k rows | 81.3669 | ms |

### keyed reverse 1k rows

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | keyed reverse 1k rows | 1.5471 | ms |
| 2 | solid | keyed reverse 1k rows | 2.2873 | ms |
| 3 | react | keyed reverse 1k rows | 3.0798 | ms |
| 4 | marko | keyed reverse 1k rows | 3.2676 | ms |
| 5 | qwik | keyed reverse 1k rows | 3.5202 | ms |

### text binding update 1k

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | text binding update 1k | 0.1155 | ms |
| 2 | solid | text binding update 1k | 0.1167 | ms |
| 3 | react | text binding update 1k | 0.3709 | ms |
| 4 | marko | text binding update 1k | 0.9584 | ms |
| 5 | qwik | text binding update 1k | 1.0565 | ms |

## Results

| suite | framework | version | case | status | metric | unit | value | sample count | min | max | mean | median | p75 | p95 | standard deviation | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| primitive | marko | 5.38.39 | create 1k rows | completed | duration | ms | 8.2183 | 7 | 6.665099000000055 | 17.45163500000001 | 9.5592 | 8.2183 | 10.6171 | 17.4516 | 3.4606 |  |
| primitive | marko | 5.38.39 | update every 10th in 10k rows | completed | duration | ms | 23.0426 | 7 | 21.034675999999763 | 25.42690300000004 | 23.3959 | 23.0426 | 24.7619 | 25.4269 | 1.4895 |  |
| primitive | marko | 5.38.39 | keyed reverse 1k rows | completed | duration | ms | 3.2676 | 7 | 3.2086059999996905 | 3.4573749999999563 | 3.3151 | 3.2676 | 3.3975 | 3.4574 | 0.0923 |  |
| primitive | marko | 5.38.39 | text binding update 1k | completed | duration | ms | 0.9584 | 7 | 0.8328999999998814 | 1.2532419999997728 | 0.9851 | 0.9584 | 1.0562 | 1.2532 | 0.1324 |  |
| primitive | qwik | 1.19.2 | create 1k rows | completed | duration | ms | 5.4854 | 7 | 5.161044999999831 | 6.860045999999784 | 5.7317 | 5.4854 | 6.1453 | 6.86 | 0.5376 |  |
| primitive | qwik | 1.19.2 | update every 10th in 10k rows | completed | duration | ms | 34.5814 | 7 | 30.423777999999857 | 45.601526999999805 | 34.9338 | 34.5814 | 36.6363 | 45.6015 | 4.8472 |  |
| primitive | qwik | 1.19.2 | keyed reverse 1k rows | completed | duration | ms | 3.5202 | 7 | 3.356764999999541 | 10.093149000000267 | 4.4339 | 3.5202 | 3.5559 | 10.0931 | 2.3113 |  |
| primitive | qwik | 1.19.2 | text binding update 1k | completed | duration | ms | 1.0565 | 7 | 0.9613509999999224 | 8.410156999999344 | 2.0979 | 1.0565 | 1.2147 | 8.4102 | 2.5781 |  |
| primitive | react | 19.2.6 | create 1k rows | completed | duration | ms | 4.3927 | 7 | 4.049060000000281 | 11.028831999999966 | 5.8455 | 4.3927 | 8.5525 | 11.0288 | 2.5839 |  |
| primitive | react | 19.2.6 | update every 10th in 10k rows | completed | duration | ms | 2.7284 | 7 | 2.3156340000005002 | 17.18143499999951 | 4.8537 | 2.7284 | 3.9415 | 17.1814 | 5.0597 |  |
| primitive | react | 19.2.6 | keyed reverse 1k rows | completed | duration | ms | 3.0798 | 7 | 3.0520910000004733 | 9.340390000000298 | 3.9901 | 3.0798 | 3.2366 | 9.3404 | 2.185 |  |
| primitive | react | 19.2.6 | text binding update 1k | completed | duration | ms | 0.3709 | 7 | 0.33040299999993294 | 0.4760870000000068 | 0.377 | 0.3709 | 0.395 | 0.4761 | 0.0458 |  |
| primitive | solid | 1.9.12 | create 1k rows | completed | duration | ms | 4.4788 | 7 | 4.029702999999245 | 16.169038 | 7.7315 | 4.4788 | 12.9241 | 16.169 | 4.6126 |  |
| primitive | solid | 1.9.12 | update every 10th in 10k rows | completed | duration | ms | 81.3669 | 7 | 72.94218600000022 | 83.92327699999987 | 78.571 | 81.3669 | 83.4505 | 83.9233 | 4.7269 |  |
| primitive | solid | 1.9.12 | keyed reverse 1k rows | completed | duration | ms | 2.2873 | 7 | 2.241073000000142 | 2.3345079999999143 | 2.2921 | 2.2873 | 2.311 | 2.3345 | 0.027 |  |
| primitive | solid | 1.9.12 | text binding update 1k | completed | duration | ms | 0.1167 | 7 | 0.11069900000074995 | 0.141367000000173 | 0.1207 | 0.1167 | 0.1298 | 0.1414 | 0.0102 |  |
| primitive | mreact | workspace | create 1k rows | completed | duration | ms | 4.2969 | 7 | 4.085418000000573 | 13.46770800000013 | 6.8252 | 4.2969 | 11.0077 | 13.4677 | 3.5842 |  |
| primitive | mreact | workspace | update every 10th in 10k rows | completed | duration | ms | 2.7361 | 7 | 2.304823000000397 | 3.492490999999063 | 2.8532 | 2.7361 | 3.2204 | 3.4925 | 0.4233 |  |
| primitive | mreact | workspace | keyed reverse 1k rows | completed | duration | ms | 1.5471 | 7 | 1.4862499999999272 | 1.7259219999996276 | 1.578 | 1.5471 | 1.6648 | 1.7259 | 0.0868 |  |
| primitive | mreact | workspace | text binding update 1k | completed | duration | ms | 0.1155 | 7 | 0.10765300000093703 | 0.15608400000019174 | 0.1227 | 0.1155 | 0.1402 | 0.1561 | 0.017 |  |
