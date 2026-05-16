# Primitive Benchmark

## Environment

- Date: 2026-05-16
- Git commit: ede4856ae3930d6faed308607fafec6a64571ab1
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
| 1 | mreact | create 1k rows | 3.9602 | ms |
| 2 | react | create 1k rows | 4.5297 | ms |
| 3 | solid | create 1k rows | 4.6141 | ms |
| 4 | solid-v2 | create 1k rows | 4.8098 | ms |
| 5 | qwik | create 1k rows | 5.782 | ms |
| 6 | marko | create 1k rows | 7.6883 | ms |

### replace all 1k rows

Replaces an existing 1,000-row keyed list with a fresh 1,000-row dataset.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | replace all 1k rows | 4.6008 | ms |
| 2 | solid-v2 | replace all 1k rows | 5.3857 | ms |
| 3 | solid | replace all 1k rows | 5.8189 | ms |
| 4 | marko | replace all 1k rows | 7.1731 | ms |
| 5 | react | replace all 1k rows | 7.7009 | ms |
| 6 | qwik | replace all 1k rows | 8.1544 | ms |

### update every 10th in 10k rows

Updates the text of every tenth row in a 10,000-row keyed list while preserving the existing row nodes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | update every 10th in 10k rows | 2.1422 | ms |
| 2 | react | update every 10th in 10k rows | 2.8817 | ms |
| 3 | marko | update every 10th in 10k rows | 21.7615 | ms |
| 4 | qwik | update every 10th in 10k rows | 67.0369 | ms |
| 5 | solid-v2 | update every 10th in 10k rows | 74.8087 | ms |
| 6 | solid | update every 10th in 10k rows | 84.7267 | ms |

### select row in 10k rows

Selects one row in a 10,000-row list by toggling selection attributes without changing row text.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | select row in 10k rows | 0.0824 | ms |
| 2 | react | select row in 10k rows | 2.2719 | ms |
| 3 | marko | select row in 10k rows | 21.253 | ms |
| 4 | solid | select row in 10k rows | 30.2805 | ms |
| 5 | solid-v2 | select row in 10k rows | 32.6764 | ms |
| 6 | qwik | select row in 10k rows | 67.7052 | ms |

### append 1k rows to 10k rows

Appends 1,000 keyed rows to an existing 10,000-row list and validates the 11,000-row DOM.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | react | append 1k rows to 10k rows | 9.2737 | ms |
| 2 | mreact | append 1k rows to 10k rows | 9.6872 | ms |
| 3 | marko | append 1k rows to 10k rows | 31.0555 | ms |
| 4 | qwik | append 1k rows to 10k rows | 73.6798 | ms |
| 5 | solid | append 1k rows to 10k rows | 83.7414 | ms |
| 6 | solid-v2 | append 1k rows to 10k rows | 83.8866 | ms |

### remove row from 1k rows

Removes one keyed row from the middle of an existing 1,000-row list.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | remove row from 1k rows | 0.1304 | ms |
| 2 | react | remove row from 1k rows | 0.1799 | ms |
| 3 | marko | remove row from 1k rows | 0.5821 | ms |
| 4 | solid | remove row from 1k rows | 1.8755 | ms |
| 5 | solid-v2 | remove row from 1k rows | 1.8786 | ms |
| 6 | qwik | remove row from 1k rows | 2.5703 | ms |

### clear 10k rows

Clears an existing 10,000-row list and validates that no row elements remain.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | solid-v2 | clear 10k rows | 17.1784 | ms |
| 2 | solid | clear 10k rows | 17.4604 | ms |
| 3 | mreact | clear 10k rows | 18.438 | ms |
| 4 | qwik | clear 10k rows | 31.9681 | ms |
| 5 | react | clear 10k rows | 34.9143 | ms |
| 6 | marko | clear 10k rows | 36.6769 | ms |

### keyed reverse 1k rows

