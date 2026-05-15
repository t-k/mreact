# Primitive Benchmark

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
  - react: 19.2.6
  - react-dom: 19.2.6
  - solid-js: 1.9.12

## Rankings

### create 1k rows

Creates 1,000 DOM rows from an empty host and validates the final DOM.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | create 1k rows | 4.7567 | ms |
| 2 | solid | create 1k rows | 4.971 | ms |
| 3 | qwik | create 1k rows | 7.2288 | ms |
| 4 | react | create 1k rows | 7.2473 | ms |
| 5 | marko | create 1k rows | 8.8539 | ms |

### replace all 1k rows

Replaces an existing 1,000-row keyed list with a fresh 1,000-row dataset.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | solid | replace all 1k rows | 5.9849 | ms |
| 2 | mreact | replace all 1k rows | 6.2796 | ms |
| 3 | react | replace all 1k rows | 7.4162 | ms |
| 4 | marko | replace all 1k rows | 7.8349 | ms |
| 5 | qwik | replace all 1k rows | 17.5787 | ms |

### update every 10th in 10k rows

Updates the text of every tenth row in a 10,000-row keyed list while preserving the existing row nodes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | react | update every 10th in 10k rows | 3.0245 | ms |
| 2 | mreact | update every 10th in 10k rows | 4.812 | ms |
| 3 | marko | update every 10th in 10k rows | 23.6447 | ms |
| 4 | qwik | update every 10th in 10k rows | 67.4396 | ms |
| 5 | solid | update every 10th in 10k rows | 78.307 | ms |

### select row in 10k rows

Selects one row in a 10,000-row list by toggling selection attributes without changing row text.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | react | select row in 10k rows | 2.3559 | ms |
| 2 | mreact | select row in 10k rows | 6.0926 | ms |
| 3 | marko | select row in 10k rows | 22.4966 | ms |
| 4 | solid | select row in 10k rows | 33.7296 | ms |
| 5 | qwik | select row in 10k rows | 67.0644 | ms |

### append 1k rows to 10k rows

Appends 1,000 keyed rows to an existing 10,000-row list and validates the 11,000-row DOM.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | append 1k rows to 10k rows | 10.8626 | ms |
| 2 | react | append 1k rows to 10k rows | 12.9523 | ms |
| 3 | marko | append 1k rows to 10k rows | 32.6296 | ms |
| 4 | qwik | append 1k rows to 10k rows | 76.5135 | ms |
| 5 | solid | append 1k rows to 10k rows | 80.0706 | ms |

### remove row from 1k rows

Removes one keyed row from the middle of an existing 1,000-row list.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | react | remove row from 1k rows | 0.2727 | ms |
| 2 | mreact | remove row from 1k rows | 0.2741 | ms |
| 3 | marko | remove row from 1k rows | 0.688 | ms |
| 4 | solid | remove row from 1k rows | 1.9554 | ms |
| 5 | qwik | remove row from 1k rows | 2.4173 | ms |

### clear 10k rows

Clears an existing 10,000-row list and validates that no row elements remain.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | solid | clear 10k rows | 20.1398 | ms |
| 2 | mreact | clear 10k rows | 22.592 | ms |
| 3 | marko | clear 10k rows | 36.9947 | ms |
| 4 | qwik | clear 10k rows | 38.2824 | ms |
| 5 | react | clear 10k rows | 38.9231 | ms |

### keyed reverse 1k rows

Reverses 1,000 keyed rows and verifies that DOM node identity is preserved.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | keyed reverse 1k rows | 1.7233 | ms |
| 2 | solid | keyed reverse 1k rows | 2.3882 | ms |
| 3 | react | keyed reverse 1k rows | 3.3721 | ms |
| 4 | marko | keyed reverse 1k rows | 3.6062 | ms |
| 5 | qwik | keyed reverse 1k rows | 4.9085 | ms |

### text binding update 1k

Updates one reactive text value that is bound to 1,000 text nodes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | solid | text binding update 1k | 0.1213 | ms |
| 2 | mreact | text binding update 1k | 0.1277 | ms |
| 3 | react | text binding update 1k | 0.4336 | ms |
| 4 | marko | text binding update 1k | 0.9836 | ms |
| 5 | qwik | text binding update 1k | 1.0459 | ms |

