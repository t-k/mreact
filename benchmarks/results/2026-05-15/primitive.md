# Primitive Benchmark

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
  - marko: 5.38.39
  - react: 19.2.6
  - react-dom: 19.2.6
  - solid-js: 1.9.12

## Rankings

### create 1k rows

Creates 1,000 DOM rows from an empty host and validates the final DOM.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | create 1k rows | 4.0322 | ms |
| 2 | react | create 1k rows | 4.3059 | ms |
| 3 | solid | create 1k rows | 4.3501 | ms |
| 4 | qwik | create 1k rows | 6.3339 | ms |
| 5 | marko | create 1k rows | 9.2572 | ms |

### replace all 1k rows

Replaces an existing 1,000-row keyed list with a fresh 1,000-row dataset.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | solid | replace all 1k rows | 5.2563 | ms |
| 2 | mreact | replace all 1k rows | 6.414 | ms |
| 3 | marko | replace all 1k rows | 7.9793 | ms |
| 4 | qwik | replace all 1k rows | 8.3551 | ms |
| 5 | react | replace all 1k rows | 9.1359 | ms |

### update every 10th in 10k rows

Updates the text of every tenth row in a 10,000-row keyed list while preserving the existing row nodes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | update every 10th in 10k rows | 2.7167 | ms |
| 2 | react | update every 10th in 10k rows | 3.3611 | ms |
| 3 | marko | update every 10th in 10k rows | 22.7564 | ms |
| 4 | qwik | update every 10th in 10k rows | 66.0901 | ms |
| 5 | solid | update every 10th in 10k rows | 77.9176 | ms |

### select row in 10k rows

Selects one row in a 10,000-row list by toggling selection attributes without changing row text.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | select row in 10k rows | 0.0977 | ms |
| 2 | react | select row in 10k rows | 2.5685 | ms |
| 3 | marko | select row in 10k rows | 22.2369 | ms |
| 4 | solid | select row in 10k rows | 30.0031 | ms |
| 5 | qwik | select row in 10k rows | 66.2608 | ms |

### append 1k rows to 10k rows

Appends 1,000 keyed rows to an existing 10,000-row list and validates the 11,000-row DOM.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | append 1k rows to 10k rows | 9.9213 | ms |
| 2 | react | append 1k rows to 10k rows | 14.2756 | ms |
| 3 | marko | append 1k rows to 10k rows | 31.724 | ms |
| 4 | qwik | append 1k rows to 10k rows | 73.6619 | ms |
| 5 | solid | append 1k rows to 10k rows | 81.0767 | ms |

### remove row from 1k rows

Removes one keyed row from the middle of an existing 1,000-row list.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | remove row from 1k rows | 0.1695 | ms |
| 2 | react | remove row from 1k rows | 0.1763 | ms |
| 3 | marko | remove row from 1k rows | 0.5801 | ms |
| 4 | solid | remove row from 1k rows | 1.8152 | ms |
| 5 | qwik | remove row from 1k rows | 2.505 | ms |

### clear 10k rows

Clears an existing 10,000-row list and validates that no row elements remain.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | clear 10k rows | 18.6413 | ms |
| 2 | solid | clear 10k rows | 18.8938 | ms |
| 3 | qwik | clear 10k rows | 32.4937 | ms |
| 4 | react | clear 10k rows | 35.827 | ms |
| 5 | marko | clear 10k rows | 40.0206 | ms |

### keyed reverse 1k rows

Reverses 1,000 keyed rows and verifies that DOM node identity is preserved.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | keyed reverse 1k rows | 1.5705 | ms |
| 2 | solid | keyed reverse 1k rows | 2.3799 | ms |
| 3 | react | keyed reverse 1k rows | 3.0997 | ms |
| 4 | marko | keyed reverse 1k rows | 3.7635 | ms |
| 5 | qwik | keyed reverse 1k rows | 4.8388 | ms |

### text binding update 1k

Updates one reactive text value that is bound to 1,000 text nodes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | text binding update 1k | 0.1204 | ms |
| 2 | solid | text binding update 1k | 0.1213 | ms |
| 3 | react | text binding update 1k | 0.5458 | ms |
| 4 | qwik | text binding update 1k | 0.9969 | ms |
| 5 | marko | text binding update 1k | 1.0197 | ms |

### computed fan-out 1k

