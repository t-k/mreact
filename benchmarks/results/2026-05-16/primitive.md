# Primitive Benchmark

## Environment

- Date: 2026-05-16
- Git commit: 0cea018abbbe17899ad704f79a5c7cb38b247200
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
  - solid-js-2: 2.0.0-beta.13

## Rankings

### create 1k rows

Creates 1,000 DOM rows from an empty host and validates the final DOM.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | create 1k rows | 4.0324 | ms |
| 2 | react | create 1k rows | 4.4062 | ms |
| 3 | solid | create 1k rows | 4.5882 | ms |
| 4 | solid-v2 | create 1k rows | 4.9243 | ms |
| 5 | marko | create 1k rows | 7.0614 | ms |
| 6 | qwik | create 1k rows | 7.6956 | ms |

### replace all 1k rows

Replaces an existing 1,000-row keyed list with a fresh 1,000-row dataset.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | solid-v2 | replace all 1k rows | 5.2835 | ms |
| 2 | mreact | replace all 1k rows | 5.2848 | ms |
| 3 | solid | replace all 1k rows | 6.1683 | ms |
| 4 | marko | replace all 1k rows | 6.9065 | ms |
| 5 | react | replace all 1k rows | 7.0248 | ms |
| 6 | qwik | replace all 1k rows | 7.8497 | ms |

### update every 10th in 10k rows

Updates the text of every tenth row in a 10,000-row keyed list while preserving the existing row nodes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | update every 10th in 10k rows | 2.2589 | ms |
| 2 | react | update every 10th in 10k rows | 3.9846 | ms |
| 3 | marko | update every 10th in 10k rows | 22.4705 | ms |
| 4 | qwik | update every 10th in 10k rows | 58.7438 | ms |
| 5 | solid-v2 | update every 10th in 10k rows | 75.3937 | ms |
| 6 | solid | update every 10th in 10k rows | 75.4555 | ms |

### select row in 10k rows

Selects one row in a 10,000-row list by toggling selection attributes without changing row text.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | select row in 10k rows | 0.0912 | ms |
| 2 | react | select row in 10k rows | 2.352 | ms |
| 3 | marko | select row in 10k rows | 20.9161 | ms |
| 4 | solid | select row in 10k rows | 29.6013 | ms |
| 5 | solid-v2 | select row in 10k rows | 33.2651 | ms |
| 6 | qwik | select row in 10k rows | 63.3576 | ms |

### append 1k rows to 10k rows

Appends 1,000 keyed rows to an existing 10,000-row list and validates the 11,000-row DOM.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | react | append 1k rows to 10k rows | 10.2313 | ms |
| 2 | mreact | append 1k rows to 10k rows | 10.2972 | ms |
| 3 | marko | append 1k rows to 10k rows | 30.6484 | ms |
| 4 | solid | append 1k rows to 10k rows | 76.0514 | ms |
| 5 | qwik | append 1k rows to 10k rows | 77.6996 | ms |
| 6 | solid-v2 | append 1k rows to 10k rows | 81.885 | ms |

### remove row from 1k rows

Removes one keyed row from the middle of an existing 1,000-row list.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | remove row from 1k rows | 0.1517 | ms |
| 2 | react | remove row from 1k rows | 0.1829 | ms |
| 3 | marko | remove row from 1k rows | 0.574 | ms |
| 4 | solid | remove row from 1k rows | 1.8133 | ms |
| 5 | solid-v2 | remove row from 1k rows | 1.833 | ms |
| 6 | qwik | remove row from 1k rows | 2.7665 | ms |

### clear 10k rows

Clears an existing 10,000-row list and validates that no row elements remain.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | solid-v2 | clear 10k rows | 17.6899 | ms |
| 2 | mreact | clear 10k rows | 17.9596 | ms |
| 3 | solid | clear 10k rows | 18.219 | ms |
| 4 | qwik | clear 10k rows | 32.5635 | ms |
| 5 | react | clear 10k rows | 35.383 | ms |
| 6 | marko | clear 10k rows | 37.048 | ms |

### keyed reverse 1k rows