Reverses 1,000 keyed rows and verifies that DOM node identity is preserved.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | keyed reverse 1k rows | 1.4954 | ms |
| 2 | solid-v2 | keyed reverse 1k rows | 2.2786 | ms |
| 3 | solid | keyed reverse 1k rows | 2.3452 | ms |
| 4 | react | keyed reverse 1k rows | 3.2788 | ms |
| 5 | marko | keyed reverse 1k rows | 3.5311 | ms |
| 6 | qwik | keyed reverse 1k rows | 4.9544 | ms |

### create 1k event targets

Creates 1,000 button event targets and measures initial interactive wiring cost without dispatching events.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | solid-v2 | create 1k event targets | 4.9733 | ms |
| 2 | mreact | create 1k event targets | 5.1427 | ms |
| 3 | solid | create 1k event targets | 5.2124 | ms |
| 4 | react | create 1k event targets | 7.718 | ms |
| 5 | qwik | create 1k event targets | 7.9009 | ms |
| 6 | marko | create 1k event targets | 17.3365 | ms |

### text binding update 1k

Updates one reactive text value that is bound to 1,000 text nodes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | mreact | text binding update 1k | 0.1157 | ms |
| 2 | solid | text binding update 1k | 0.119 | ms |
| 3 | solid-v2 | text binding update 1k | 0.119 | ms |
| 4 | react | text binding update 1k | 0.3731 | ms |
| 5 | marko | text binding update 1k | 0.8198 | ms |
| 6 | qwik | text binding update 1k | 0.9858 | ms |

### computed fan-out 1k

Updates one source value that fans out through a derived value into 1,000 displayed text nodes.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | solid | computed fan-out 1k | 0.1129 | ms |
| 2 | mreact | computed fan-out 1k | 0.1152 | ms |
| 3 | solid-v2 | computed fan-out 1k | 0.1172 | ms |
| 4 | react | computed fan-out 1k | 0.3293 | ms |
| 5 | marko | computed fan-out 1k | 0.7828 | ms |
| 6 | qwik | computed fan-out 1k | 0.9461 | ms |

### computed fan-in 1k

Updates 1,000 source values and validates one derived aggregate text output.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | qwik | computed fan-in 1k | 0.0125 | ms |
| 2 | marko | computed fan-in 1k | 0.0159 | ms |
| 3 | react | computed fan-in 1k | 0.0337 | ms |
| 4 | solid-v2 | computed fan-in 1k | 0.0347 | ms |
| 5 | mreact | computed fan-in 1k | 0.0599 | ms |
| 6 | solid | computed fan-in 1k | 12.7558 | ms |

### repeated create update clear memory

Reports heap growth after repeatedly creating, updating, and clearing 1,000-row lists.

| rank | framework | case | value | unit |
| ---: | --- | --- | ---: | --- |
| 1 | marko | repeated create update clear memory | 0 | bytes |
| 2 | mreact | repeated create update clear memory | 0 | bytes |
| 3 | qwik | repeated create update clear memory | 0 | bytes |
| 4 | react | repeated create update clear memory | 13506608 | bytes |
| 5 | solid | repeated create update clear memory | 51166816 | bytes |
| 6 | solid-v2 | repeated create update clear memory | 51511944 | bytes |

## Results

