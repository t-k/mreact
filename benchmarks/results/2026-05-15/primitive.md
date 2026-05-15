# Primitive Benchmark

## Environment

- Date: 2026-05-15
- Git commit: 8b233191adf6d2a0f7956a2127a68bd57c5fd189
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
| 1 | mreact | create 1k rows | 4.6609 | ms |
| 2 | react | create 1k rows | 4.9384 | ms |
| 3 | solid | create 1k rows | 4.9431 | ms |
| 4 | qwik | create 1k rows | 6.3557 | ms |
| 5 | marko | create 1k rows | 9.5157 | ms |

### replace all 1k rows

Replaces an existing 1,000-row keyed list with a fresh 1,000-row dataset.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | replace all 1k rows | 5.3143 | ms |
| 2 | solid | replace all 1k rows | 6.2052 | ms |
| 3 | marko | replace all 1k rows | 8.4402 | ms |
| 4 | qwik | replace all 1k rows | 8.7139 | ms |
| 5 | react | replace all 1k rows | 15.7232 | ms |

### update every 10th in 10k rows

Updates the text of every tenth row in a 10,000-row keyed list while preserving the existing row nodes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | update every 10th in 10k rows | 2.854 | ms |
| 2 | react | update every 10th in 10k rows | 3.4282 | ms |
| 3 | marko | update every 10th in 10k rows | 25.4064 | ms |
| 4 | qwik | update every 10th in 10k rows | 55.6862 | ms |
| 5 | solid | update every 10th in 10k rows | 87.2426 | ms |

### select row in 10k rows

Selects one row in a 10,000-row list by toggling selection attributes without changing row text.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | react | select row in 10k rows | 2.2865 | ms |
| 2 | marko | select row in 10k rows | 21.7438 | ms |
| 3 | solid | select row in 10k rows | 35.7429 | ms |
| 4 | mreact | select row in 10k rows | 54.2829 | ms |
| 5 | qwik | select row in 10k rows | 66.757 | ms |

### append 1k rows to 10k rows

Appends 1,000 keyed rows to an existing 10,000-row list and validates the 11,000-row DOM.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | react | append 1k rows to 10k rows | 9.4923 | ms |
| 2 | marko | append 1k rows to 10k rows | 34.0185 | ms |
| 3 | mreact | append 1k rows to 10k rows | 38.1171 | ms |
| 4 | qwik | append 1k rows to 10k rows | 71.8287 | ms |
| 5 | solid | append 1k rows to 10k rows | 92.5324 | ms |

### remove row from 1k rows

Removes one keyed row from the middle of an existing 1,000-row list.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | react | remove row from 1k rows | 0.2313 | ms |
| 2 | marko | remove row from 1k rows | 0.6583 | ms |
| 3 | mreact | remove row from 1k rows | 1.614 | ms |
| 4 | solid | remove row from 1k rows | 1.9259 | ms |
| 5 | qwik | remove row from 1k rows | 2.5798 | ms |

### clear 10k rows

Clears an existing 10,000-row list and validates that no row elements remain.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | solid | clear 10k rows | 20.713 | ms |
| 2 | mreact | clear 10k rows | 20.8259 | ms |
| 3 | qwik | clear 10k rows | 34.5467 | ms |
| 4 | marko | clear 10k rows | 39.4031 | ms |
| 5 | react | clear 10k rows | 41.5583 | ms |

### keyed reverse 1k rows

Reverses 1,000 keyed rows and verifies that DOM node identity is preserved.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | keyed reverse 1k rows | 1.5629 | ms |
| 2 | solid | keyed reverse 1k rows | 2.3806 | ms |
| 3 | react | keyed reverse 1k rows | 3.5269 | ms |
| 4 | marko | keyed reverse 1k rows | 3.583 | ms |
| 5 | qwik | keyed reverse 1k rows | 5.0435 | ms |

### text binding update 1k

Updates one reactive text value that is bound to 1,000 text nodes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | solid | text binding update 1k | 0.1191 | ms |
| 2 | mreact | text binding update 1k | 0.1335 | ms |
| 3 | react | text binding update 1k | 0.4667 | ms |
| 4 | qwik | text binding update 1k | 1.0001 | ms |
| 5 | marko | text binding update 1k | 1.0508 | ms |

