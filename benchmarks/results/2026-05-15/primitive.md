# Primitive Benchmark

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
  - react: 19.2.6
  - react-dom: 19.2.6
  - solid-js: 1.9.12

## Rankings

### create 1k rows

Creates 1,000 DOM rows from an empty host and validates the final DOM.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | create 1k rows | 4.6469 | ms |
| 2 | solid | create 1k rows | 4.94 | ms |
| 3 | qwik | create 1k rows | 6.7499 | ms |
| 4 | react | create 1k rows | 8.2619 | ms |
| 5 | marko | create 1k rows | 9.6075 | ms |

### replace all 1k rows

Replaces an existing 1,000-row keyed list with a fresh 1,000-row dataset.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | solid | replace all 1k rows | 5.7409 | ms |
| 2 | react | replace all 1k rows | 7.3926 | ms |
| 3 | mreact | replace all 1k rows | 7.8313 | ms |
| 4 | marko | replace all 1k rows | 8.9874 | ms |
| 5 | qwik | replace all 1k rows | 9.0848 | ms |

### update every 10th in 10k rows

Updates the text of every tenth row in a 10,000-row keyed list while preserving the existing row nodes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | update every 10th in 10k rows | 2.8683 | ms |
| 2 | react | update every 10th in 10k rows | 3.6297 | ms |
| 3 | marko | update every 10th in 10k rows | 24.3186 | ms |
| 4 | qwik | update every 10th in 10k rows | 65.8186 | ms |
| 5 | solid | update every 10th in 10k rows | 84.3767 | ms |

### select row in 10k rows

Selects one row in a 10,000-row list by toggling selection attributes without changing row text.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | select row in 10k rows | 0.0958 | ms |
| 2 | react | select row in 10k rows | 2.4499 | ms |
| 3 | marko | select row in 10k rows | 22.0727 | ms |
| 4 | solid | select row in 10k rows | 33.1982 | ms |
| 5 | qwik | select row in 10k rows | 71.1647 | ms |

### append 1k rows to 10k rows

Appends 1,000 keyed rows to an existing 10,000-row list and validates the 11,000-row DOM.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | react | append 1k rows to 10k rows | 8.1943 | ms |
| 2 | mreact | append 1k rows to 10k rows | 18.3991 | ms |
| 3 | marko | append 1k rows to 10k rows | 35.4659 | ms |
| 4 | qwik | append 1k rows to 10k rows | 72.6741 | ms |
| 5 | solid | append 1k rows to 10k rows | 82.8961 | ms |

### remove row from 1k rows

Removes one keyed row from the middle of an existing 1,000-row list.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | remove row from 1k rows | 0.1778 | ms |
| 2 | react | remove row from 1k rows | 0.1969 | ms |
| 3 | marko | remove row from 1k rows | 0.6465 | ms |
| 4 | solid | remove row from 1k rows | 1.8367 | ms |
| 5 | qwik | remove row from 1k rows | 2.9376 | ms |

### clear 10k rows

Clears an existing 10,000-row list and validates that no row elements remain.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | solid | clear 10k rows | 19.7115 | ms |
| 2 | mreact | clear 10k rows | 20.802 | ms |
| 3 | react | clear 10k rows | 35.0636 | ms |
| 4 | qwik | clear 10k rows | 37.6606 | ms |
| 5 | marko | clear 10k rows | 40.6993 | ms |

### keyed reverse 1k rows

Reverses 1,000 keyed rows and verifies that DOM node identity is preserved.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | keyed reverse 1k rows | 1.5354 | ms |
| 2 | solid | keyed reverse 1k rows | 2.3139 | ms |
| 3 | react | keyed reverse 1k rows | 3.229 | ms |
| 4 | marko | keyed reverse 1k rows | 3.6855 | ms |
| 5 | qwik | keyed reverse 1k rows | 5.3191 | ms |

### text binding update 1k

Updates one reactive text value that is bound to 1,000 text nodes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | solid | text binding update 1k | 0.1206 | ms |
| 2 | mreact | text binding update 1k | 0.1271 | ms |
| 3 | react | text binding update 1k | 0.4324 | ms |
| 4 | marko | text binding update 1k | 0.8957 | ms |
| 5 | qwik | text binding update 1k | 1.1357 | ms |

