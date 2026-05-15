# Primitive Benchmark

## Environment

- Date: 2026-05-15
- Git commit: 32bc85400b3e1379452c9f68489813948d9e09ac
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
| 1 | mreact | create 1k rows | 4.0255 | ms |
| 2 | react | create 1k rows | 4.3308 | ms |
| 3 | solid | create 1k rows | 4.7521 | ms |
| 4 | qwik | create 1k rows | 7.3861 | ms |
| 5 | marko | create 1k rows | 7.4843 | ms |

### replace all 1k rows

Replaces an existing 1,000-row keyed list with a fresh 1,000-row dataset.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | replace all 1k rows | 4.8106 | ms |
| 2 | solid | replace all 1k rows | 5.3826 | ms |
| 3 | marko | replace all 1k rows | 6.8817 | ms |
| 4 | react | replace all 1k rows | 7.2111 | ms |
| 5 | qwik | replace all 1k rows | 8.484 | ms |

### update every 10th in 10k rows

Updates the text of every tenth row in a 10,000-row keyed list while preserving the existing row nodes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | update every 10th in 10k rows | 2.78 | ms |
| 2 | react | update every 10th in 10k rows | 3.6676 | ms |
| 3 | marko | update every 10th in 10k rows | 22.2124 | ms |
| 4 | qwik | update every 10th in 10k rows | 61.2287 | ms |
| 5 | solid | update every 10th in 10k rows | 80.9059 | ms |

### select row in 10k rows

Selects one row in a 10,000-row list by toggling selection attributes without changing row text.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | select row in 10k rows | 0.0953 | ms |
| 2 | react | select row in 10k rows | 2.7755 | ms |
| 3 | marko | select row in 10k rows | 23.3303 | ms |
| 4 | solid | select row in 10k rows | 30.7547 | ms |
| 5 | qwik | select row in 10k rows | 65.7541 | ms |

### append 1k rows to 10k rows

Appends 1,000 keyed rows to an existing 10,000-row list and validates the 11,000-row DOM.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | append 1k rows to 10k rows | 10.1474 | ms |
| 2 | react | append 1k rows to 10k rows | 12.326 | ms |
| 3 | marko | append 1k rows to 10k rows | 30.7806 | ms |
| 4 | qwik | append 1k rows to 10k rows | 72.2581 | ms |
| 5 | solid | append 1k rows to 10k rows | 86.7678 | ms |

### remove row from 1k rows

Removes one keyed row from the middle of an existing 1,000-row list.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | remove row from 1k rows | 0.1485 | ms |
| 2 | react | remove row from 1k rows | 0.1737 | ms |
| 3 | marko | remove row from 1k rows | 0.5853 | ms |
| 4 | solid | remove row from 1k rows | 2.008 | ms |
| 5 | qwik | remove row from 1k rows | 2.7204 | ms |

### clear 10k rows

Clears an existing 10,000-row list and validates that no row elements remain.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | clear 10k rows | 19.2166 | ms |
| 2 | solid | clear 10k rows | 19.5367 | ms |
| 3 | qwik | clear 10k rows | 33.4665 | ms |
| 4 | marko | clear 10k rows | 37.5139 | ms |
| 5 | react | clear 10k rows | 37.8573 | ms |

### keyed reverse 1k rows

Reverses 1,000 keyed rows and verifies that DOM node identity is preserved.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | keyed reverse 1k rows | 1.5319 | ms |
| 2 | solid | keyed reverse 1k rows | 2.4337 | ms |
| 3 | react | keyed reverse 1k rows | 3.1088 | ms |
| 4 | marko | keyed reverse 1k rows | 3.5426 | ms |
| 5 | qwik | keyed reverse 1k rows | 4.8707 | ms |

### text binding update 1k

Updates one reactive text value that is bound to 1,000 text nodes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | solid | text binding update 1k | 0.1142 | ms |
| 2 | mreact | text binding update 1k | 0.1192 | ms |
| 3 | react | text binding update 1k | 0.3514 | ms |
| 4 | marko | text binding update 1k | 0.8568 | ms |
| 5 | qwik | text binding update 1k | 1.106 | ms |

### computed fan-out 1k