### computed fan-out 1k

Updates one source value that fans out through a derived value into 1,000 displayed text nodes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | solid | computed fan-out 1k | 0.123 | ms |
| 2 | mreact | computed fan-out 1k | 0.1311 | ms |
| 3 | react | computed fan-out 1k | 0.4841 | ms |
| 4 | marko | computed fan-out 1k | 0.8099 | ms |
| 5 | qwik | computed fan-out 1k | 1.0299 | ms |

### computed fan-in 1k

Updates 1,000 source values and validates one derived aggregate text output.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | qwik | computed fan-in 1k | 0.0137 | ms |
| 2 | marko | computed fan-in 1k | 0.0169 | ms |
| 3 | react | computed fan-in 1k | 0.0385 | ms |
| 4 | mreact | computed fan-in 1k | 0.1016 | ms |
| 5 | solid | computed fan-in 1k | 13.6657 | ms |

### repeated create update clear memory

Reports heap growth after repeatedly creating, updating, and clearing 1,000-row lists.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko | repeated create update clear memory | 48821512 | bytes |
| 2 | solid | repeated create update clear memory | 49869416 | bytes |
| 3 | mreact | repeated create update clear memory | 50032720 | bytes |
| 4 | react | repeated create update clear memory | 57817656 | bytes |
| 5 | qwik | repeated create update clear memory | 104143208 | bytes |

## Results