Updates one source value that fans out through a derived value into 1,000 displayed text nodes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | solid | computed fan-out 1k | 0.1072 | ms |
| 2 | mreact | computed fan-out 1k | 0.1205 | ms |
| 3 | react | computed fan-out 1k | 0.4144 | ms |
| 4 | marko | computed fan-out 1k | 0.9477 | ms |
| 5 | qwik | computed fan-out 1k | 0.9953 | ms |

### computed fan-in 1k

Updates 1,000 source values and validates one derived aggregate text output.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | qwik | computed fan-in 1k | 0.0128 | ms |
| 2 | marko | computed fan-in 1k | 0.0176 | ms |
| 3 | react | computed fan-in 1k | 0.0317 | ms |
| 4 | mreact | computed fan-in 1k | 0.0642 | ms |
| 5 | solid | computed fan-in 1k | 12.9359 | ms |

### repeated create update clear memory

Reports heap growth after repeatedly creating, updating, and clearing 1,000-row lists.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | react | repeated create update clear memory | 12873224 | bytes |
| 2 | qwik | repeated create update clear memory | 19685208 | bytes |
| 3 | marko | repeated create update clear memory | 44395536 | bytes |
| 4 | mreact | repeated create update clear memory | 46904704 | bytes |
| 5 | solid | repeated create update clear memory | 50808736 | bytes |

## Results