Updates one source value that fans out through a derived value into 1,000 displayed text nodes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | solid | computed fan-out 1k | 0.1137 | ms |
| 2 | mreact | computed fan-out 1k | 0.1167 | ms |
| 3 | react | computed fan-out 1k | 0.3082 | ms |
| 4 | marko | computed fan-out 1k | 0.8874 | ms |
| 5 | qwik | computed fan-out 1k | 1.1077 | ms |

### computed fan-in 1k

Updates 1,000 source values and validates one derived aggregate text output.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | qwik | computed fan-in 1k | 0.0131 | ms |
| 2 | marko | computed fan-in 1k | 0.0161 | ms |
| 3 | react | computed fan-in 1k | 0.0316 | ms |
| 4 | mreact | computed fan-in 1k | 0.0651 | ms |
| 5 | solid | computed fan-in 1k | 13.3973 | ms |

### repeated create update clear memory

Reports heap growth after repeatedly creating, updating, and clearing 1,000-row lists.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko | repeated create update clear memory | 0 | bytes |
| 2 | mreact | repeated create update clear memory | 0 | bytes |
| 3 | react | repeated create update clear memory | 13466632 | bytes |
| 4 | solid | repeated create update clear memory | 50778704 | bytes |
| 5 | qwik | repeated create update clear memory | 101272920 | bytes |

## Results