| suite | framework | version | case | status | metric | unit | value | sample count | min | max | mean | median | p75 | p95 | standard deviation | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| primitive | marko | 5.38.39 | create 1k rows | completed | duration | ms | 8.8539 | 7 | 8.031724000000054 | 14.93886299999997 | 10.2355 | 8.8539 | 12.5265 | 14.9389 | 2.3659 |  |
| primitive | marko | 5.38.39 | replace all 1k rows | completed | duration | ms | 7.8349 | 7 | 7.4070990000000165 | 22.08034299999997 | 11.9359 | 7.8349 | 18.9855 | 22.0803 | 5.715 |  |
| primitive | marko | 5.38.39 | update every 10th in 10k rows | completed | duration | ms | 23.6447 | 7 | 22.267475999999988 | 26.49868699999979 | 23.9206 | 23.6447 | 24.4926 | 26.4987 | 1.282 |  |
| primitive | marko | 5.38.39 | select row in 10k rows | completed | duration | ms | 22.4966 | 7 | 20.374377999999524 | 34.0348699999995 | 25.2597 | 22.4966 | 32.7996 | 34.0349 | 5.3536 |  |
| primitive | marko | 5.38.39 | append 1k rows to 10k rows | completed | duration | ms | 32.6296 | 7 | 30.979307999999946 | 41.52732999999989 | 35.2689 | 32.6296 | 40.2755 | 41.5273 | 4.3814 |  |
| primitive | marko | 5.38.39 | remove row from 1k rows | completed | duration | ms | 0.688 | 7 | 0.6211769999999888 | 1.003686000000016 | 0.729 | 0.688 | 0.8236 | 1.0037 | 0.1288 |  |
| primitive | marko | 5.38.39 | clear 10k rows | completed | duration | ms | 36.9947 | 7 | 35.61834599999929 | 49.41294999999991 | 38.6367 | 36.9947 | 37.6216 | 49.4129 | 4.4449 |  |
| primitive | marko | 5.38.39 | keyed reverse 1k rows | completed | duration | ms | 3.6062 | 7 | 3.4489009999997506 | 4.426908999999796 | 3.6899 | 3.6062 | 3.7783 | 4.4269 | 0.3193 |  |
| primitive | marko | 5.38.39 | text binding update 1k | completed | duration | ms | 0.9836 | 7 | 0.8195900000009715 | 1.57028100000025 | 1.0311 | 0.9836 | 1.0459 | 1.5703 | 0.2326 |  |
| primitive | marko | 5.38.39 | computed fan-out 1k | completed | duration | ms | 0.8099 | 7 | 0.7546989999991638 | 1.0322800000012649 | 0.8408 | 0.8099 | 0.9346 | 1.0323 | 0.0962 |  |
| primitive | marko | 5.38.39 | computed fan-in 1k | completed | duration | ms | 0.0169 | 7 | 0.016030000000682776 | 0.019566999999369727 | 0.0174 | 0.0169 | 0.0186 | 0.0196 | 0.0012 |  |
| primitive | marko | 5.38.39 | repeated create update clear memory | completed | memory | bytes | 48821512 | 7 | 42226488 | 49820656 | 46515166.8571 | 48821512 | 49792088 | 49820656 | 3275313.1387 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | qwik | 1.19.2 | create 1k rows | completed | duration | ms | 7.2288 | 7 | 6.405829000001177 | 18.06705300000067 | 9.8737 | 7.2288 | 14.5589 | 18.0671 | 4.2953 |  |
| primitive | qwik | 1.19.2 | replace all 1k rows | completed | duration | ms | 17.5787 | 7 | 8.192345999999816 | 25.324921999999788 | 15.5301 | 17.5787 | 20.9537 | 25.3249 | 6.3296 |  |
| primitive | qwik | 1.19.2 | update every 10th in 10k rows | completed | duration | ms | 67.4396 | 7 | 58.712077000000136 | 79.06558700000096 | 67.9529 | 67.4396 | 73.7128 | 79.0656 | 6.9428 |  |
| primitive | qwik | 1.19.2 | select row in 10k rows | completed | duration | ms | 67.0644 | 7 | 56.61511600000085 | 70.44613899999968 | 64.8672 | 67.0644 | 68.8775 | 70.4461 | 4.7886 |  |
| primitive | qwik | 1.19.2 | append 1k rows to 10k rows | completed | duration | ms | 76.5135 | 7 | 72.79217900000003 | 86.44279300000198 | 77.0581 | 76.5135 | 77.7765 | 86.4428 | 4.155 |  |
| primitive | qwik | 1.19.2 | remove row from 1k rows | completed | duration | ms | 2.4173 | 7 | 2.3486940000002505 | 12.116300000001502 | 3.9514 | 2.4173 | 3.4994 | 12.1163 | 3.3546 |  |
| primitive | qwik | 1.19.2 | clear 10k rows | completed | duration | ms | 38.2824 | 7 | 31.615476000002673 | 87.77017899999919 | 45.2473 | 38.2824 | 49.7086 | 87.7702 | 18.167 |  |
| primitive | qwik | 1.19.2 | keyed reverse 1k rows | completed | duration | ms | 4.9085 | 7 | 4.711414000001241 | 6.098821999999927 | 5.1556 | 4.9085 | 5.5934 | 6.0988 | 0.484 |  |
| primitive | qwik | 1.19.2 | text binding update 1k | completed | duration | ms | 1.0459 | 7 | 0.9355179999984102 | 1.1580159999975876 | 1.0454 | 1.0459 | 1.1139 | 1.158 | 0.0774 |  |
| primitive | qwik | 1.19.2 | computed fan-out 1k | completed | duration | ms | 1.0299 | 7 | 0.939355999998952 | 9.201724000002287 | 2.1974 | 1.0299 | 1.1971 | 9.2017 | 2.8605 |  |
| primitive | qwik | 1.19.2 | computed fan-in 1k | completed | duration | ms | 0.0137 | 7 | 0.012374000001727836 | 0.016701000000466593 | 0.0139 | 0.0137 | 0.0152 | 0.0167 | 0.0015 |  |
| primitive | qwik | 1.19.2 | repeated create update clear memory | completed | memory | bytes | 104143208 | 7 | 0 | 114655384 | 89590489.1429 | 104143208 | 106001456 | 114655384 | 36967925.7938 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | react | 19.2.6 | create 1k rows | completed | duration | ms | 7.2473 | 7 | 4.411621000002924 | 14.747404999998253 | 8.7019 | 7.2473 | 12.8617 | 14.7474 | 4.0566 |  |
| primitive | react | 19.2.6 | replace all 1k rows | completed | duration | ms | 7.4162 | 7 | 7.076769999999669 | 18.96281699999963 | 9.0459 | 7.4162 | 7.766 | 18.9628 | 4.0546 |  |
| primitive | react | 19.2.6 | update every 10th in 10k rows | completed | duration | ms | 3.0245 | 7 | 2.6473450000012235 | 5.28662500000064 | 3.5396 | 3.0245 | 4.552 | 5.2866 | 0.9348 |  |
| primitive | react | 19.2.6 | select row in 10k rows | completed | duration | ms | 2.3559 | 7 | 2.0454739999986487 | 2.786857000002783 | 2.3713 | 2.3559 | 2.5489 | 2.7869 | 0.234 |  |
| primitive | react | 19.2.6 | append 1k rows to 10k rows | completed | duration | ms | 12.9523 | 7 | 7.4413039999999455 | 21.877244999999675 | 13.8966 | 12.9523 | 19.1747 | 21.8772 | 5.0453 |  |
| primitive | react | 19.2.6 | remove row from 1k rows | completed | duration | ms | 0.2727 | 7 | 0.2154450000016368 | 10.142391000001226 | 1.6733 | 0.2727 | 0.3681 | 10.1424 | 3.4579 |  |
| primitive | react | 19.2.6 | clear 10k rows | completed | duration | ms | 38.9231 | 7 | 28.86500800000067 | 108.559663 | 48.9014 | 38.9231 | 49.3231 | 108.5597 | 25.1565 |  |
| primitive | react | 19.2.6 | keyed reverse 1k rows | completed | duration | ms | 3.3721 | 7 | 3.2935099999995145 | 3.5478880000009667 | 3.3789 | 3.3721 | 3.4354 | 3.5479 | 0.0843 |  |
| primitive | react | 19.2.6 | text binding update 1k | completed | duration | ms | 0.4336 | 7 | 0.410862000000634 | 0.720474000001559 | 0.5076 | 0.4336 | 0.7088 | 0.7205 | 0.1312 |  |
| primitive | react | 19.2.6 | computed fan-out 1k | completed | duration | ms | 0.4841 | 7 | 0.39195699999982025 | 0.6030429999991611 | 0.4837 | 0.4841 | 0.5288 | 0.603 | 0.0633 |  |
| primitive | react | 19.2.6 | computed fan-in 1k | completed | duration | ms | 0.0385 | 7 | 0.036388000000442844 | 0.048109999999724096 | 0.0394 | 0.0385 | 0.0389 | 0.0481 | 0.0036 |  |
| primitive | react | 19.2.6 | repeated create update clear memory | completed | memory | bytes | 57817656 | 7 | 0 | 64855240 | 50770771.4286 | 57817656 | 60478752 | 64855240 | 20886375.3158 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | solid | 1.9.12 | create 1k rows | completed | duration | ms | 4.971 | 7 | 4.714289999999892 | 15.174509000000398 | 7.7068 | 4.971 | 14.3919 | 15.1745 | 4.4816 |  |
| primitive | solid | 1.9.12 | replace all 1k rows | completed | duration | ms | 5.9849 | 7 | 5.594775000001391 | 16.906262999997125 | 10.3985 | 5.9849 | 16.8859 | 16.9063 | 5.3474 |  |
| primitive | solid | 1.9.12 | update every 10th in 10k rows | completed | duration | ms | 78.307 | 7 | 76.07610600000044 | 184.44362900000124 | 95.9856 | 78.307 | 89.497 | 184.4436 | 36.4924 |  |
| primitive | solid | 1.9.12 | select row in 10k rows | completed | duration | ms | 33.7296 | 7 | 26.384335999999166 | 42.16153799999665 | 33.3086 | 33.7296 | 34.9943 | 42.1615 | 4.5734 |  |
| primitive | solid | 1.9.12 | append 1k rows to 10k rows | completed | duration | ms | 80.0706 | 7 | 78.94505900000149 | 249.6693090000008 | 105.7004 | 80.0706 | 91.8205 | 249.6693 | 58.9257 |  |
| primitive | solid | 1.9.12 | remove row from 1k rows | completed | duration | ms | 1.9554 | 7 | 1.9161610000010114 | 1.9889380000022356 | 1.9501 | 1.9554 | 1.962 | 1.9889 | 0.0233 |  |
| primitive | solid | 1.9.12 | clear 10k rows | completed | duration | ms | 20.1398 | 7 | 19.43217100000038 | 73.52444300000207 | 29.1763 | 20.1398 | 31.1521 | 73.5244 | 18.519 |  |
| primitive | solid | 1.9.12 | keyed reverse 1k rows | completed | duration | ms | 2.3882 | 7 | 2.3727900000012596 | 2.6747770000001765 | 2.4351 | 2.3882 | 2.4527 | 2.6748 | 0.101 |  |
| primitive | solid | 1.9.12 | text binding update 1k | completed | duration | ms | 0.1213 | 7 | 0.11327300000266405 | 0.17133199999807402 | 0.127 | 0.1213 | 0.1271 | 0.1713 | 0.0187 |  |
| primitive | solid | 1.9.12 | computed fan-out 1k | completed | duration | ms | 0.123 | 7 | 0.11583799999789335 | 0.18809400000463938 | 0.1373 | 0.123 | 0.1689 | 0.1881 | 0.0267 |  |
| primitive | solid | 1.9.12 | computed fan-in 1k | completed | duration | ms | 13.6657 | 7 | 13.114978000005067 | 18.879612999997335 | 14.4446 | 13.6657 | 14.4909 | 18.8796 | 1.8593 |  |
| primitive | solid | 1.9.12 | repeated create update clear memory | completed | memory | bytes | 49869416 | 7 | 48130656 | 58662456 | 52864801.1429 | 49869416 | 58494208 | 58662456 | 4504988.1344 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | mreact | workspace | create 1k rows | completed | duration | ms | 4.7567 | 7 | 4.3895099999936065 | 14.13698899999872 | 7.294 | 4.7567 | 13.0909 | 14.137 | 4.015 |  |
| primitive | mreact | workspace | replace all 1k rows | completed | duration | ms | 6.2796 | 7 | 5.755105999996886 | 16.10917600000539 | 10.1851 | 6.2796 | 16.023 | 16.1092 | 4.8861 |  |
| primitive | mreact | workspace | update every 10th in 10k rows | completed | duration | ms | 4.812 | 7 | 2.610635999997612 | 12.503539000004821 | 7.1389 | 4.812 | 11.9835 | 12.5035 | 4.3598 |  |
| primitive | mreact | workspace | select row in 10k rows | completed | duration | ms | 6.0926 | 7 | 4.514633999999205 | 13.123824999995122 | 7.1858 | 6.0926 | 9.4689 | 13.1238 | 2.8764 |  |
| primitive | mreact | workspace | append 1k rows to 10k rows | completed | duration | ms | 10.8626 | 7 | 10.263570000002801 | 19.24662299999909 | 14.1553 | 10.8626 | 18.8117 | 19.2466 | 4.1526 |  |
| primitive | mreact | workspace | remove row from 1k rows | completed | duration | ms | 0.2741 | 7 | 0.2040130000023055 | 0.6144150000036461 | 0.3345 | 0.2741 | 0.4475 | 0.6144 | 0.1351 |  |
| primitive | mreact | workspace | clear 10k rows | completed | duration | ms | 22.592 | 7 | 20.54189700000279 | 117.58518499999627 | 37.0317 | 22.592 | 31.1975 | 117.5852 | 33.0555 |  |
| primitive | mreact | workspace | keyed reverse 1k rows | completed | duration | ms | 1.7233 | 7 | 1.6373579999999492 | 1.916272000002209 | 1.7318 | 1.7233 | 1.7478 | 1.9163 | 0.0835 |  |
| primitive | mreact | workspace | text binding update 1k | completed | duration | ms | 0.1277 | 7 | 0.11982500000158325 | 0.18104999999923166 | 0.1385 | 0.1277 | 0.1661 | 0.181 | 0.0228 |  |
| primitive | mreact | workspace | computed fan-out 1k | completed | duration | ms | 0.1311 | 7 | 0.12181899999995949 | 0.194575999994413 | 0.1392 | 0.1311 | 0.1381 | 0.1946 | 0.023 |  |
| primitive | mreact | workspace | computed fan-in 1k | completed | duration | ms | 0.1016 | 7 | 0.07594199999584816 | 0.5111099999994622 | 0.1827 | 0.1016 | 0.2573 | 0.5111 | 0.1463 |  |
| primitive | mreact | workspace | repeated create update clear memory | completed | memory | bytes | 50032720 | 7 | 44503200 | 50478360 | 47869040 | 50032720 | 50346776 | 50478360 | 2775019.7165 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