### computed fan-out 1k

Updates one source value that fans out through a derived value into 1,000 displayed text nodes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | solid | computed fan-out 1k | 0.1165 | ms |
| 2 | mreact | computed fan-out 1k | 0.1351 | ms |
| 3 | react | computed fan-out 1k | 0.5236 | ms |
| 4 | qwik | computed fan-out 1k | 0.9786 | ms |
| 5 | marko | computed fan-out 1k | 0.9789 | ms |

### computed fan-in 1k

Updates 1,000 source values and validates one derived aggregate text output.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | qwik | computed fan-in 1k | 0.0136 | ms |
| 2 | marko | computed fan-in 1k | 0.0174 | ms |
| 3 | react | computed fan-in 1k | 0.0389 | ms |
| 4 | solid | computed fan-in 1k | 13.0946 | ms |
| 5 | mreact | computed fan-in 1k | 27.605 | ms |

### repeated create update clear memory

Reports heap growth after repeatedly creating, updating, and clearing 1,000-row lists.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko | repeated create update clear memory | 43097608 | bytes |
| 2 | solid | repeated create update clear memory | 50120032 | bytes |
| 3 | mreact | repeated create update clear memory | 50314352 | bytes |
| 4 | react | repeated create update clear memory | 57046920 | bytes |
| 5 | qwik | repeated create update clear memory | 102686752 | bytes |

## Results