### computed fan-out 1k

Updates one source value that fans out through a derived value into 1,000 displayed text nodes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | computed fan-out 1k | 0.1179 | ms |
| 2 | solid | computed fan-out 1k | 0.1217 | ms |
| 3 | react | computed fan-out 1k | 0.4051 | ms |
| 4 | marko | computed fan-out 1k | 0.8172 | ms |
| 5 | qwik | computed fan-out 1k | 0.9368 | ms |

### computed fan-in 1k

Updates 1,000 source values and validates one derived aggregate text output.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | qwik | computed fan-in 1k | 0.0138 | ms |
| 2 | marko | computed fan-in 1k | 0.0174 | ms |
| 3 | react | computed fan-in 1k | 0.0368 | ms |
| 4 | mreact | computed fan-in 1k | 0.0755 | ms |
| 5 | solid | computed fan-in 1k | 12.6446 | ms |

### repeated create update clear memory

Reports heap growth after repeatedly creating, updating, and clearing 1,000-row lists.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko | repeated create update clear memory | 44518816 | bytes |
| 2 | mreact | repeated create update clear memory | 46081712 | bytes |
| 3 | solid | repeated create update clear memory | 52887368 | bytes |
| 4 | react | repeated create update clear memory | 58117056 | bytes |
| 5 | qwik | repeated create update clear memory | 99180848 | bytes |

## Results