| suite | framework | version | case | status | metric | unit | value | sample count | min | max | mean | median | p75 | p95 | standard deviation | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| primitive | marko | 5.38.39 | create 1k rows | completed | duration | ms | 9.2572 | 15 | 5.987761999999975 | 41.13780399999996 | 12.6595 | 9.2572 | 16.992 | 41.1378 | 8.782 |  |
| primitive | marko | 5.38.39 | replace all 1k rows | completed | duration | ms | 7.9793 | 15 | 7.305145000000039 | 41.05930599999988 | 12.5106 | 7.9793 | 18.3137 | 41.0593 | 8.8741 |  |
| primitive | marko | 5.38.39 | update every 10th in 10k rows | completed | duration | ms | 22.7564 | 15 | 21.542712000000392 | 25.680749000000105 | 23.1506 | 22.7564 | 24.2545 | 25.6807 | 1.3396 |  |
| primitive | marko | 5.38.39 | select row in 10k rows | completed | duration | ms | 22.2369 | 15 | 20.566031000000294 | 25.825071000001117 | 22.4743 | 22.2369 | 22.7496 | 25.8251 | 1.4007 |  |
| primitive | marko | 5.38.39 | append 1k rows to 10k rows | completed | duration | ms | 31.724 | 15 | 28.58369799999855 | 46.09911999999895 | 34.4897 | 31.724 | 39.0372 | 46.0991 | 5.041 |  |
| primitive | marko | 5.38.39 | remove row from 1k rows | completed | duration | ms | 0.5801 | 15 | 0.5534329999991314 | 1.3120019999987562 | 0.6602 | 0.5801 | 0.7063 | 1.312 | 0.1859 |  |
| primitive | marko | 5.38.39 | clear 10k rows | completed | duration | ms | 40.0206 | 15 | 37.284121000000596 | 49.33418499999971 | 40.6965 | 40.0206 | 41.1372 | 49.3342 | 3.2076 |  |
| primitive | marko | 5.38.39 | keyed reverse 1k rows | completed | duration | ms | 3.7635 | 15 | 3.6020270000008168 | 16.75017999999909 | 4.6323 | 3.7635 | 3.8761 | 16.7502 | 3.2401 |  |
| primitive | marko | 5.38.39 | text binding update 1k | completed | duration | ms | 1.0197 | 15 | 0.8542090000009921 | 1.5543189999989409 | 1.095 | 1.0197 | 1.1284 | 1.5543 | 0.2099 |  |
| primitive | marko | 5.38.39 | computed fan-out 1k | completed | duration | ms | 0.9477 | 15 | 0.834262000000308 | 1.7170450000012352 | 1.0505 | 0.9477 | 1.1064 | 1.717 | 0.2429 |  |
| primitive | marko | 5.38.39 | computed fan-in 1k | completed | duration | ms | 0.0176 | 15 | 0.01558899999872665 | 0.04685899999822141 | 0.02 | 0.0176 | 0.0193 | 0.0469 | 0.0075 |  |
| primitive | marko | 5.38.39 | repeated create update clear memory | completed | memory | bytes | 44395536 | 15 | 0 | 58331352 | 29600483.7333 | 44395536 | 50570960 | 58331352 | 24360033.7853 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | qwik | 1.19.2 | create 1k rows | completed | duration | ms | 6.3339 | 15 | 5.223932999997487 | 8.469468000002962 | 6.3174 | 6.3339 | 7.0437 | 8.4695 | 0.9932 |  |
| primitive | qwik | 1.19.2 | replace all 1k rows | completed | duration | ms | 8.3551 | 15 | 7.900745999999344 | 9.6853689999989 | 8.3872 | 8.3551 | 8.5619 | 9.6854 | 0.4321 |  |
| primitive | qwik | 1.19.2 | update every 10th in 10k rows | completed | duration | ms | 66.0901 | 15 | 56.427027999998245 | 76.64447199999995 | 65.2099 | 66.0901 | 71.9429 | 76.6445 | 7.2518 |  |
| primitive | qwik | 1.19.2 | select row in 10k rows | completed | duration | ms | 66.2608 | 15 | 55.78470700000253 | 77.53544800000236 | 65.9745 | 66.2608 | 69.2919 | 77.5354 | 5.5415 |  |
| primitive | qwik | 1.19.2 | append 1k rows to 10k rows | completed | duration | ms | 73.6619 | 15 | 63.092454999998154 | 82.9856559999971 | 74.6983 | 73.6619 | 79.5814 | 82.9857 | 5.6821 |  |
| primitive | qwik | 1.19.2 | remove row from 1k rows | completed | duration | ms | 2.505 | 15 | 2.283883000003698 | 13.215269000000262 | 6.0066 | 2.505 | 10.9311 | 13.2153 | 4.4593 |  |
| primitive | qwik | 1.19.2 | clear 10k rows | completed | duration | ms | 32.4937 | 15 | 29.869118000002345 | 45.595397000004596 | 33.1383 | 32.4937 | 34.2676 | 45.5954 | 3.62 |  |
| primitive | qwik | 1.19.2 | keyed reverse 1k rows | completed | duration | ms | 4.8388 | 15 | 4.358792999999423 | 15.475618000004033 | 6.2873 | 4.8388 | 6.1566 | 15.4756 | 3.2156 |  |
| primitive | qwik | 1.19.2 | text binding update 1k | completed | duration | ms | 0.9969 | 15 | 0.8974210000014864 | 1.3382820000042557 | 1.0266 | 0.9969 | 1.0977 | 1.3383 | 0.1064 |  |
| primitive | qwik | 1.19.2 | computed fan-out 1k | completed | duration | ms | 0.9953 | 15 | 0.8667440000062925 | 9.216175000001385 | 2.0485 | 0.9953 | 1.0868 | 9.2162 | 2.7337 |  |
| primitive | qwik | 1.19.2 | computed fan-in 1k | completed | duration | ms | 0.0128 | 15 | 0.011711999999533873 | 0.015099000003829133 | 0.0127 | 0.0128 | 0.0128 | 0.0151 | 0.0007 |  |
| primitive | qwik | 1.19.2 | repeated create update clear memory | completed | memory | bytes | 19685208 | 15 | 0 | 27662368 | 14196856.5333 | 19685208 | 27658216 | 27662368 | 13417385.2772 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | qwik-v2 | 2.0.0-beta.35 | create 1k rows | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | qwik-v2 | 2.0.0-beta.35 | replace all 1k rows | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | qwik-v2 | 2.0.0-beta.35 | update every 10th in 10k rows | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | qwik-v2 | 2.0.0-beta.35 | select row in 10k rows | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | qwik-v2 | 2.0.0-beta.35 | append 1k rows to 10k rows | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | qwik-v2 | 2.0.0-beta.35 | remove row from 1k rows | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | qwik-v2 | 2.0.0-beta.35 | clear 10k rows | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | qwik-v2 | 2.0.0-beta.35 | keyed reverse 1k rows | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | qwik-v2 | 2.0.0-beta.35 | text binding update 1k | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | qwik-v2 | 2.0.0-beta.35 | computed fan-out 1k | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | qwik-v2 | 2.0.0-beta.35 | computed fan-in 1k | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | qwik-v2 | 2.0.0-beta.35 | repeated create update clear memory | unsupported | memory | bytes | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | create 1k rows | completed | duration | ms | 4.3059 | 15 | 3.8312090000035823 | 9.365245000000868 | 5.3929 | 4.3059 | 8.3449 | 9.3652 | 2.0408 |  |
| primitive | react | 19.2.6 | replace all 1k rows | completed | duration | ms | 9.1359 | 15 | 6.482914000000164 | 10.65366200000426 | 8.2681 | 9.1359 | 9.7321 | 10.6537 | 1.5178 |  |
| primitive | react | 19.2.6 | update every 10th in 10k rows | completed | duration | ms | 3.3611 | 15 | 2.7282300000006217 | 17.364957999998296 | 7.3403 | 3.3611 | 13.5726 | 17.365 | 5.4609 |  |
| primitive | react | 19.2.6 | select row in 10k rows | completed | duration | ms | 2.5685 | 15 | 1.831570999995165 | 14.8814579999962 | 4.1424 | 2.5685 | 4.3981 | 14.8815 | 3.5333 |  |
| primitive | react | 19.2.6 | append 1k rows to 10k rows | completed | duration | ms | 14.2756 | 15 | 7.832116000005044 | 20.005211000003328 | 14.0256 | 14.2756 | 17.8365 | 20.0052 | 4.2595 |  |
| primitive | react | 19.2.6 | remove row from 1k rows | completed | duration | ms | 0.1763 | 15 | 0.16620400000101654 | 0.45255200000246987 | 0.1992 | 0.1763 | 0.1874 | 0.4526 | 0.0701 |  |
| primitive | react | 19.2.6 | clear 10k rows | completed | duration | ms | 35.827 | 15 | 30.96445899999526 | 130.34994899999583 | 42.1496 | 35.827 | 37.4955 | 130.3499 | 23.7644 |  |
| primitive | react | 19.2.6 | keyed reverse 1k rows | completed | duration | ms | 3.0997 | 15 | 3.0720280000023195 | 3.727273000004061 | 3.1755 | 3.0997 | 3.1293 | 3.7273 | 0.1774 |  |
| primitive | react | 19.2.6 | text binding update 1k | completed | duration | ms | 0.5458 | 15 | 0.3587959999931627 | 0.9311849999940023 | 0.5864 | 0.5458 | 0.7205 | 0.9312 | 0.1685 |  |
| primitive | react | 19.2.6 | computed fan-out 1k | completed | duration | ms | 0.4144 | 15 | 0.3238100000016857 | 0.7358969999986584 | 0.4662 | 0.4144 | 0.5533 | 0.7359 | 0.1181 |  |
| primitive | react | 19.2.6 | computed fan-in 1k | completed | duration | ms | 0.0317 | 15 | 0.029525999998440966 | 0.11548799999582116 | 0.0373 | 0.0317 | 0.0324 | 0.1155 | 0.021 |  |
| primitive | react | 19.2.6 | repeated create update clear memory | completed | memory | bytes | 12873224 | 15 | 0 | 13921584 | 9469780.8 | 12873224 | 13820296 | 13921584 | 5316852.8898 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | solid | 1.9.12 | create 1k rows | completed | duration | ms | 4.3501 | 15 | 4.126324000004388 | 14.455125000000407 | 6.5699 | 4.3501 | 8.7717 | 14.4551 | 3.8954 |  |
| primitive | solid | 1.9.12 | replace all 1k rows | completed | duration | ms | 5.2563 | 15 | 4.752695000002859 | 18.233774000000267 | 8.113 | 5.2563 | 14.5613 | 18.2338 | 4.8593 |  |
| primitive | solid | 1.9.12 | update every 10th in 10k rows | completed | duration | ms | 77.9176 | 15 | 72.32782999999472 | 198.29318699999567 | 86.6594 | 77.9176 | 85.3762 | 198.2932 | 30.2679 |  |
| primitive | solid | 1.9.12 | select row in 10k rows | completed | duration | ms | 30.0031 | 15 | 24.327805000000808 | 37.132268000001204 | 30.3846 | 30.0031 | 32.0459 | 37.1323 | 3.3444 |  |
| primitive | solid | 1.9.12 | append 1k rows to 10k rows | completed | duration | ms | 81.0767 | 15 | 76.21139499999845 | 220.68854499999725 | 90.9089 | 81.0767 | 86.9495 | 220.6885 | 34.931 |  |
| primitive | solid | 1.9.12 | remove row from 1k rows | completed | duration | ms | 1.8152 | 15 | 1.7604770000034478 | 10.485475000001315 | 2.4091 | 1.8152 | 1.8553 | 10.4855 | 2.1591 |  |
| primitive | solid | 1.9.12 | clear 10k rows | completed | duration | ms | 18.8938 | 15 | 16.888779000000795 | 74.52360399999452 | 24.3677 | 18.8938 | 27.1179 | 74.5236 | 14.0049 |  |
| primitive | solid | 1.9.12 | keyed reverse 1k rows | completed | duration | ms | 2.3799 | 15 | 2.211656999999832 | 4.907155000000785 | 3.1662 | 2.3799 | 4.7219 | 4.9072 | 1.1419 |  |
| primitive | solid | 1.9.12 | text binding update 1k | completed | duration | ms | 0.1213 | 15 | 0.10275299999921117 | 0.23990200000116602 | 0.1225 | 0.1213 | 0.1223 | 0.2399 | 0.0331 |  |
| primitive | solid | 1.9.12 | computed fan-out 1k | completed | duration | ms | 0.1072 | 15 | 0.10279399999853922 | 0.22237899999890942 | 0.1192 | 0.1072 | 0.1205 | 0.2224 | 0.0297 |  |
| primitive | solid | 1.9.12 | computed fan-in 1k | completed | duration | ms | 12.9359 | 15 | 12.665601999993669 | 21.17627700000594 | 13.6869 | 12.9359 | 13.1818 | 21.1763 | 2.1615 |  |
| primitive | solid | 1.9.12 | repeated create update clear memory | completed | memory | bytes | 50808736 | 15 | 50209720 | 58922568 | 53002412.2667 | 50808736 | 58383808 | 58922568 | 3388052.1976 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | mreact | workspace | create 1k rows | completed | duration | ms | 4.0322 | 15 | 3.856395999995584 | 8.951906000002054 | 4.6084 | 4.0322 | 4.9085 | 8.9519 | 1.2757 |  |
| primitive | mreact | workspace | replace all 1k rows | completed | duration | ms | 6.414 | 15 | 4.570801999994728 | 16.089031999996223 | 8.8944 | 6.414 | 12.059 | 16.089 | 3.9003 |  |
| primitive | mreact | workspace | update every 10th in 10k rows | completed | duration | ms | 2.7167 | 15 | 1.847009999997681 | 3.6092500000086147 | 2.6682 | 2.7167 | 2.9412 | 3.6093 | 0.4998 |  |
| primitive | mreact | workspace | select row in 10k rows | completed | duration | ms | 0.0977 | 15 | 0.08264500000223052 | 0.17231500000343658 | 0.1028 | 0.0977 | 0.0997 | 0.1723 | 0.0228 |  |
| primitive | mreact | workspace | append 1k rows to 10k rows | completed | duration | ms | 9.9213 | 15 | 9.6081520000007 | 22.366749000007985 | 11.7043 | 9.9213 | 10.7598 | 22.3667 | 3.8273 |  |
| primitive | mreact | workspace | remove row from 1k rows | completed | duration | ms | 0.1695 | 15 | 0.14405099999567028 | 0.9978089999931399 | 0.2295 | 0.1695 | 0.2031 | 0.9978 | 0.2068 |  |
| primitive | mreact | workspace | clear 10k rows | completed | duration | ms | 18.6413 | 15 | 17.490451000005123 | 26.211041000002297 | 19.1654 | 18.6413 | 19.2734 | 26.211 | 1.9927 |  |
| primitive | mreact | workspace | keyed reverse 1k rows | completed | duration | ms | 1.5705 | 15 | 1.5281390000018291 | 10.478511000008439 | 2.1602 | 1.5705 | 1.5968 | 10.4785 | 2.2233 |  |
| primitive | mreact | workspace | text binding update 1k | completed | duration | ms | 0.1204 | 15 | 0.11038800000096671 | 8.885980999999447 | 0.7497 | 0.1204 | 0.155 | 8.886 | 2.1786 |  |
| primitive | mreact | workspace | computed fan-out 1k | completed | duration | ms | 0.1205 | 15 | 0.11432599999534432 | 0.15161600000283215 | 0.1236 | 0.1205 | 0.1285 | 0.1516 | 0.0093 |  |
| primitive | mreact | workspace | computed fan-in 1k | completed | duration | ms | 0.0642 | 15 | 0.056706999996094964 | 0.4066460000030929 | 0.09 | 0.0642 | 0.0796 | 0.4066 | 0.0851 |  |
| primitive | mreact | workspace | repeated create update clear memory | completed | memory | bytes | 46904704 | 15 | 9649440 | 48193520 | 43179314.6667 | 46904704 | 47736672 | 48193520 | 9227540.1496 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