| suite | framework | version | case | status | metric | unit | value | sample count | min | max | mean | median | p75 | p95 | standard deviation | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| primitive | marko | 5.38.39 | create 1k rows | completed | duration | ms | 9.5157 | 7 | 7.283441999999923 | 12.79025999999999 | 9.7475 | 9.5157 | 12.692 | 12.7903 | 2.0964 |  |
| primitive | marko | 5.38.39 | replace all 1k rows | completed | duration | ms | 8.4402 | 7 | 7.98463199999992 | 19.469083999999953 | 11.7637 | 8.4402 | 18.9934 | 19.4691 | 4.8492 |  |
| primitive | marko | 5.38.39 | update every 10th in 10k rows | completed | duration | ms | 25.4064 | 7 | 22.984303000000182 | 37.083998000000065 | 28.1901 | 25.4064 | 36.9528 | 37.084 | 5.6687 |  |
| primitive | marko | 5.38.39 | select row in 10k rows | completed | duration | ms | 21.7438 | 7 | 20.97606199999973 | 23.345342000000073 | 21.9806 | 21.7438 | 22.9825 | 23.3453 | 0.8594 |  |
| primitive | marko | 5.38.39 | append 1k rows to 10k rows | completed | duration | ms | 34.0185 | 7 | 31.128075000000536 | 44.566655999999966 | 34.7237 | 34.0185 | 34.0948 | 44.5667 | 4.1538 |  |
| primitive | marko | 5.38.39 | remove row from 1k rows | completed | duration | ms | 0.6583 | 7 | 0.5898299999998926 | 0.7982430000001841 | 0.6771 | 0.6583 | 0.7642 | 0.7982 | 0.071 |  |
| primitive | marko | 5.38.39 | clear 10k rows | completed | duration | ms | 39.4031 | 7 | 37.59234500000093 | 48.88970500000141 | 40.6987 | 39.4031 | 41.7985 | 48.8897 | 3.5709 |  |
| primitive | marko | 5.38.39 | keyed reverse 1k rows | completed | duration | ms | 3.583 | 7 | 3.499026999999842 | 16.078881999999794 | 5.4101 | 3.583 | 3.873 | 16.0789 | 4.3573 |  |
| primitive | marko | 5.38.39 | text binding update 1k | completed | duration | ms | 1.0508 | 7 | 0.9039620000003197 | 1.6555970000008529 | 1.1314 | 1.0508 | 1.2649 | 1.6556 | 0.2378 |  |
| primitive | marko | 5.38.39 | computed fan-out 1k | completed | duration | ms | 0.9789 | 7 | 0.776291999998648 | 11.825263999999152 | 2.489 | 0.9789 | 1.0711 | 11.8253 | 3.8127 |  |
| primitive | marko | 5.38.39 | computed fan-in 1k | completed | duration | ms | 0.0174 | 7 | 0.014777000000322005 | 0.01955699999962235 | 0.0172 | 0.0174 | 0.0191 | 0.0196 | 0.0017 |  |
| primitive | marko | 5.38.39 | repeated create update clear memory | completed | memory | bytes | 43097608 | 7 | 0 | 55635976 | 39733129.1429 | 43097608 | 48872256 | 55635976 | 16799847.1273 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | qwik | 1.19.2 | create 1k rows | completed | duration | ms | 6.3557 | 7 | 5.642011999998431 | 16.35446099999899 | 9.0239 | 6.3557 | 16.1714 | 16.3545 | 4.5915 |  |
| primitive | qwik | 1.19.2 | replace all 1k rows | completed | duration | ms | 8.7139 | 7 | 8.055807000000641 | 20.30838500000027 | 13.0543 | 8.7139 | 18.9791 | 20.3084 | 5.429 |  |
| primitive | qwik | 1.19.2 | update every 10th in 10k rows | completed | duration | ms | 55.6862 | 7 | 53.35734700000103 | 70.97500600000058 | 59.4621 | 55.6862 | 65.2485 | 70.975 | 6.1092 |  |
| primitive | qwik | 1.19.2 | select row in 10k rows | completed | duration | ms | 66.757 | 7 | 51.72686700000122 | 77.32389900000089 | 66.018 | 66.757 | 68.9559 | 77.3239 | 7.1585 |  |
| primitive | qwik | 1.19.2 | append 1k rows to 10k rows | completed | duration | ms | 71.8287 | 7 | 62.18115000000034 | 84.88088699999935 | 72.81 | 71.8287 | 76.8907 | 84.8809 | 6.3877 |  |
| primitive | qwik | 1.19.2 | remove row from 1k rows | completed | duration | ms | 2.5798 | 7 | 2.506478999999672 | 14.629312999997637 | 4.4568 | 2.5798 | 3.519 | 14.6293 | 4.1659 |  |
| primitive | qwik | 1.19.2 | clear 10k rows | completed | duration | ms | 34.5467 | 7 | 30.88137099999949 | 43.622519000000466 | 34.8036 | 34.5467 | 36.4627 | 43.6225 | 4.1229 |  |
| primitive | qwik | 1.19.2 | keyed reverse 1k rows | completed | duration | ms | 5.0435 | 7 | 4.759980999999243 | 5.147891999997228 | 4.9938 | 5.0435 | 5.1223 | 5.1479 | 0.1375 |  |
| primitive | qwik | 1.19.2 | text binding update 1k | completed | duration | ms | 1.0001 | 7 | 0.9652879999994184 | 1.2576780000017607 | 1.0583 | 1.0001 | 1.1338 | 1.2577 | 0.0969 |  |
| primitive | qwik | 1.19.2 | computed fan-out 1k | completed | duration | ms | 0.9786 | 7 | 0.877332000000024 | 9.318414000001212 | 2.2648 | 0.9786 | 1.7199 | 9.3184 | 2.8925 |  |
| primitive | qwik | 1.19.2 | computed fan-in 1k | completed | duration | ms | 0.0136 | 7 | 0.012062000001606066 | 0.01504900000145426 | 0.0136 | 0.0136 | 0.0148 | 0.015 | 0.001 |  |
| primitive | qwik | 1.19.2 | repeated create update clear memory | completed | memory | bytes | 102686752 | 7 | 0 | 107458248 | 87991939.4286 | 102686752 | 103586264 | 107458248 | 36014799.4434 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | react | 19.2.6 | create 1k rows | completed | duration | ms | 4.9384 | 7 | 4.5503870000029565 | 13.841449999999895 | 8.4442 | 4.9384 | 13.4342 | 13.8414 | 4.3035 |  |
| primitive | react | 19.2.6 | replace all 1k rows | completed | duration | ms | 15.7232 | 7 | 7.414749999999913 | 17.68426499999987 | 12.7212 | 15.7232 | 17.1726 | 17.6843 | 4.5273 |  |
| primitive | react | 19.2.6 | update every 10th in 10k rows | completed | duration | ms | 3.4282 | 7 | 2.9326810000020487 | 5.652201000000787 | 3.7264 | 3.4282 | 3.9256 | 5.6522 | 0.8465 |  |
| primitive | react | 19.2.6 | select row in 10k rows | completed | duration | ms | 2.2865 | 7 | 1.7792300000000978 | 12.47405499999877 | 3.7682 | 2.2865 | 3.1085 | 12.4741 | 3.5763 |  |
| primitive | react | 19.2.6 | append 1k rows to 10k rows | completed | duration | ms | 9.4923 | 7 | 8.43496099999902 | 18.248616999997466 | 10.6725 | 9.4923 | 10.4767 | 18.2486 | 3.1546 |  |
| primitive | react | 19.2.6 | remove row from 1k rows | completed | duration | ms | 0.2313 | 7 | 0.1904790000007779 | 0.5318709999992279 | 0.2649 | 0.2313 | 0.2485 | 0.5319 | 0.1105 |  |
| primitive | react | 19.2.6 | clear 10k rows | completed | duration | ms | 41.5583 | 7 | 32.118891000001895 | 51.18655099999887 | 40.0241 | 41.5583 | 42.2913 | 51.1866 | 6.0072 |  |
| primitive | react | 19.2.6 | keyed reverse 1k rows | completed | duration | ms | 3.5269 | 7 | 3.2903750000004948 | 17.086088000000018 | 5.8731 | 3.5269 | 6.5362 | 17.0861 | 4.6986 |  |
| primitive | react | 19.2.6 | text binding update 1k | completed | duration | ms | 0.4667 | 7 | 0.43886599999677856 | 0.7620849999984785 | 0.5089 | 0.4667 | 0.4936 | 0.7621 | 0.1049 |  |
| primitive | react | 19.2.6 | computed fan-out 1k | completed | duration | ms | 0.5236 | 7 | 0.4322940000020026 | 0.9366929999996501 | 0.6078 | 0.5236 | 0.7909 | 0.9367 | 0.1762 |  |
| primitive | react | 19.2.6 | computed fan-in 1k | completed | duration | ms | 0.0389 | 7 | 0.037481000003026566 | 0.05480399999942165 | 0.0433 | 0.0389 | 0.0477 | 0.0548 | 0.0062 |  |
| primitive | react | 19.2.6 | repeated create update clear memory | completed | memory | bytes | 57046920 | 7 | 0 | 65041472 | 50305482.2857 | 57046920 | 58350952 | 65041472 | 20714097.0724 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | solid | 1.9.12 | create 1k rows | completed | duration | ms | 4.9431 | 7 | 4.711941999998089 | 14.740904000002047 | 6.319 | 4.9431 | 5.1733 | 14.7409 | 3.4411 |  |
| primitive | solid | 1.9.12 | replace all 1k rows | completed | duration | ms | 6.2052 | 7 | 6.04298800000106 | 17.74956700000257 | 10.5213 | 6.2052 | 16.1654 | 17.7496 | 5.1262 |  |
| primitive | solid | 1.9.12 | update every 10th in 10k rows | completed | duration | ms | 87.2426 | 7 | 76.08270400000038 | 91.32962000000043 | 84.5662 | 87.2426 | 89.8496 | 91.3296 | 5.8673 |  |
| primitive | solid | 1.9.12 | select row in 10k rows | completed | duration | ms | 35.7429 | 7 | 29.33940900000016 | 43.37188800000149 | 35.9487 | 35.7429 | 38.4296 | 43.3719 | 4.1154 |  |
| primitive | solid | 1.9.12 | append 1k rows to 10k rows | completed | duration | ms | 92.5324 | 7 | 82.97009199999957 | 215.75324700000056 | 107.135 | 92.5324 | 94.5588 | 215.7532 | 44.5492 |  |
| primitive | solid | 1.9.12 | remove row from 1k rows | completed | duration | ms | 1.9259 | 7 | 1.8714830000026268 | 2.55525100000159 | 2.1138 | 1.9259 | 2.4904 | 2.5553 | 0.2772 |  |
| primitive | solid | 1.9.12 | clear 10k rows | completed | duration | ms | 20.713 | 7 | 19.53128199999628 | 23.962415999998484 | 21.0746 | 20.713 | 21.9563 | 23.9624 | 1.5124 |  |
| primitive | solid | 1.9.12 | keyed reverse 1k rows | completed | duration | ms | 2.3806 | 7 | 2.3402659999992466 | 2.511608000000706 | 2.4177 | 2.3806 | 2.4927 | 2.5116 | 0.0651 |  |
| primitive | solid | 1.9.12 | text binding update 1k | completed | duration | ms | 0.1191 | 7 | 0.11708000000362517 | 0.18065000000206055 | 0.1304 | 0.1191 | 0.1301 | 0.1807 | 0.0211 |  |
| primitive | solid | 1.9.12 | computed fan-out 1k | completed | duration | ms | 0.1165 | 7 | 0.11253199999919161 | 0.4080180000019027 | 0.1608 | 0.1165 | 0.143 | 0.408 | 0.1014 |  |
| primitive | solid | 1.9.12 | computed fan-in 1k | completed | duration | ms | 13.0946 | 7 | 13.023008999996819 | 22.496615000003658 | 14.6288 | 13.0946 | 13.9739 | 22.4966 | 3.2314 |  |
| primitive | solid | 1.9.12 | repeated create update clear memory | completed | memory | bytes | 50120032 | 7 | 48527720 | 66375032 | 53861601.1429 | 50120032 | 58641536 | 66375032 | 6183011.3978 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | mreact | workspace | create 1k rows | completed | duration | ms | 4.6609 | 7 | 4.276721999995061 | 15.17830700000195 | 7.4339 | 4.6609 | 14.3368 | 15.1783 | 4.6427 |  |
| primitive | mreact | workspace | replace all 1k rows | completed | duration | ms | 5.3143 | 7 | 5.1097999999983585 | 16.080656000005547 | 8.2683 | 5.3143 | 15.3989 | 16.0807 | 4.7307 |  |
| primitive | mreact | workspace | update every 10th in 10k rows | completed | duration | ms | 2.854 | 7 | 2.463568999999552 | 4.037460999999894 | 3.0569 | 2.854 | 3.4368 | 4.0375 | 0.5259 |  |
| primitive | mreact | workspace | select row in 10k rows | completed | duration | ms | 54.2829 | 7 | 44.23243899999943 | 58.9918170000019 | 53.0749 | 54.2829 | 57.8688 | 58.9918 | 4.6444 |  |
| primitive | mreact | workspace | append 1k rows to 10k rows | completed | duration | ms | 38.1171 | 7 | 36.579140000001644 | 109.09600099999807 | 48.2404 | 38.1171 | 39.8187 | 109.096 | 24.8729 |  |
| primitive | mreact | workspace | remove row from 1k rows | completed | duration | ms | 1.614 | 7 | 1.5876490000009653 | 1.7005219999991823 | 1.6233 | 1.614 | 1.6528 | 1.7005 | 0.0377 |  |
| primitive | mreact | workspace | clear 10k rows | completed | duration | ms | 20.8259 | 7 | 19.81378499999846 | 75.6884229999996 | 29.3272 | 20.8259 | 27.1103 | 75.6884 | 19.0695 |  |
| primitive | mreact | workspace | keyed reverse 1k rows | completed | duration | ms | 1.5629 | 7 | 1.5371639999939362 | 1.5831800000014482 | 1.5585 | 1.5629 | 1.57 | 1.5832 | 0.0158 |  |
| primitive | mreact | workspace | text binding update 1k | completed | duration | ms | 0.1335 | 7 | 0.12164900000061607 | 0.19770199999766191 | 0.1476 | 0.1335 | 0.1706 | 0.1977 | 0.0275 |  |
| primitive | mreact | workspace | computed fan-out 1k | completed | duration | ms | 0.1351 | 7 | 0.12622800000099232 | 0.23034399999596644 | 0.1546 | 0.1351 | 0.1802 | 0.2303 | 0.0352 |  |
| primitive | mreact | workspace | computed fan-in 1k | completed | duration | ms | 27.605 | 7 | 26.635268000005453 | 28.025094000004174 | 27.4365 | 27.605 | 27.6932 | 28.0251 | 0.4363 |  |
| primitive | mreact | workspace | repeated create update clear memory | completed | memory | bytes | 50314352 | 7 | 43528944 | 51286104 | 47812473.1429 | 50314352 | 50622656 | 51286104 | 3337804.4577 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