| suite | framework | version | case | status | metric | unit | value | sample count | min | max | mean | median | p75 | p95 | standard deviation | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| primitive | marko | 5.38.39 | create 1k rows | completed | duration | ms | 9.6075 | 7 | 8.646314999999959 | 15.349386999999979 | 10.656 | 9.6075 | 13.1709 | 15.3494 | 2.3966 |  |
| primitive | marko | 5.38.39 | replace all 1k rows | completed | duration | ms | 8.9874 | 7 | 7.252948999999944 | 22.152057000000013 | 13.2743 | 8.9874 | 22.123 | 22.1521 | 6.4235 |  |
| primitive | marko | 5.38.39 | update every 10th in 10k rows | completed | duration | ms | 24.3186 | 7 | 23.980903000000126 | 28.025124000000233 | 25.1855 | 24.3186 | 26.127 | 28.0251 | 1.3848 |  |
| primitive | marko | 5.38.39 | select row in 10k rows | completed | duration | ms | 22.0727 | 7 | 20.94326799999999 | 23.454541000000063 | 22.2762 | 22.0727 | 23.3638 | 23.4545 | 0.8177 |  |
| primitive | marko | 5.38.39 | append 1k rows to 10k rows | completed | duration | ms | 35.4659 | 7 | 30.284332000000177 | 42.846175000000585 | 36.8973 | 35.4659 | 42.5157 | 42.8462 | 4.9605 |  |
| primitive | marko | 5.38.39 | remove row from 1k rows | completed | duration | ms | 0.6465 | 7 | 0.5743019999999888 | 0.8212280000007013 | 0.6789 | 0.6465 | 0.8093 | 0.8212 | 0.093 |  |
| primitive | marko | 5.38.39 | clear 10k rows | completed | duration | ms | 40.6993 | 7 | 37.60361499999999 | 50.95952500000021 | 41.5282 | 40.6993 | 40.8825 | 50.9595 | 3.9956 |  |
| primitive | marko | 5.38.39 | keyed reverse 1k rows | completed | duration | ms | 3.6855 | 7 | 3.4810400000005757 | 3.952729000000545 | 3.6661 | 3.6855 | 3.7309 | 3.9527 | 0.1498 |  |
| primitive | marko | 5.38.39 | text binding update 1k | completed | duration | ms | 0.8957 | 7 | 0.8070709999992687 | 0.9601700000002893 | 0.8832 | 0.8957 | 0.9284 | 0.9602 | 0.0556 |  |
| primitive | marko | 5.38.39 | computed fan-out 1k | completed | duration | ms | 0.8172 | 7 | 0.7367579999990994 | 1.026003999999375 | 0.8263 | 0.8172 | 0.8258 | 1.026 | 0.0865 |  |
| primitive | marko | 5.38.39 | computed fan-in 1k | completed | duration | ms | 0.0174 | 7 | 0.015618999999787775 | 0.019315999999889755 | 0.0176 | 0.0174 | 0.0189 | 0.0193 | 0.0014 |  |
| primitive | marko | 5.38.39 | repeated create update clear memory | completed | memory | bytes | 44518816 | 7 | 0 | 49823144 | 39723926.8571 | 44518816 | 49714104 | 49823144 | 16484273.487 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | qwik | 1.19.2 | create 1k rows | completed | duration | ms | 6.7499 | 7 | 5.727553999999145 | 16.725510000000213 | 9.2241 | 6.7499 | 15.7229 | 16.7255 | 4.4481 |  |
| primitive | qwik | 1.19.2 | replace all 1k rows | completed | duration | ms | 9.0848 | 7 | 8.1767490000002 | 17.764067000000068 | 11.454 | 9.0848 | 17.5857 | 17.7641 | 3.9621 |  |
| primitive | qwik | 1.19.2 | update every 10th in 10k rows | completed | duration | ms | 65.8186 | 7 | 60.15987200000018 | 73.14661700000033 | 65.8618 | 65.8186 | 68.6256 | 73.1466 | 3.8729 |  |
| primitive | qwik | 1.19.2 | select row in 10k rows | completed | duration | ms | 71.1647 | 7 | 61.05170299999918 | 80.4001960000005 | 69.3893 | 71.1647 | 75.2334 | 80.4002 | 6.7661 |  |
| primitive | qwik | 1.19.2 | append 1k rows to 10k rows | completed | duration | ms | 72.6741 | 7 | 69.87079200000153 | 88.62125800000103 | 75.6713 | 72.6741 | 78.9955 | 88.6213 | 6.1242 |  |
| primitive | qwik | 1.19.2 | remove row from 1k rows | completed | duration | ms | 2.9376 | 7 | 2.5682699999997567 | 6.301945999999589 | 3.3212 | 2.9376 | 3.0158 | 6.3019 | 1.2278 |  |
| primitive | qwik | 1.19.2 | clear 10k rows | completed | duration | ms | 37.6606 | 7 | 33.190638000000035 | 88.15014000000156 | 46.0862 | 37.6606 | 50.1899 | 88.1501 | 17.9975 |  |
| primitive | qwik | 1.19.2 | keyed reverse 1k rows | completed | duration | ms | 5.3191 | 7 | 5.023156000002928 | 14.213665999999648 | 6.7549 | 5.3191 | 7.1646 | 14.2137 | 3.123 |  |
| primitive | qwik | 1.19.2 | text binding update 1k | completed | duration | ms | 1.1357 | 7 | 0.9634359999981825 | 1.3643909999991592 | 1.1331 | 1.1357 | 1.2088 | 1.3644 | 0.1263 |  |
| primitive | qwik | 1.19.2 | computed fan-out 1k | completed | duration | ms | 0.9368 | 7 | 0.9300230000008014 | 1.7194199999976263 | 1.0632 | 0.9368 | 1.0296 | 1.7194 | 0.27 |  |
| primitive | qwik | 1.19.2 | computed fan-in 1k | completed | duration | ms | 0.0138 | 7 | 0.012233000001288019 | 0.016170000002603047 | 0.0138 | 0.0138 | 0.0145 | 0.0162 | 0.0013 |  |
| primitive | qwik | 1.19.2 | repeated create update clear memory | completed | memory | bytes | 99180848 | 7 | 0 | 107292480 | 86493657.1429 | 99180848 | 105837880 | 107292480 | 35686771.6862 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | react | 19.2.6 | create 1k rows | completed | duration | ms | 8.2619 | 7 | 5.49602700000105 | 20.29210100000273 | 10.6281 | 8.2619 | 16.9501 | 20.2921 | 5.2111 |  |
| primitive | react | 19.2.6 | replace all 1k rows | completed | duration | ms | 7.3926 | 7 | 6.949616999998398 | 18.54062899999917 | 10.5591 | 7.3926 | 17.935 | 18.5406 | 4.8772 |  |
| primitive | react | 19.2.6 | update every 10th in 10k rows | completed | duration | ms | 3.6297 | 7 | 2.996055999999953 | 16.229844999998022 | 5.3236 | 3.6297 | 4.4383 | 16.2298 | 4.4755 |  |
| primitive | react | 19.2.6 | select row in 10k rows | completed | duration | ms | 2.4499 | 7 | 2.1181219999998575 | 14.12185199999658 | 5.5727 | 2.4499 | 12.9191 | 14.1219 | 5.0392 |  |
| primitive | react | 19.2.6 | append 1k rows to 10k rows | completed | duration | ms | 8.1943 | 7 | 7.39209099999789 | 11.740355000001728 | 8.6331 | 8.1943 | 8.788 | 11.7404 | 1.3559 |  |
| primitive | react | 19.2.6 | remove row from 1k rows | completed | duration | ms | 0.1969 | 7 | 0.17649299999902723 | 7.997731999999814 | 1.3293 | 0.1969 | 0.331 | 7.9977 | 2.7228 |  |
| primitive | react | 19.2.6 | clear 10k rows | completed | duration | ms | 35.0636 | 7 | 26.693482999999105 | 42.26584999999977 | 35.0894 | 35.0636 | 38.6636 | 42.2658 | 4.4344 |  |
| primitive | react | 19.2.6 | keyed reverse 1k rows | completed | duration | ms | 3.229 | 7 | 3.113186999999016 | 6.436189000000013 | 4.1064 | 3.229 | 6.1287 | 6.4362 | 1.3842 |  |
| primitive | react | 19.2.6 | text binding update 1k | completed | duration | ms | 0.4324 | 7 | 0.3657490000005055 | 0.6079260000005888 | 0.4655 | 0.4324 | 0.5698 | 0.6079 | 0.0826 |  |
| primitive | react | 19.2.6 | computed fan-out 1k | completed | duration | ms | 0.4051 | 7 | 0.3857869999992545 | 0.43969899999865447 | 0.4079 | 0.4051 | 0.4195 | 0.4397 | 0.0167 |  |
| primitive | react | 19.2.6 | computed fan-in 1k | completed | duration | ms | 0.0368 | 7 | 0.03433400000358233 | 0.06155600000056438 | 0.0397 | 0.0368 | 0.0374 | 0.0616 | 0.009 |  |
| primitive | react | 19.2.6 | repeated create update clear memory | completed | memory | bytes | 58117056 | 7 | 0 | 63840120 | 50454089.1429 | 58117056 | 58446648 | 63840120 | 20706532.5881 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | solid | 1.9.12 | create 1k rows | completed | duration | ms | 4.94 | 7 | 4.695439000002807 | 14.735047999998642 | 7.0533 | 4.94 | 10.0665 | 14.735 | 3.6085 |  |
| primitive | solid | 1.9.12 | replace all 1k rows | completed | duration | ms | 5.7409 | 7 | 5.527286000000458 | 15.98675699999876 | 8.5386 | 5.7409 | 15.362 | 15.9868 | 4.5178 |  |
| primitive | solid | 1.9.12 | update every 10th in 10k rows | completed | duration | ms | 84.3767 | 7 | 74.12341500000184 | 183.89532900000268 | 95.4446 | 84.3767 | 87.3066 | 183.8953 | 36.4869 |  |
| primitive | solid | 1.9.12 | select row in 10k rows | completed | duration | ms | 33.1982 | 7 | 25.026111999999557 | 41.321059000001696 | 32.9184 | 33.1982 | 37.6083 | 41.3211 | 5.6752 |  |
| primitive | solid | 1.9.12 | append 1k rows to 10k rows | completed | duration | ms | 82.8961 | 7 | 76.49228799999764 | 175.3105910000013 | 94.7068 | 82.8961 | 87.9461 | 175.3106 | 33.1856 |  |
| primitive | solid | 1.9.12 | remove row from 1k rows | completed | duration | ms | 1.8367 | 7 | 1.8131670000002487 | 1.890002000000095 | 1.8459 | 1.8367 | 1.8717 | 1.89 | 0.0257 |  |
| primitive | solid | 1.9.12 | clear 10k rows | completed | duration | ms | 19.7115 | 7 | 18.766013999997085 | 20.28035799999998 | 19.5077 | 19.7115 | 20.1763 | 20.2804 | 0.6132 |  |
| primitive | solid | 1.9.12 | keyed reverse 1k rows | completed | duration | ms | 2.3139 | 7 | 2.2575140000008105 | 2.379864999998972 | 2.3175 | 2.3139 | 2.3704 | 2.3799 | 0.0435 |  |
| primitive | solid | 1.9.12 | text binding update 1k | completed | duration | ms | 0.1206 | 7 | 0.11608899999919231 | 0.1787770000009914 | 0.1287 | 0.1206 | 0.1278 | 0.1788 | 0.0208 |  |
| primitive | solid | 1.9.12 | computed fan-out 1k | completed | duration | ms | 0.1217 | 7 | 0.10442700000203331 | 0.16113399999812827 | 0.1248 | 0.1217 | 0.1479 | 0.1611 | 0.0202 |  |
| primitive | solid | 1.9.12 | computed fan-in 1k | completed | duration | ms | 12.6446 | 7 | 12.455132000002777 | 23.16675700000269 | 15.2277 | 12.6446 | 18.091 | 23.1668 | 3.7729 |  |
| primitive | solid | 1.9.12 | repeated create update clear memory | completed | memory | bytes | 52887368 | 7 | 47624456 | 63913008 | 53912099.4286 | 52887368 | 58315192 | 63913008 | 5472245.014 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | mreact | workspace | create 1k rows | completed | duration | ms | 4.6469 | 7 | 4.1879120000012335 | 14.377133000001777 | 7.2505 | 4.6469 | 13.8748 | 14.3771 | 4.3554 |  |
| primitive | mreact | workspace | replace all 1k rows | completed | duration | ms | 7.8313 | 7 | 5.341475000001083 | 15.952052000000549 | 10.0617 | 7.8313 | 15.7575 | 15.9521 | 4.6642 |  |
| primitive | mreact | workspace | update every 10th in 10k rows | completed | duration | ms | 2.8683 | 7 | 2.5273529999976745 | 3.902122999999847 | 3.0155 | 2.8683 | 3.2631 | 3.9021 | 0.413 |  |
| primitive | mreact | workspace | select row in 10k rows | completed | duration | ms | 0.0958 | 7 | 0.08723500000633067 | 0.1139340000008815 | 0.0973 | 0.0958 | 0.1102 | 0.1139 | 0.0102 |  |
| primitive | mreact | workspace | append 1k rows to 10k rows | completed | duration | ms | 18.3991 | 7 | 12.087949000000663 | 20.236785000000964 | 18.0633 | 18.3991 | 20.0484 | 20.2368 | 2.5496 |  |
| primitive | mreact | workspace | remove row from 1k rows | completed | duration | ms | 0.1778 | 7 | 0.15111500000057276 | 0.6043689999933122 | 0.2811 | 0.1778 | 0.5231 | 0.6044 | 0.1804 |  |
| primitive | mreact | workspace | clear 10k rows | completed | duration | ms | 20.802 | 7 | 19.824398999997356 | 30.422450999998546 | 22.2566 | 20.802 | 22.8655 | 30.4225 | 3.4475 |  |
| primitive | mreact | workspace | keyed reverse 1k rows | completed | duration | ms | 1.5354 | 7 | 1.4821430000010878 | 1.6120979999977862 | 1.5492 | 1.5354 | 1.5865 | 1.6121 | 0.0413 |  |
| primitive | mreact | workspace | text binding update 1k | completed | duration | ms | 0.1271 | 7 | 0.11459599999943748 | 0.16664400000445312 | 0.137 | 0.1271 | 0.1657 | 0.1666 | 0.0215 |  |
| primitive | mreact | workspace | computed fan-out 1k | completed | duration | ms | 0.1179 | 7 | 0.11182100000587525 | 0.1962000000057742 | 0.1293 | 0.1179 | 0.1275 | 0.1962 | 0.0277 |  |
| primitive | mreact | workspace | computed fan-in 1k | completed | duration | ms | 0.0755 | 7 | 0.07232600000133971 | 0.24697500000183936 | 0.1242 | 0.0755 | 0.2226 | 0.247 | 0.0708 |  |
| primitive | mreact | workspace | repeated create update clear memory | completed | memory | bytes | 46081712 | 7 | 0 | 56787168 | 42236952 | 46081712 | 56654648 | 56787168 | 17944448.6194 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