| suite | framework | version | case | status | metric | unit | value | sample count | min | max | mean | median | p75 | p95 | standard deviation | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| primitive | marko | 5.38.39 | create 1k rows | completed | duration | ms | 7.6883 | 15 | 5.9465509999999995 | 11.884947000000011 | 8.0336 | 7.6883 | 10.0126 | 11.8849 | 1.7171 |  |
| primitive | marko | 5.38.39 | replace all 1k rows | completed | duration | ms | 7.1731 | 15 | 6.925002000000063 | 12.1135569999999 | 8.1026 | 7.1731 | 7.7246 | 12.1136 | 1.8069 |  |
| primitive | marko | 5.38.39 | update every 10th in 10k rows | completed | duration | ms | 21.7615 | 15 | 20.905913000000055 | 25.712888999999905 | 22.1793 | 21.7615 | 22.6363 | 25.7129 | 1.1754 |  |
| primitive | marko | 5.38.39 | select row in 10k rows | completed | duration | ms | 21.253 | 15 | 20.392377000000124 | 30.39257600000019 | 22.6544 | 21.253 | 24.3275 | 30.3926 | 2.6312 |  |
| primitive | marko | 5.38.39 | append 1k rows to 10k rows | completed | duration | ms | 31.0555 | 15 | 29.822884999999587 | 39.07018699999935 | 32.1293 | 31.0555 | 32.0431 | 39.0702 | 2.6962 |  |
| primitive | marko | 5.38.39 | remove row from 1k rows | completed | duration | ms | 0.5821 | 15 | 0.5535519999993994 | 0.7390309999991587 | 0.5987 | 0.5821 | 0.6324 | 0.739 | 0.0477 |  |
| primitive | marko | 5.38.39 | clear 10k rows | completed | duration | ms | 36.6769 | 15 | 34.50472500000069 | 48.386819999999716 | 38.0691 | 36.6769 | 37.5133 | 48.3868 | 4.1416 |  |
| primitive | marko | 5.38.39 | keyed reverse 1k rows | completed | duration | ms | 3.5311 | 15 | 3.4523969999972905 | 7.7233740000010584 | 3.814 | 3.5311 | 3.5536 | 7.7234 | 1.0462 |  |
| primitive | marko | 5.38.39 | create 1k event targets | completed | duration | ms | 17.3365 | 15 | 8.432440000000497 | 18.883496999998897 | 13.7008 | 17.3365 | 17.9811 | 18.8835 | 4.6383 |  |
| primitive | marko | 5.38.39 | text binding update 1k | completed | duration | ms | 0.8198 | 15 | 0.7088129999974626 | 1.5178960000012012 | 0.9212 | 0.8198 | 0.9447 | 1.5179 | 0.2267 |  |
| primitive | marko | 5.38.39 | computed fan-out 1k | completed | duration | ms | 0.7828 | 15 | 0.7344620000003488 | 0.8893040000002657 | 0.7929 | 0.7828 | 0.8323 | 0.8893 | 0.0448 |  |
| primitive | marko | 5.38.39 | computed fan-in 1k | completed | duration | ms | 0.0159 | 15 | 0.014247000002796995 | 0.031069000000570668 | 0.0175 | 0.0159 | 0.018 | 0.0311 | 0.0043 |  |
| primitive | marko | 5.38.39 | repeated create update clear memory | completed | memory | bytes | 0 | 15 | 0 | 55533432 | 3702228.8 | 0 | 0 | 55533432 | 13852471.737 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | qwik | 1.19.2 | create 1k rows | completed | duration | ms | 5.782 | 15 | 5.151123999999982 | 10.204193000001396 | 6.1934 | 5.782 | 6.3122 | 10.2042 | 1.2567 |  |
| primitive | qwik | 1.19.2 | replace all 1k rows | completed | duration | ms | 8.1544 | 15 | 7.609009999996488 | 8.910908999998355 | 8.138 | 8.1544 | 8.2928 | 8.9109 | 0.3646 |  |
| primitive | qwik | 1.19.2 | update every 10th in 10k rows | completed | duration | ms | 67.0369 | 15 | 55.09583600000042 | 78.89825099999871 | 65.0317 | 67.0369 | 69.3439 | 78.8983 | 6.7162 |  |
| primitive | qwik | 1.19.2 | select row in 10k rows | completed | duration | ms | 67.7052 | 15 | 55.733768000001874 | 112.6441679999989 | 68.0121 | 67.7052 | 69.532 | 112.6442 | 12.9675 |  |
| primitive | qwik | 1.19.2 | append 1k rows to 10k rows | completed | duration | ms | 73.6798 | 15 | 64.16858200000206 | 97.05744600000253 | 75.0634 | 73.6798 | 75.3447 | 97.0574 | 7.0435 |  |
| primitive | qwik | 1.19.2 | remove row from 1k rows | completed | duration | ms | 2.5703 | 15 | 2.3547209999960614 | 12.16230799999903 | 4.9357 | 2.5703 | 11.3401 | 12.1623 | 4.0326 |  |
| primitive | qwik | 1.19.2 | clear 10k rows | completed | duration | ms | 31.9681 | 15 | 30.11988399999973 | 131.83424399999785 | 40.2423 | 31.9681 | 36.6416 | 131.8342 | 24.86 |  |
| primitive | qwik | 1.19.2 | keyed reverse 1k rows | completed | duration | ms | 4.9544 | 15 | 4.735912999996799 | 12.954760000000533 | 6.1409 | 4.9544 | 5.4101 | 12.9548 | 2.6785 |  |
| primitive | qwik | 1.19.2 | create 1k event targets | completed | duration | ms | 7.9009 | 15 | 6.60803599999781 | 17.312180000000808 | 11.0598 | 7.9009 | 15.4067 | 17.3122 | 4.3134 | Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events. |
| primitive | qwik | 1.19.2 | text binding update 1k | completed | duration | ms | 0.9858 | 15 | 0.9277260000017122 | 9.300051999998686 | 1.6008 | 0.9858 | 1.128 | 9.3001 | 2.0634 |  |
| primitive | qwik | 1.19.2 | computed fan-out 1k | completed | duration | ms | 0.9461 | 15 | 0.893501999998989 | 1.2048270000013872 | 0.9857 | 0.9461 | 1.0334 | 1.2048 | 0.0822 |  |
| primitive | qwik | 1.19.2 | computed fan-in 1k | completed | duration | ms | 0.0125 | 15 | 0.01147099999798229 | 0.09231400000135181 | 0.0182 | 0.0125 | 0.0136 | 0.0923 | 0.0199 |  |
| primitive | qwik | 1.19.2 | repeated create update clear memory | completed | memory | bytes | 0 | 15 | 0 | 27851624 | 12960474.1333 | 0 | 27818640 | 27851624 | 13855553.6259 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | qwik-v2 | 2.0.0-beta.35 | create 1k rows | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | qwik-v2 | 2.0.0-beta.35 | replace all 1k rows | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | qwik-v2 | 2.0.0-beta.35 | update every 10th in 10k rows | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | qwik-v2 | 2.0.0-beta.35 | select row in 10k rows | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | qwik-v2 | 2.0.0-beta.35 | append 1k rows to 10k rows | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | qwik-v2 | 2.0.0-beta.35 | remove row from 1k rows | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | qwik-v2 | 2.0.0-beta.35 | clear 10k rows | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | qwik-v2 | 2.0.0-beta.35 | keyed reverse 1k rows | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | qwik-v2 | 2.0.0-beta.35 | create 1k event targets | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | qwik-v2 | 2.0.0-beta.35 | text binding update 1k | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | qwik-v2 | 2.0.0-beta.35 | computed fan-out 1k | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | qwik-v2 | 2.0.0-beta.35 | computed fan-in 1k | unsupported | duration | ms | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | qwik-v2 | 2.0.0-beta.35 | repeated create update clear memory | unsupported | memory | bytes | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | create 1k rows | completed | duration | ms | 4.5297 | 15 | 4.073617000001832 | 8.910499999998137 | 5.1504 | 4.5297 | 4.8132 | 8.9105 | 1.5885 |  |
| primitive | react | 19.2.6 | replace all 1k rows | completed | duration | ms | 7.7009 | 15 | 6.720606999995653 | 10.386327000000165 | 8.3443 | 7.7009 | 9.8367 | 10.3863 | 1.4682 |  |
| primitive | react | 19.2.6 | update every 10th in 10k rows | completed | duration | ms | 2.8817 | 15 | 2.3963199999998324 | 16.523025000002235 | 5.2278 | 2.8817 | 4.812 | 16.523 | 4.6413 |  |
| primitive | react | 19.2.6 | select row in 10k rows | completed | duration | ms | 2.2719 | 15 | 1.8035449999952107 | 11.456610000001092 | 3.1078 | 2.2719 | 3.4723 | 11.4566 | 2.349 |  |
| primitive | react | 19.2.6 | append 1k rows to 10k rows | completed | duration | ms | 9.2737 | 15 | 7.282455000000482 | 19.14718400000129 | 12.7154 | 9.2737 | 17.5519 | 19.1472 | 4.8953 |  |
| primitive | react | 19.2.6 | remove row from 1k rows | completed | duration | ms | 0.1799 | 15 | 0.1719840000005206 | 0.5747119999941788 | 0.2084 | 0.1799 | 0.198 | 0.5747 | 0.0984 |  |
| primitive | react | 19.2.6 | clear 10k rows | completed | duration | ms | 34.9143 | 15 | 32.63413500000024 | 46.84448899999552 | 35.8574 | 34.9143 | 37.5176 | 46.8445 | 3.5519 |  |
| primitive | react | 19.2.6 | keyed reverse 1k rows | completed | duration | ms | 3.2788 | 15 | 3.2488139999986743 | 3.694633999999496 | 3.3172 | 3.2788 | 3.304 | 3.6946 | 0.1107 |  |
| primitive | react | 19.2.6 | create 1k event targets | completed | duration | ms | 7.718 | 15 | 5.1324489999969956 | 15.287661000002117 | 9.6829 | 7.718 | 14.206 | 15.2877 | 4.3315 |  |
| primitive | react | 19.2.6 | text binding update 1k | completed | duration | ms | 0.3731 | 15 | 0.3263040000019828 | 0.7347720000034315 | 0.4191 | 0.3731 | 0.4416 | 0.7348 | 0.1112 |  |
| primitive | react | 19.2.6 | computed fan-out 1k | completed | duration | ms | 0.3293 | 15 | 0.31657600000471575 | 0.6033260000040173 | 0.3634 | 0.3293 | 0.3434 | 0.6033 | 0.0835 |  |
| primitive | react | 19.2.6 | computed fan-in 1k | completed | duration | ms | 0.0337 | 15 | 0.03126900000643218 | 0.13131699999939883 | 0.04 | 0.0337 | 0.035 | 0.1313 | 0.0245 |  |
| primitive | react | 19.2.6 | repeated create update clear memory | completed | memory | bytes | 13506608 | 15 | 0 | 13965584 | 9859758.9333 | 13506608 | 13795784 | 13965584 | 5479275.5708 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | solid | 1.9.12 | create 1k rows | completed | duration | ms | 4.6141 | 15 | 4.26748100000259 | 15.375005000001693 | 7.1573 | 4.6141 | 12.8615 | 15.375 | 4.3014 |  |
| primitive | solid | 1.9.12 | replace all 1k rows | completed | duration | ms | 5.8189 | 15 | 5.170631000000867 | 16.039957000000868 | 8.8922 | 5.8189 | 15.1347 | 16.04 | 4.7052 |  |
| primitive | solid | 1.9.12 | update every 10th in 10k rows | completed | duration | ms | 84.7267 | 15 | 73.94338799999969 | 186.57515599999897 | 89.3879 | 84.7267 | 89.0716 | 186.5752 | 26.9378 |  |
| primitive | solid | 1.9.12 | select row in 10k rows | completed | duration | ms | 30.2805 | 15 | 20.855049000005238 | 52.829923999997845 | 30.6774 | 30.2805 | 30.747 | 52.8299 | 6.5553 |  |
| primitive | solid | 1.9.12 | append 1k rows to 10k rows | completed | duration | ms | 83.7414 | 15 | 75.5582179999983 | 167.86581699999806 | 87.3272 | 83.7414 | 87.7017 | 167.8658 | 22.2064 |  |
| primitive | solid | 1.9.12 | remove row from 1k rows | completed | duration | ms | 1.8755 | 15 | 1.8391110000011395 | 2.8606629999994766 | 1.9768 | 1.8755 | 1.9691 | 2.8607 | 0.2511 |  |
| primitive | solid | 1.9.12 | clear 10k rows | completed | duration | ms | 17.4604 | 15 | 16.193234999998822 | 28.756418000004487 | 19.4882 | 17.4604 | 21.1074 | 28.7564 | 4.13 |  |
| primitive | solid | 1.9.12 | keyed reverse 1k rows | completed | duration | ms | 2.3452 | 15 | 2.297062999998161 | 3.4723850000009406 | 2.4234 | 2.3452 | 2.3724 | 3.4724 | 0.282 |  |
| primitive | solid | 1.9.12 | create 1k event targets | completed | duration | ms | 5.2124 | 15 | 4.963511000001745 | 15.407525999995414 | 8.9738 | 5.2124 | 14.5854 | 15.4075 | 4.7602 |  |
| primitive | solid | 1.9.12 | text binding update 1k | completed | duration | ms | 0.119 | 15 | 0.10625000000436557 | 0.22011500000371598 | 0.1221 | 0.119 | 0.1207 | 0.2201 | 0.0268 |  |
| primitive | solid | 1.9.12 | computed fan-out 1k | completed | duration | ms | 0.1129 | 15 | 0.10929599999508355 | 0.2308950000006007 | 0.1222 | 0.1129 | 0.117 | 0.2309 | 0.0297 |  |
| primitive | solid | 1.9.12 | computed fan-in 1k | completed | duration | ms | 12.7558 | 15 | 12.642002000000502 | 13.77907199999754 | 12.9137 | 12.7558 | 12.9451 | 13.7791 | 0.3504 |  |
| primitive | solid | 1.9.12 | repeated create update clear memory | completed | memory | bytes | 51166816 | 15 | 0 | 58770384 | 49647161.0667 | 51166816 | 57303376 | 58770384 | 13656288.1257 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | solid-v2 | 2.0.0-beta.13 | create 1k rows | completed | duration | ms | 4.8098 | 15 | 4.3744429999933345 | 16.111871999994037 | 8.2048 | 4.8098 | 15.017 | 16.1119 | 5.1194 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | replace all 1k rows | completed | duration | ms | 5.3857 | 15 | 5.147698000000673 | 19.53505399999267 | 8.5567 | 5.3857 | 15.1104 | 19.5351 | 4.8776 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | update every 10th in 10k rows | completed | duration | ms | 74.8087 | 15 | 72.80796200000623 | 369.6033210000023 | 97.4111 | 74.8087 | 85.2262 | 369.6033 | 72.9133 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | select row in 10k rows | completed | duration | ms | 32.6764 | 15 | 25.570632999995723 | 55.44009699999879 | 33.8589 | 32.6764 | 33.4701 | 55.4401 | 6.173 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | append 1k rows to 10k rows | completed | duration | ms | 83.8866 | 15 | 75.80971199998748 | 215.82980500000122 | 91.2958 | 83.8866 | 88.2574 | 215.8298 | 33.6411 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | remove row from 1k rows | completed | duration | ms | 1.8786 | 15 | 1.85147500000312 | 11.458525000009104 | 2.5179 | 1.8786 | 1.8854 | 11.4585 | 2.3896 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | clear 10k rows | completed | duration | ms | 17.1784 | 15 | 16.508908999996493 | 27.39754200000607 | 18.8258 | 17.1784 | 18.7219 | 27.3975 | 3.4292 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | keyed reverse 1k rows | completed | duration | ms | 2.2786 | 15 | 2.206833000003826 | 2.388214999999036 | 2.2761 | 2.2786 | 2.2934 | 2.3882 | 0.0419 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | create 1k event targets | completed | duration | ms | 4.9733 | 15 | 4.823036999994656 | 16.357605000011972 | 8.8693 | 4.9733 | 14.4116 | 16.3576 | 4.9024 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | text binding update 1k | completed | duration | ms | 0.119 | 15 | 0.10933500000101048 | 0.25319600000511855 | 0.1278 | 0.119 | 0.1241 | 0.2532 | 0.0341 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | computed fan-out 1k | completed | duration | ms | 0.1172 | 15 | 0.10861400001158472 | 0.2719819999911124 | 0.1266 | 0.1172 | 0.1215 | 0.272 | 0.0394 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | computed fan-in 1k | completed | duration | ms | 0.0347 | 15 | 0.026719999994384125 | 0.2541590000037104 | 0.076 | 0.0347 | 0.0701 | 0.2542 | 0.0753 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | repeated create update clear memory | completed | memory | bytes | 51511944 | 15 | 0 | 65600656 | 50195714.6667 | 51511944 | 57384744 | 65600656 | 14055822.3496 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | mreact | workspace | create 1k rows | completed | duration | ms | 3.9602 | 15 | 3.812183999994886 | 8.274341999989701 | 4.5093 | 3.9602 | 4.4541 | 8.2743 | 1.2106 |  |
| primitive | mreact | workspace | replace all 1k rows | completed | duration | ms | 4.6008 | 15 | 4.489508999991813 | 9.332292999999481 | 5.0453 | 4.6008 | 5.0233 | 9.3323 | 1.1834 |  |
| primitive | mreact | workspace | update every 10th in 10k rows | completed | duration | ms | 2.1422 | 15 | 1.7155889999994542 | 4.354294999997364 | 2.3794 | 2.1422 | 2.8439 | 4.3543 | 0.7045 |  |
| primitive | mreact | workspace | select row in 10k rows | completed | duration | ms | 0.0824 | 15 | 0.0692410000046948 | 0.862673999989056 | 0.1437 | 0.0824 | 0.0896 | 0.8627 | 0.1969 |  |
| primitive | mreact | workspace | append 1k rows to 10k rows | completed | duration | ms | 9.6872 | 15 | 9.134491000004346 | 20.177293000000645 | 11.5172 | 9.6872 | 10.5344 | 20.1773 | 3.8219 |  |
| primitive | mreact | workspace | remove row from 1k rows | completed | duration | ms | 0.1304 | 15 | 0.12515500000154134 | 3.02033400000073 | 0.3911 | 0.1304 | 0.1643 | 3.0203 | 0.7409 |  |
| primitive | mreact | workspace | clear 10k rows | completed | duration | ms | 18.438 | 15 | 17.303585000001476 | 322.5365179999935 | 39.2659 | 18.438 | 18.8109 | 322.5365 | 75.7417 |  |
| primitive | mreact | workspace | keyed reverse 1k rows | completed | duration | ms | 1.4954 | 15 | 1.4704780000029132 | 1.5752150000043912 | 1.507 | 1.4954 | 1.5155 | 1.5752 | 0.0298 |  |
| primitive | mreact | workspace | create 1k event targets | completed | duration | ms | 5.1427 | 15 | 4.837463999996544 | 277.2461229999899 | 27.7816 | 5.1427 | 14.82 | 277.2461 | 67.625 |  |
| primitive | mreact | workspace | text binding update 1k | completed | duration | ms | 0.1157 | 15 | 0.10958600000594743 | 0.9889620000030845 | 0.1868 | 0.1157 | 0.1388 | 0.989 | 0.218 |  |
| primitive | mreact | workspace | computed fan-out 1k | completed | duration | ms | 0.1152 | 15 | 0.10842400000547059 | 0.14253800000005867 | 0.1167 | 0.1152 | 0.1182 | 0.1425 | 0.0078 |  |
| primitive | mreact | workspace | computed fan-in 1k | completed | duration | ms | 0.0599 | 15 | 0.05400200000440236 | 1.124045999997179 | 0.1329 | 0.0599 | 0.0724 | 1.124 | 0.265 |  |
| primitive | mreact | workspace | repeated create update clear memory | completed | memory | bytes | 0 | 15 | 0 | 52585848 | 10480350.4 | 0 | 0 | 52585848 | 20961010.3011 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