| suite | framework | version | case | status | metric | unit | value | sample count | min | max | mean | median | p75 | p95 | standard deviation | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| primitive | marko | 5.38.39 | create 1k rows | completed | duration | ms | 7.4843 | 15 | 5.406953999999928 | 10.559558000000038 | 7.6055 | 7.4843 | 8.2694 | 10.5596 | 1.461 |  |
| primitive | marko | 5.38.39 | replace all 1k rows | completed | duration | ms | 6.8817 | 15 | 6.690000000000055 | 12.167146000000002 | 7.6241 | 6.8817 | 7.2166 | 12.1671 | 1.7729 |  |
| primitive | marko | 5.38.39 | update every 10th in 10k rows | completed | duration | ms | 22.2124 | 15 | 21.116532000000007 | 33.52811900000006 | 23.7707 | 22.2124 | 23.8205 | 33.5281 | 3.9391 |  |
| primitive | marko | 5.38.39 | select row in 10k rows | completed | duration | ms | 23.3303 | 15 | 21.48536299999978 | 29.79065199999968 | 23.613 | 23.3303 | 24.2385 | 29.7907 | 2.1027 |  |
| primitive | marko | 5.38.39 | append 1k rows to 10k rows | completed | duration | ms | 30.7806 | 15 | 29.300513000000137 | 38.46022599999924 | 31.7746 | 30.7806 | 32.4233 | 38.4602 | 2.7585 |  |
| primitive | marko | 5.38.39 | remove row from 1k rows | completed | duration | ms | 0.5853 | 15 | 0.5594820000005711 | 0.7064840000002732 | 0.6046 | 0.5853 | 0.6234 | 0.7065 | 0.0432 |  |
| primitive | marko | 5.38.39 | clear 10k rows | completed | duration | ms | 37.5139 | 15 | 34.91369400000076 | 47.98977500000001 | 38.1462 | 37.5139 | 39.0387 | 47.9898 | 3.0493 |  |
| primitive | marko | 5.38.39 | keyed reverse 1k rows | completed | duration | ms | 3.5426 | 15 | 3.462467999997898 | 7.168338999999833 | 3.8093 | 3.5426 | 3.6463 | 7.1683 | 0.9019 |  |
| primitive | marko | 5.38.39 | text binding update 1k | completed | duration | ms | 0.8568 | 15 | 0.7775540000002366 | 1.359269000000495 | 0.9148 | 0.8568 | 0.977 | 1.3593 | 0.1445 |  |
| primitive | marko | 5.38.39 | computed fan-out 1k | completed | duration | ms | 0.8874 | 15 | 0.7441780000008293 | 1.0627410000015516 | 0.8579 | 0.8874 | 0.9065 | 1.0627 | 0.0932 |  |
| primitive | marko | 5.38.39 | computed fan-in 1k | completed | duration | ms | 0.0161 | 15 | 0.014558999999280786 | 0.04517000000123517 | 0.0182 | 0.0161 | 0.0167 | 0.0452 | 0.0073 |  |
| primitive | marko | 5.38.39 | repeated create update clear memory | completed | memory | bytes | 0 | 15 | 0 | 55645256 | 14922773.3333 | 0 | 55528768 | 55645256 | 24526011.5958 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | qwik | 1.19.2 | create 1k rows | completed | duration | ms | 7.3861 | 15 | 5.276119000001927 | 18.751060999999027 | 9.5117 | 7.3861 | 12.7382 | 18.7511 | 4.1593 |  |
| primitive | qwik | 1.19.2 | replace all 1k rows | completed | duration | ms | 8.484 | 15 | 7.564573999999993 | 19.07138699999996 | 11.4027 | 8.484 | 17.3234 | 19.0714 | 4.5357 |  |
| primitive | qwik | 1.19.2 | update every 10th in 10k rows | completed | duration | ms | 61.2287 | 15 | 56.02148499999748 | 79.57834399999774 | 62.2341 | 61.2287 | 64.9133 | 79.5783 | 6.1283 |  |
| primitive | qwik | 1.19.2 | select row in 10k rows | completed | duration | ms | 65.7541 | 15 | 57.020980999997846 | 83.60944000000018 | 66.0036 | 65.7541 | 67.333 | 83.6094 | 6.4301 |  |
| primitive | qwik | 1.19.2 | append 1k rows to 10k rows | completed | duration | ms | 72.2581 | 15 | 63.40321699999913 | 98.54202000000078 | 75.2227 | 72.2581 | 78.5987 | 98.542 | 8.4739 |  |
| primitive | qwik | 1.19.2 | remove row from 1k rows | completed | duration | ms | 2.7204 | 15 | 2.2974780000004102 | 12.720526000000973 | 6.4196 | 2.7204 | 12.1889 | 12.7205 | 4.7889 |  |
| primitive | qwik | 1.19.2 | clear 10k rows | completed | duration | ms | 33.4665 | 15 | 31.534140999996453 | 97.59188100000028 | 39.8431 | 33.4665 | 41.8708 | 97.5919 | 16.228 |  |
| primitive | qwik | 1.19.2 | keyed reverse 1k rows | completed | duration | ms | 4.8707 | 15 | 4.485566999996081 | 21.489648999995552 | 6.6105 | 4.8707 | 5.2124 | 21.4896 | 4.6569 |  |
| primitive | qwik | 1.19.2 | text binding update 1k | completed | duration | ms | 1.106 | 15 | 0.9429999999993015 | 1.7522749999989173 | 1.1823 | 1.106 | 1.2719 | 1.7523 | 0.2217 |  |
| primitive | qwik | 1.19.2 | computed fan-out 1k | completed | duration | ms | 1.1077 | 15 | 0.9286320000028354 | 1.4430720000018482 | 1.1184 | 1.1077 | 1.2385 | 1.4431 | 0.1567 |  |
| primitive | qwik | 1.19.2 | computed fan-in 1k | completed | duration | ms | 0.0131 | 15 | 0.011732999999367166 | 0.038086000000475906 | 0.0152 | 0.0131 | 0.0143 | 0.0381 | 0.0063 |  |
| primitive | qwik | 1.19.2 | repeated create update clear memory | completed | memory | bytes | 101272920 | 15 | 0 | 110261352 | 89381112.5333 | 101272920 | 107239608 | 110261352 | 35395621.0685 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | react | 19.2.6 | create 1k rows | completed | duration | ms | 4.3308 | 15 | 3.968829999997979 | 8.623069000001124 | 5.2753 | 4.3308 | 7.3957 | 8.6231 | 1.6871 |  |
| primitive | react | 19.2.6 | replace all 1k rows | completed | duration | ms | 7.2111 | 15 | 6.617652000000817 | 10.206818999999086 | 8.2357 | 7.2111 | 9.8601 | 10.2068 | 1.474 |  |
| primitive | react | 19.2.6 | update every 10th in 10k rows | completed | duration | ms | 3.6676 | 15 | 2.6152450000008685 | 17.28240700000606 | 7.4188 | 3.6676 | 13.9161 | 17.2824 | 5.4543 |  |
| primitive | react | 19.2.6 | select row in 10k rows | completed | duration | ms | 2.7755 | 15 | 1.8588749999980791 | 18.124557999995886 | 5.0865 | 2.7755 | 4.8071 | 18.1246 | 5.008 |  |
| primitive | react | 19.2.6 | append 1k rows to 10k rows | completed | duration | ms | 12.326 | 15 | 7.672446000004129 | 19.8009979999988 | 13.4848 | 12.326 | 17.9267 | 19.801 | 4.5071 |  |
| primitive | react | 19.2.6 | remove row from 1k rows | completed | duration | ms | 0.1737 | 15 | 0.16610899999795947 | 0.6120719999962603 | 0.2085 | 0.1737 | 0.1928 | 0.6121 | 0.1086 |  |
| primitive | react | 19.2.6 | clear 10k rows | completed | duration | ms | 37.8573 | 15 | 32.76732799999445 | 120.98828800000047 | 43.2803 | 37.8573 | 38.9388 | 120.9883 | 20.9473 |  |
| primitive | react | 19.2.6 | keyed reverse 1k rows | completed | duration | ms | 3.1088 | 15 | 3.0824460000003455 | 3.492158000000927 | 3.1762 | 3.1088 | 3.2223 | 3.4922 | 0.126 |  |
| primitive | react | 19.2.6 | text binding update 1k | completed | duration | ms | 0.3514 | 15 | 0.3054550000015297 | 0.6501179999977467 | 0.4001 | 0.3514 | 0.4475 | 0.6501 | 0.0994 |  |
| primitive | react | 19.2.6 | computed fan-out 1k | completed | duration | ms | 0.3082 | 15 | 0.2894030000024941 | 0.6718409999957657 | 0.335 | 0.3082 | 0.3179 | 0.6718 | 0.0922 |  |
| primitive | react | 19.2.6 | computed fan-in 1k | completed | duration | ms | 0.0316 | 15 | 0.029298000001290347 | 0.10028900000179419 | 0.0363 | 0.0316 | 0.0336 | 0.1003 | 0.0172 |  |
| primitive | react | 19.2.6 | repeated create update clear memory | completed | memory | bytes | 13466632 | 15 | 0 | 13932264 | 10068125.8667 | 13466632 | 13737032 | 13932264 | 5463399.3169 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | solid | 1.9.12 | create 1k rows | completed | duration | ms | 4.7521 | 15 | 4.3599969999995665 | 15.823857000003045 | 6.9271 | 4.7521 | 9.2743 | 15.8239 | 4.0793 |  |
| primitive | solid | 1.9.12 | replace all 1k rows | completed | duration | ms | 5.3826 | 15 | 5.092607999999018 | 16.159879999999248 | 8.1178 | 5.3826 | 14.9608 | 16.1599 | 4.4798 |  |
| primitive | solid | 1.9.12 | update every 10th in 10k rows | completed | duration | ms | 80.9059 | 15 | 73.66793499999767 | 206.64867799999774 | 90.5239 | 80.9059 | 87.8715 | 206.6487 | 31.4385 |  |
| primitive | solid | 1.9.12 | select row in 10k rows | completed | duration | ms | 30.7547 | 15 | 21.93399700000009 | 48.59787700000015 | 31.717 | 30.7547 | 32.809 | 48.5979 | 5.4753 |  |
| primitive | solid | 1.9.12 | append 1k rows to 10k rows | completed | duration | ms | 86.7678 | 15 | 80.28302000000258 | 233.46535199999926 | 96.1082 | 86.7678 | 90.7766 | 233.4654 | 36.9962 |  |
| primitive | solid | 1.9.12 | remove row from 1k rows | completed | duration | ms | 2.008 | 15 | 1.9202510000031907 | 3.5791040000040084 | 2.2414 | 2.008 | 2.0481 | 3.5791 | 0.5408 |  |
| primitive | solid | 1.9.12 | clear 10k rows | completed | duration | ms | 19.5367 | 15 | 17.26878399999987 | 103.14128999999957 | 26.6606 | 19.5367 | 26.7588 | 103.1413 | 20.7829 |  |
| primitive | solid | 1.9.12 | keyed reverse 1k rows | completed | duration | ms | 2.4337 | 15 | 2.39031999999861 | 3.172377000002598 | 2.5496 | 2.4337 | 2.4896 | 3.1724 | 0.2476 |  |
| primitive | solid | 1.9.12 | text binding update 1k | completed | duration | ms | 0.1142 | 15 | 0.1111799999998766 | 0.29131699999561533 | 0.1273 | 0.1142 | 0.1219 | 0.2913 | 0.0441 |  |
| primitive | solid | 1.9.12 | computed fan-out 1k | completed | duration | ms | 0.1137 | 15 | 0.11116999999649124 | 0.314792999997735 | 0.1283 | 0.1137 | 0.118 | 0.3148 | 0.05 |  |
| primitive | solid | 1.9.12 | computed fan-in 1k | completed | duration | ms | 13.3973 | 15 | 13.182335999998031 | 20.48131899999862 | 14.1112 | 13.3973 | 13.5802 | 20.4813 | 1.9611 |  |
| primitive | solid | 1.9.12 | repeated create update clear memory | completed | memory | bytes | 50778704 | 15 | 50127104 | 58881992 | 52857542.9333 | 50778704 | 58431616 | 58881992 | 3488255.217 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | mreact | workspace | create 1k rows | completed | duration | ms | 4.0255 | 15 | 3.965846999999485 | 7.997986000002129 | 4.5278 | 4.0255 | 4.5712 | 7.998 | 1.0367 |  |
| primitive | mreact | workspace | replace all 1k rows | completed | duration | ms | 4.8106 | 15 | 4.6015950000000885 | 10.562290000001667 | 5.5045 | 4.8106 | 5.4008 | 10.5623 | 1.5174 |  |
| primitive | mreact | workspace | update every 10th in 10k rows | completed | duration | ms | 2.78 | 15 | 1.6704639999952633 | 5.709044000002905 | 2.8465 | 2.78 | 3.0883 | 5.709 | 0.9582 |  |
| primitive | mreact | workspace | select row in 10k rows | completed | duration | ms | 0.0953 | 15 | 0.0751589999999851 | 0.12079900001117494 | 0.0966 | 0.0953 | 0.1083 | 0.1208 | 0.0128 |  |
| primitive | mreact | workspace | append 1k rows to 10k rows | completed | duration | ms | 10.1474 | 15 | 9.470888000010746 | 30.02268300000287 | 13.0587 | 10.1474 | 18.0199 | 30.0227 | 5.6564 |  |
| primitive | mreact | workspace | remove row from 1k rows | completed | duration | ms | 0.1485 | 15 | 0.1391449999937322 | 0.85807700001169 | 0.1975 | 0.1485 | 0.1516 | 0.8581 | 0.177 |  |
| primitive | mreact | workspace | clear 10k rows | completed | duration | ms | 19.2166 | 15 | 17.655527000009897 | 133.1307000000088 | 27.1604 | 19.2166 | 19.6499 | 133.1307 | 28.4299 |  |
| primitive | mreact | workspace | keyed reverse 1k rows | completed | duration | ms | 1.5319 | 15 | 1.5028709999896819 | 1.5926579999941168 | 1.5359 | 1.5319 | 1.5488 | 1.5927 | 0.0208 |  |
| primitive | mreact | workspace | text binding update 1k | completed | duration | ms | 0.1192 | 15 | 0.11354500000015832 | 0.4519129999971483 | 0.1514 | 0.1192 | 0.1266 | 0.4519 | 0.0851 |  |
| primitive | mreact | workspace | computed fan-out 1k | completed | duration | ms | 0.1167 | 15 | 0.11306299999705516 | 0.16555700000026263 | 0.1213 | 0.1167 | 0.1231 | 0.1656 | 0.0127 |  |
| primitive | mreact | workspace | computed fan-in 1k | completed | duration | ms | 0.0651 | 15 | 0.05731299999752082 | 1.0161090000037802 | 0.1294 | 0.0651 | 0.0731 | 1.0161 | 0.2371 |  |
| primitive | mreact | workspace | repeated create update clear memory | completed | memory | bytes | 0 | 15 | 0 | 52588528 | 10478893.8667 | 0 | 0 | 52588528 | 20958127.0364 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