Reverses 1,000 keyed rows and verifies that DOM node identity is preserved.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | keyed reverse 1k rows | 1.4893 | ms |
| 2 | solid | keyed reverse 1k rows | 2.2657 | ms |
| 3 | solid-v2 | keyed reverse 1k rows | 2.3777 | ms |
| 4 | react | keyed reverse 1k rows | 3.1407 | ms |
| 5 | marko | keyed reverse 1k rows | 3.395 | ms |
| 6 | qwik | keyed reverse 1k rows | 4.6519 | ms |

### text binding update 1k

Updates one reactive text value that is bound to 1,000 text nodes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | solid | text binding update 1k | 0.1139 | ms |
| 2 | mreact | text binding update 1k | 0.1157 | ms |
| 3 | solid-v2 | text binding update 1k | 0.1199 | ms |
| 4 | react | text binding update 1k | 0.3859 | ms |
| 5 | marko | text binding update 1k | 0.8043 | ms |
| 6 | qwik | text binding update 1k | 1.0659 | ms |

### computed fan-out 1k

Updates one source value that fans out through a derived value into 1,000 displayed text nodes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | solid | computed fan-out 1k | 0.1108 | ms |
| 2 | solid-v2 | computed fan-out 1k | 0.1226 | ms |
| 3 | mreact | computed fan-out 1k | 0.1236 | ms |
| 4 | react | computed fan-out 1k | 0.3204 | ms |
| 5 | marko | computed fan-out 1k | 0.7687 | ms |
| 6 | qwik | computed fan-out 1k | 1.012 | ms |

### computed fan-in 1k

Updates 1,000 source values and validates one derived aggregate text output.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | qwik | computed fan-in 1k | 0.0135 | ms |
| 2 | marko | computed fan-in 1k | 0.0155 | ms |
| 3 | react | computed fan-in 1k | 0.0308 | ms |
| 4 | solid-v2 | computed fan-in 1k | 0.0436 | ms |
| 5 | mreact | computed fan-in 1k | 0.0621 | ms |
| 6 | solid | computed fan-in 1k | 12.377 | ms |

### repeated create update clear memory

Reports heap growth after repeatedly creating, updating, and clearing 1,000-row lists.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko | repeated create update clear memory | 0 | bytes |
| 2 | react | repeated create update clear memory | 12251008 | bytes |
| 3 | mreact | repeated create update clear memory | 47059016 | bytes |
| 4 | solid | repeated create update clear memory | 50729928 | bytes |
| 5 | solid-v2 | repeated create update clear memory | 51451672 | bytes |
| 6 | qwik | repeated create update clear memory | 101378464 | bytes |

## Results

| suite | framework | version | case | status | metric | unit | value | sample count | min | max | mean | median | p75 | p95 | standard deviation | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| primitive | marko | 5.38.39 | create 1k rows | completed | duration | ms | 7.0614 | 15 | 5.381957000000057 | 10.059048000000075 | 7.6126 | 7.0614 | 9.6897 | 10.059 | 1.6841 |  |
| primitive | marko | 5.38.39 | replace all 1k rows | completed | duration | ms | 6.9065 | 15 | 6.641869999999926 | 12.535441999999989 | 7.952 | 6.9065 | 7.4332 | 12.5354 | 2.2246 |  |
| primitive | marko | 5.38.39 | update every 10th in 10k rows | completed | duration | ms | 22.4705 | 15 | 20.889228000000003 | 25.248759000000064 | 22.5245 | 22.4705 | 23.4207 | 25.2488 | 1.229 |  |
| primitive | marko | 5.38.39 | select row in 10k rows | completed | duration | ms | 20.9161 | 15 | 19.640094999999747 | 34.481840999999804 | 21.8912 | 20.9161 | 21.7949 | 34.4818 | 3.5616 |  |
| primitive | marko | 5.38.39 | append 1k rows to 10k rows | completed | duration | ms | 30.6484 | 15 | 28.40252099999998 | 41.00134199999957 | 32.1595 | 30.6484 | 32.1374 | 41.0013 | 3.8341 |  |
| primitive | marko | 5.38.39 | remove row from 1k rows | completed | duration | ms | 0.574 | 15 | 0.5446060000012949 | 0.6985459999996237 | 0.5979 | 0.574 | 0.6166 | 0.6985 | 0.044 |  |
| primitive | marko | 5.38.39 | clear 10k rows | completed | duration | ms | 37.048 | 15 | 34.5300729999999 | 47.863570000001346 | 37.6831 | 37.048 | 38.2668 | 47.8636 | 2.9595 |  |
| primitive | marko | 5.38.39 | keyed reverse 1k rows | completed | duration | ms | 3.395 | 15 | 3.267786000000342 | 8.103343999999197 | 3.7009 | 3.395 | 3.4532 | 8.1033 | 1.1787 |  |
| primitive | marko | 5.38.39 | text binding update 1k | completed | duration | ms | 0.8043 | 15 | 0.719836000000214 | 1.048415000001114 | 0.8374 | 0.8043 | 0.8886 | 1.0484 | 0.0856 |  |
| primitive | marko | 5.38.39 | computed fan-out 1k | completed | duration | ms | 0.7687 | 15 | 0.69844600000215 | 0.9881119999990915 | 0.81 | 0.7687 | 0.8743 | 0.9881 | 0.0849 |  |
| primitive | marko | 5.38.39 | computed fan-in 1k | completed | duration | ms | 0.0155 | 15 | 0.013877000001230044 | 0.04427399999985937 | 0.0177 | 0.0155 | 0.0166 | 0.0443 | 0.0074 |  |
| primitive | marko | 5.38.39 | repeated create update clear memory | completed | memory | bytes | 0 | 15 | 0 | 55646592 | 14928569.6 | 0 | 55544160 | 55646592 | 24528569.2958 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | qwik | 1.19.2 | create 1k rows | completed | duration | ms | 7.6956 | 15 | 5.189586000000418 | 18.979451999999583 | 9.3436 | 7.6956 | 12.7126 | 18.9795 | 4.1841 |  |
| primitive | qwik | 1.19.2 | replace all 1k rows | completed | duration | ms | 7.8497 | 15 | 7.348010999998223 | 18.594365999997535 | 10.8809 | 7.8497 | 16.9322 | 18.5944 | 4.5735 |  |
| primitive | qwik | 1.19.2 | update every 10th in 10k rows | completed | duration | ms | 58.7438 | 15 | 50.29510999999911 | 82.09181600000011 | 62.0823 | 58.7438 | 68.7669 | 82.0918 | 8.2795 |  |
| primitive | qwik | 1.19.2 | select row in 10k rows | completed | duration | ms | 63.3576 | 15 | 56.070159999999305 | 77.80487100000028 | 64.6084 | 63.3576 | 66.6422 | 77.8049 | 6.8871 |  |
| primitive | qwik | 1.19.2 | append 1k rows to 10k rows | completed | duration | ms | 77.6996 | 15 | 62.35527000000002 | 99.75771600000007 | 78.681 | 77.6996 | 84.8361 | 99.7577 | 10.5979 |  |
| primitive | qwik | 1.19.2 | remove row from 1k rows | completed | duration | ms | 2.7665 | 15 | 2.3074569999989762 | 13.223840999999084 | 6.8781 | 2.7665 | 11.8458 | 13.2238 | 4.7221 |  |
| primitive | qwik | 1.19.2 | clear 10k rows | completed | duration | ms | 32.5635 | 15 | 29.30388099999982 | 101.29572499999631 | 38.9061 | 32.5635 | 41.7248 | 101.2957 | 17.7214 |  |
| primitive | qwik | 1.19.2 | keyed reverse 1k rows | completed | duration | ms | 4.6519 | 15 | 4.4417670000038925 | 22.8247560000018 | 6.5313 | 4.6519 | 5.0529 | 22.8248 | 4.9223 |  |
| primitive | qwik | 1.19.2 | text binding update 1k | completed | duration | ms | 1.0659 | 15 | 0.9289199999984703 | 10.155259999999544 | 1.7268 | 1.0659 | 1.2894 | 10.1553 | 2.2589 |  |
| primitive | qwik | 1.19.2 | computed fan-out 1k | completed | duration | ms | 1.012 | 15 | 0.9401610000059009 | 1.3791379999966011 | 1.0637 | 1.012 | 1.1701 | 1.3791 | 0.1302 |  |
| primitive | qwik | 1.19.2 | computed fan-in 1k | completed | duration | ms | 0.0135 | 15 | 0.011300999998638872 | 0.0250369999994291 | 0.0145 | 0.0135 | 0.0151 | 0.025 | 0.0036 |  |
| primitive | qwik | 1.19.2 | repeated create update clear memory | completed | memory | bytes | 101378464 | 15 | 0 | 108619224 | 89611136 | 101378464 | 107324304 | 108619224 | 35378597.7592 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
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
| primitive | react | 19.2.6 | create 1k rows | completed | duration | ms | 4.4062 | 15 | 3.9088229999979376 | 9.335294999997132 | 5.0146 | 4.4062 | 4.7526 | 9.3353 | 1.5871 |  |
| primitive | react | 19.2.6 | replace all 1k rows | completed | duration | ms | 7.0248 | 15 | 6.424913000002562 | 10.272060000002966 | 7.9535 | 7.0248 | 9.2953 | 10.2721 | 1.3695 |  |
| primitive | react | 19.2.6 | update every 10th in 10k rows | completed | duration | ms | 3.9846 | 15 | 2.777231000000029 | 16.95788399999583 | 6.0429 | 3.9846 | 5.2611 | 16.9579 | 4.8884 |  |
| primitive | react | 19.2.6 | select row in 10k rows | completed | duration | ms | 2.352 | 15 | 1.794079999999667 | 15.567614999999932 | 4.0402 | 2.352 | 4.1117 | 15.5676 | 3.7203 |  |
| primitive | react | 19.2.6 | append 1k rows to 10k rows | completed | duration | ms | 10.2313 | 15 | 7.042537000001175 | 19.6525810000021 | 12.7645 | 10.2313 | 18.2819 | 19.6526 | 4.9293 |  |
| primitive | react | 19.2.6 | remove row from 1k rows | completed | duration | ms | 0.1829 | 15 | 0.16363799999817275 | 0.3669309999968391 | 0.2039 | 0.1829 | 0.2153 | 0.3669 | 0.0537 |  |
| primitive | react | 19.2.6 | clear 10k rows | completed | duration | ms | 35.383 | 15 | 34.31499199999962 | 138.9227200000023 | 42.6513 | 35.383 | 35.7458 | 138.9227 | 25.7764 |  |
| primitive | react | 19.2.6 | keyed reverse 1k rows | completed | duration | ms | 3.1407 | 15 | 3.085192000005918 | 3.5145399999964866 | 3.1828 | 3.1407 | 3.1517 | 3.5145 | 0.1332 |  |
| primitive | react | 19.2.6 | text binding update 1k | completed | duration | ms | 0.3859 | 15 | 0.3315340000044671 | 0.5649950000006356 | 0.4002 | 0.3859 | 0.4352 | 0.565 | 0.0632 |  |
| primitive | react | 19.2.6 | computed fan-out 1k | completed | duration | ms | 0.3204 | 15 | 0.30121800000051735 | 0.5963229999979376 | 0.3546 | 0.3204 | 0.3499 | 0.5963 | 0.0808 |  |
| primitive | react | 19.2.6 | computed fan-in 1k | completed | duration | ms | 0.0308 | 15 | 0.029184999999415595 | 0.10555899999599205 | 0.036 | 0.0308 | 0.0322 | 0.1056 | 0.0187 |  |
| primitive | react | 19.2.6 | repeated create update clear memory | completed | memory | bytes | 12251008 | 15 | 0 | 13926280 | 9460411.7333 | 12251008 | 13787056 | 13926280 | 5348904.4468 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | solid | 1.9.12 | create 1k rows | completed | duration | ms | 4.5882 | 15 | 4.106776000000536 | 14.575277000003553 | 6.8648 | 4.5882 | 12.2769 | 14.5753 | 4.1134 |  |
| primitive | solid | 1.9.12 | replace all 1k rows | completed | duration | ms | 6.1683 | 15 | 5.014696999998705 | 22.332860000002256 | 9.5467 | 6.1683 | 12.648 | 22.3329 | 5.2493 |  |
| primitive | solid | 1.9.12 | update every 10th in 10k rows | completed | duration | ms | 75.4555 | 15 | 72.04579000000376 | 187.15774800000509 | 84.8323 | 75.4555 | 82.4037 | 187.1577 | 27.6338 |  |
| primitive | solid | 1.9.12 | select row in 10k rows | completed | duration | ms | 29.6013 | 15 | 20.553459000002476 | 53.943749999998545 | 31.6616 | 29.6013 | 33.1135 | 53.9437 | 7.9526 |  |
| primitive | solid | 1.9.12 | append 1k rows to 10k rows | completed | duration | ms | 76.0514 | 15 | 74.03498799999943 | 208.2526599999983 | 94.3825 | 76.0514 | 84.7203 | 208.2527 | 42.3405 |  |
| primitive | solid | 1.9.12 | remove row from 1k rows | completed | duration | ms | 1.8133 | 15 | 1.7861249999987194 | 1.8317610000012792 | 1.8088 | 1.8133 | 1.8168 | 1.8318 | 0.0118 |  |
| primitive | solid | 1.9.12 | clear 10k rows | completed | duration | ms | 18.219 | 15 | 17.038778000001912 | 86.96138100000098 | 25.0842 | 18.219 | 25.9306 | 86.9614 | 16.9507 |  |
| primitive | solid | 1.9.12 | keyed reverse 1k rows | completed | duration | ms | 2.2657 | 15 | 2.2299410000050557 | 11.086916000000201 | 3.428 | 2.2657 | 2.4479 | 11.0869 | 2.8697 |  |
| primitive | solid | 1.9.12 | text binding update 1k | completed | duration | ms | 0.1139 | 15 | 0.10757300000113901 | 0.20507599999837112 | 0.1186 | 0.1139 | 0.1154 | 0.2051 | 0.0233 |  |
| primitive | solid | 1.9.12 | computed fan-out 1k | completed | duration | ms | 0.1108 | 15 | 0.10739300000568619 | 0.2602409999963129 | 0.1212 | 0.1108 | 0.1144 | 0.2602 | 0.0372 |  |
| primitive | solid | 1.9.12 | computed fan-in 1k | completed | duration | ms | 12.377 | 15 | 12.19002499999624 | 13.339269000003696 | 12.4791 | 12.377 | 12.5429 | 13.3393 | 0.3401 |  |
| primitive | solid | 1.9.12 | repeated create update clear memory | completed | memory | bytes | 50729928 | 15 | 0 | 67489872 | 50406270.9333 | 50729928 | 58667176 | 67489872 | 14381006.807 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | solid-v2 | 2.0.0-beta.13 | create 1k rows | completed | duration | ms | 4.9243 | 15 | 4.294789999999921 | 15.694886999997834 | 8.1424 | 4.9243 | 14.9968 | 15.6949 | 4.9661 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | replace all 1k rows | completed | duration | ms | 5.2835 | 15 | 5.176911999995355 | 16.10392700000375 | 7.4296 | 5.2835 | 6.0182 | 16.1039 | 4.1786 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | update every 10th in 10k rows | completed | duration | ms | 75.3937 | 15 | 73.68680500000482 | 211.83268199999293 | 87.7351 | 75.3937 | 85.7905 | 211.8327 | 33.5946 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | select row in 10k rows | completed | duration | ms | 33.2651 | 15 | 25.190405000001192 | 66.49140100000659 | 35.057 | 33.2651 | 33.842 | 66.4914 | 8.693 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | append 1k rows to 10k rows | completed | duration | ms | 81.885 | 15 | 74.14959799998906 | 245.40962099999888 | 91.2316 | 81.885 | 84.8763 | 245.4096 | 41.4045 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | remove row from 1k rows | completed | duration | ms | 1.833 | 15 | 1.7790420000092126 | 1.8865240000013728 | 1.8283 | 1.833 | 1.8525 | 1.8865 | 0.0285 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | clear 10k rows | completed | duration | ms | 17.6899 | 15 | 16.703736999988905 | 138.4712339999969 | 25.5459 | 17.6899 | 17.9643 | 138.4712 | 30.1855 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | keyed reverse 1k rows | completed | duration | ms | 2.3777 | 15 | 2.3218940000078874 | 11.189349000007496 | 2.9595 | 2.3777 | 2.3908 | 11.1893 | 2.1997 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | text binding update 1k | completed | duration | ms | 0.1199 | 15 | 0.11559800000395626 | 0.26610199999413453 | 0.1352 | 0.1199 | 0.126 | 0.2661 | 0.0389 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | computed fan-out 1k | completed | duration | ms | 0.1226 | 15 | 0.11806199999409728 | 8.865942000003997 | 0.7163 | 0.1226 | 0.1329 | 8.8659 | 2.1784 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | computed fan-in 1k | completed | duration | ms | 0.0436 | 15 | 0.028453999999328516 | 9.002609999995911 | 0.7099 | 0.0436 | 0.1721 | 9.0026 | 2.2226 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | repeated create update clear memory | completed | memory | bytes | 51451672 | 15 | 0 | 62088808 | 50292664.5333 | 51451672 | 58241096 | 62088808 | 13906165.0481 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | mreact | workspace | create 1k rows | completed | duration | ms | 4.0324 | 15 | 3.897212000010768 | 7.083104000004823 | 4.3713 | 4.0324 | 4.4542 | 7.0831 | 0.8363 |  |
| primitive | mreact | workspace | replace all 1k rows | completed | duration | ms | 5.2848 | 15 | 4.635712999996031 | 14.465851999993902 | 7.5279 | 5.2848 | 14.0866 | 14.4659 | 4.0734 |  |
| primitive | mreact | workspace | update every 10th in 10k rows | completed | duration | ms | 2.2589 | 15 | 1.7672489999968093 | 12.215422000008402 | 3.2675 | 2.2589 | 3.8839 | 12.2154 | 2.5284 |  |
| primitive | mreact | workspace | select row in 10k rows | completed | duration | ms | 0.0912 | 15 | 0.08245499999611638 | 0.18211300000257324 | 0.0973 | 0.0912 | 0.0958 | 0.1821 | 0.0231 |  |
| primitive | mreact | workspace | append 1k rows to 10k rows | completed | duration | ms | 10.2972 | 15 | 9.076098000005004 | 20.602734000000055 | 13.5392 | 10.2972 | 18.4087 | 20.6027 | 4.5843 |  |
| primitive | mreact | workspace | remove row from 1k rows | completed | duration | ms | 0.1517 | 15 | 0.13444300000264775 | 1.1179159999883268 | 0.222 | 0.1517 | 0.18 | 1.1179 | 0.2402 |  |
| primitive | mreact | workspace | clear 10k rows | completed | duration | ms | 17.9596 | 15 | 17.04274699999951 | 29.526645999998436 | 18.6337 | 17.9596 | 18.4836 | 29.5266 | 2.9616 |  |
| primitive | mreact | workspace | keyed reverse 1k rows | completed | duration | ms | 1.4893 | 15 | 1.466612999996869 | 1.6018380000023171 | 1.5034 | 1.4893 | 1.5199 | 1.6018 | 0.0356 |  |
| primitive | mreact | workspace | text binding update 1k | completed | duration | ms | 0.1157 | 15 | 0.11077800000202842 | 0.842798000012408 | 0.1772 | 0.1157 | 0.1466 | 0.8428 | 0.1812 |  |
| primitive | mreact | workspace | computed fan-out 1k | completed | duration | ms | 0.1236 | 15 | 0.11304299999028444 | 9.866007000004174 | 0.7731 | 0.1236 | 0.1265 | 9.866 | 2.4302 |  |
| primitive | mreact | workspace | computed fan-in 1k | completed | duration | ms | 0.0621 | 15 | 0.05523399999947287 | 0.5037589999992633 | 0.0934 | 0.0621 | 0.0674 | 0.5038 | 0.11 |  |
| primitive | mreact | workspace | repeated create update clear memory | completed | memory | bytes | 47059016 | 15 | 0 | 50575368 | 42849011.2 | 47059016 | 47623408 | 50575368 | 11700873.147 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
