# Primitive Benchmark

## Environment

- Date: 2026-05-17
- Git commit: 10d00d651167f0a678058cc7c32cc26d1d9c4320
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

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact | create 1k rows | 3.7465 | best | ms |
| 2 | react | create 1k rows | 3.9644 | +5.82% | ms |
| 3 | solid | create 1k rows | 4.0629 | +8.45% | ms |
| 4 | solid-v2 | create 1k rows | 4.4071 | +17.63% | ms |
| 5 | qwik | create 1k rows | 5.5196 | +47.33% | ms |
| 6 | marko | create 1k rows | 6.8821 | +83.69% | ms |

### replace all 1k rows

Replaces an existing 1,000-row keyed list with a fresh 1,000-row dataset.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact | replace all 1k rows | 4.7236 | best | ms |
| 2 | solid-v2 | replace all 1k rows | 5.2676 | +11.52% | ms |
| 3 | solid | replace all 1k rows | 5.4392 | +15.15% | ms |
| 4 | react | replace all 1k rows | 7.3604 | +55.82% | ms |
| 5 | qwik | replace all 1k rows | 7.9016 | +67.28% | ms |
| 6 | marko | replace all 1k rows | 8.3148 | +76.03% | ms |

### update every 10th in 10k rows

Updates the text of every tenth row in a 10,000-row keyed list while preserving the existing row nodes.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact | update every 10th in 10k rows | 2.7681 | best | ms |
| 2 | react | update every 10th in 10k rows | 3.0987 | +11.94% | ms |
| 3 | marko | update every 10th in 10k rows | 22.8021 | +723.75% | ms |
| 4 | qwik | update every 10th in 10k rows | 58.8716 | +2026.79% | ms |
| 5 | solid | update every 10th in 10k rows | 75.8893 | +2641.57% | ms |
| 6 | solid-v2 | update every 10th in 10k rows | 76.6575 | +2669.32% | ms |

### select row in 10k rows

Selects one row in a 10,000-row list by toggling selection attributes without changing row text.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact | select row in 10k rows | 0.099 | best | ms |
| 2 | react | select row in 10k rows | 2.3371 | +2260.71% | ms |
| 3 | marko | select row in 10k rows | 21.0635 | +21176.26% | ms |
| 4 | solid | select row in 10k rows | 32.9935 | +33226.77% | ms |
| 5 | solid-v2 | select row in 10k rows | 36.4632 | +36731.52% | ms |
| 6 | qwik | select row in 10k rows | 62.9825 | +63518.69% | ms |

### append 1k rows to 10k rows

Appends 1,000 keyed rows to an existing 10,000-row list and validates the 11,000-row DOM.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact | append 1k rows to 10k rows | 8.1316 | best | ms |
| 2 | react | append 1k rows to 10k rows | 9.4583 | +16.32% | ms |
| 3 | marko | append 1k rows to 10k rows | 33.5302 | +312.34% | ms |
| 4 | qwik | append 1k rows to 10k rows | 71.996 | +785.39% | ms |
| 5 | solid | append 1k rows to 10k rows | 85.6489 | +953.28% | ms |
| 6 | solid-v2 | append 1k rows to 10k rows | 87.9896 | +982.07% | ms |

### remove row from 1k rows

Removes one keyed row from the middle of an existing 1,000-row list.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact | remove row from 1k rows | 0.0629 | best | ms |
| 2 | react | remove row from 1k rows | 0.1829 | +190.78% | ms |
| 3 | marko | remove row from 1k rows | 0.6318 | +904.45% | ms |
| 4 | solid | remove row from 1k rows | 1.8662 | +2866.93% | ms |
| 5 | solid-v2 | remove row from 1k rows | 1.9035 | +2926.23% | ms |
| 6 | qwik | remove row from 1k rows | 2.3941 | +3706.2% | ms |

### clear 10k rows

Clears an existing 10,000-row list and validates that no row elements remain.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact | clear 10k rows | 19.5443 | best | ms |
| 2 | solid-v2 | clear 10k rows | 19.9335 | +1.99% | ms |
| 3 | solid | clear 10k rows | 20.135 | +3.02% | ms |
| 4 | qwik | clear 10k rows | 34.7243 | +77.67% | ms |
| 5 | react | clear 10k rows | 36.6728 | +87.64% | ms |
| 6 | marko | clear 10k rows | 38.1589 | +95.24% | ms |

### keyed reverse 1k rows

Reverses 1,000 keyed rows and verifies that DOM node identity is preserved.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact | keyed reverse 1k rows | 1.4494 | best | ms |
| 2 | solid-v2 | keyed reverse 1k rows | 2.2747 | +56.94% | ms |
| 3 | solid | keyed reverse 1k rows | 2.3297 | +60.74% | ms |
| 4 | react | keyed reverse 1k rows | 3.2162 | +121.9% | ms |
| 5 | marko | keyed reverse 1k rows | 3.6656 | +152.9% | ms |
| 6 | qwik | keyed reverse 1k rows | 4.8242 | +232.84% | ms |

### create 1k event targets

Creates 1,000 button event targets and measures initial interactive wiring cost without dispatching events.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid | create 1k event targets | 5.2037 | best | ms |
| 2 | solid-v2 | create 1k event targets | 5.2717 | +1.31% | ms |
| 3 | mreact | create 1k event targets | 6.0881 | +17% | ms |
| 4 | react | create 1k event targets | 6.3445 | +21.92% | ms |
| 5 | marko | create 1k event targets | 10.2242 | +96.48% | ms |
| 6 | qwik | create 1k event targets | 11.7483 | +125.77% | ms |

### text binding update 1k

Updates one reactive text value that is bound to 1,000 text nodes.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact | text binding update 1k | 0.1154 | best | ms |
| 2 | solid | text binding update 1k | 0.1249 | +8.23% | ms |
| 3 | solid-v2 | text binding update 1k | 0.1268 | +9.88% | ms |
| 4 | react | text binding update 1k | 0.4183 | +262.48% | ms |
| 5 | marko | text binding update 1k | 0.9311 | +706.85% | ms |
| 6 | qwik | text binding update 1k | 1.1393 | +887.26% | ms |

### computed fan-out 1k

Updates one source value that fans out through a derived value into 1,000 displayed text nodes.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact | computed fan-out 1k | 0.1174 | best | ms |
| 2 | solid | computed fan-out 1k | 0.1186 | +1.02% | ms |
| 3 | solid-v2 | computed fan-out 1k | 0.13 | +10.73% | ms |
| 4 | react | computed fan-out 1k | 0.3994 | +240.2% | ms |
| 5 | marko | computed fan-out 1k | 0.7899 | +572.83% | ms |
| 6 | qwik | computed fan-out 1k | 0.9446 | +704.6% | ms |

### computed fan-in 1k

Updates 1,000 source values and validates one derived aggregate text output.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | qwik | computed fan-in 1k | 0.0109 | best | ms |
| 2 | marko | computed fan-in 1k | 0.0135 | +23.85% | ms |
| 3 | solid-v2 | computed fan-in 1k | 0.0293 | +168.81% | ms |
| 4 | mreact | computed fan-in 1k | 0.0299 | +174.31% | ms |
| 5 | react | computed fan-in 1k | 0.0317 | +190.83% | ms |
| 6 | solid | computed fan-in 1k | 12.7073 | +116480.73% | ms |

### repeated create update clear memory

Reports heap growth after repeatedly creating, updating, and clearing 1,000-row lists.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | marko | repeated create update clear memory | 46426336 | best | bytes |
| 2 | mreact | repeated create update clear memory | 46563896 | +0.3% | bytes |
| 3 | solid | repeated create update clear memory | 50255024 | +8.25% | bytes |
| 4 | solid-v2 | repeated create update clear memory | 50737520 | +9.29% | bytes |
| 5 | react | repeated create update clear memory | 57792328 | +24.48% | bytes |
| 6 | qwik | repeated create update clear memory | 100260120 | +115.96% | bytes |

## Results

| suite | framework | version | case | status | metric | unit | value | diff vs 1st | sample count | min | max | mean | median | p75 | p95 | standard deviation | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| primitive | marko | 5.38.39 | create 1k rows | completed | duration | ms | 6.8821 | +83.69% | 25 | 5.6062500000000455 | 17.523410000000013 | 8.4897 | 6.8821 | 7.9367 | 17.4129 | 4.0027 |  |
| primitive | qwik | 1.19.2 | create 1k rows | completed | duration | ms | 5.5196 | +47.33% | 25 | 4.761782999999923 | 15.085059999999885 | 7.7365 | 5.5196 | 12.4997 | 14.1724 | 3.7941 |  |
| primitive | qwik-v2 | 2.0.0-beta.35 | create 1k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | create 1k rows | completed | duration | ms | 3.9644 | +5.82% | 25 | 3.5557420000000093 | 13.644436000000042 | 6.3438 | 3.9644 | 10.8178 | 13.2679 | 3.695 |  |
| primitive | solid | 1.9.12 | create 1k rows | completed | duration | ms | 4.0629 | +8.45% | 25 | 3.8295600000001286 | 15.988878000000113 | 6.4858 | 4.0629 | 8.5717 | 14.2192 | 4.0859 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | create 1k rows | completed | duration | ms | 4.4071 | +17.63% | 25 | 3.9037610000000313 | 17.11807399999998 | 6.7319 | 4.4071 | 7.8268 | 13.9287 | 4.1815 |  |
| primitive | mreact | workspace | create 1k rows | completed | duration | ms | 3.7465 | best | 25 | 3.6409029999999802 | 12.76655699999992 | 6.3289 | 3.7465 | 11.4132 | 12.608 | 3.6963 |  |
| primitive | marko | 5.38.39 | replace all 1k rows | completed | duration | ms | 8.3148 | +76.03% | 25 | 7.436861000000135 | 24.448181999999633 | 11.8656 | 8.3148 | 17.6617 | 20.1496 | 5.3804 |  |
| primitive | qwik | 1.19.2 | replace all 1k rows | completed | duration | ms | 7.9016 | +67.28% | 25 | 7.170747000000119 | 29.811251000000084 | 11.9706 | 7.9016 | 17.6671 | 20.8191 | 6.0232 |  |
| primitive | qwik-v2 | 2.0.0-beta.35 | replace all 1k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | replace all 1k rows | completed | duration | ms | 7.3604 | +55.82% | 25 | 6.370503999999528 | 19.413163000000168 | 10.8279 | 7.3604 | 15.4823 | 18.2868 | 4.7566 |  |
| primitive | solid | 1.9.12 | replace all 1k rows | completed | duration | ms | 5.4392 | +15.15% | 25 | 4.696879000000081 | 18.947501999999986 | 7.7817 | 5.4392 | 7.6049 | 15.5309 | 4.3482 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | replace all 1k rows | completed | duration | ms | 5.2676 | +11.52% | 25 | 4.746804000000338 | 19.62974200000008 | 8.1214 | 5.2676 | 11.9675 | 17.707 | 4.8884 |  |
| primitive | mreact | workspace | replace all 1k rows | completed | duration | ms | 4.7236 | best | 25 | 4.342751000000135 | 20.549050000000534 | 7.4178 | 4.7236 | 12.7181 | 16.1392 | 4.6611 |  |
| primitive | marko | 5.38.39 | update every 10th in 10k rows | completed | duration | ms | 22.8021 | +723.75% | 25 | 21.409325000000536 | 37.837962999999945 | 23.9427 | 22.8021 | 23.522 | 34.0437 | 3.6939 |  |
| primitive | qwik | 1.19.2 | update every 10th in 10k rows | completed | duration | ms | 58.8716 | +2026.79% | 25 | 51.589756000001216 | 74.83298699999796 | 60.8846 | 58.8716 | 63.8396 | 74.0914 | 7.1112 |  |
| primitive | qwik-v2 | 2.0.0-beta.35 | update every 10th in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | update every 10th in 10k rows | completed | duration | ms | 3.0987 | +11.94% | 25 | 2.5253840000004857 | 15.917921000000206 | 4.6949 | 3.0987 | 3.3719 | 15.1478 | 3.9769 |  |
| primitive | solid | 1.9.12 | update every 10th in 10k rows | completed | duration | ms | 75.8893 | +2641.57% | 25 | 72.75485900000058 | 191.698296999999 | 82.8515 | 75.8893 | 84.958 | 89.5402 | 22.9035 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | update every 10th in 10k rows | completed | duration | ms | 76.6575 | +2669.32% | 25 | 73.85341399999743 | 190.76272499999686 | 88.4472 | 76.6575 | 85.7264 | 189.6589 | 30.4809 |  |
| primitive | mreact | workspace | update every 10th in 10k rows | completed | duration | ms | 2.7681 | best | 25 | 2.213934999999765 | 3.270130999997491 | 2.792 | 2.7681 | 2.9166 | 3.2513 | 0.2604 |  |
| primitive | marko | 5.38.39 | select row in 10k rows | completed | duration | ms | 21.0635 | +21176.26% | 25 | 19.682783000003838 | 32.473791000003985 | 21.6561 | 21.0635 | 21.379 | 24.3487 | 2.4382 |  |
| primitive | qwik | 1.19.2 | select row in 10k rows | completed | duration | ms | 62.9825 | +63518.69% | 25 | 52.32167399999889 | 82.99912599999516 | 63.3414 | 62.9825 | 70.1845 | 77.0101 | 8.3891 |  |
| primitive | qwik-v2 | 2.0.0-beta.35 | select row in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | select row in 10k rows | completed | duration | ms | 2.3371 | +2260.71% | 25 | 1.7665090000009513 | 4.457285000004049 | 2.5143 | 2.3371 | 2.6124 | 3.7507 | 0.6348 |  |
| primitive | solid | 1.9.12 | select row in 10k rows | completed | duration | ms | 32.9935 | +33226.77% | 25 | 23.03100799999811 | 53.8372920000038 | 33.9857 | 32.9935 | 35.3361 | 47.626 | 7.5608 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | select row in 10k rows | completed | duration | ms | 36.4632 | +36731.52% | 25 | 25.947589000003063 | 53.466396999996505 | 37.5065 | 36.4632 | 39.5774 | 47.8119 | 6.3559 |  |
| primitive | mreact | workspace | select row in 10k rows | completed | duration | ms | 0.099 | best | 25 | 0.08423899998888373 | 0.48024699999950826 | 0.1165 | 0.099 | 0.1073 | 0.1587 | 0.0759 |  |
| primitive | marko | 5.38.39 | append 1k rows to 10k rows | completed | duration | ms | 33.5302 | +312.34% | 25 | 31.203890999997384 | 49.52955199999269 | 37.0452 | 33.5302 | 43.3182 | 43.9626 | 5.5263 |  |
| primitive | qwik | 1.19.2 | append 1k rows to 10k rows | completed | duration | ms | 71.996 | +785.39% | 25 | 62.148595000006026 | 92.90096199999971 | 73.2183 | 71.996 | 73.5475 | 87.3106 | 6.9778 |  |
| primitive | qwik-v2 | 2.0.0-beta.35 | append 1k rows to 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | append 1k rows to 10k rows | completed | duration | ms | 9.4583 | +16.32% | 25 | 6.869181000001845 | 34.41072600000189 | 13.4706 | 9.4583 | 17.6828 | 33.6104 | 7.5977 |  |
| primitive | solid | 1.9.12 | append 1k rows to 10k rows | completed | duration | ms | 85.6489 | +953.28% | 25 | 75.94900699998834 | 190.52045899999212 | 87.7612 | 85.6489 | 89.2 | 91.9824 | 21.7379 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | append 1k rows to 10k rows | completed | duration | ms | 87.9896 | +982.07% | 25 | 76.66582900000503 | 221.5863970000064 | 94.7332 | 87.9896 | 89.1761 | 218.6195 | 37.3116 |  |
| primitive | mreact | workspace | append 1k rows to 10k rows | completed | duration | ms | 8.1316 | best | 25 | 7.851696999990963 | 17.642796999993152 | 10.7429 | 8.1316 | 16.5695 | 17.3744 | 3.9351 |  |
| primitive | marko | 5.38.39 | remove row from 1k rows | completed | duration | ms | 0.6318 | +904.45% | 25 | 0.5695059999998193 | 1.1753910000115866 | 0.7138 | 0.6318 | 0.7792 | 1.1606 | 0.1834 |  |
| primitive | qwik | 1.19.2 | remove row from 1k rows | completed | duration | ms | 2.3941 | +3706.2% | 25 | 2.2646400000085123 | 14.40495799999917 | 3.7051 | 2.3941 | 2.5846 | 12.4022 | 3.4352 |  |
| primitive | qwik-v2 | 2.0.0-beta.35 | remove row from 1k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | remove row from 1k rows | completed | duration | ms | 0.1829 | +190.78% | 25 | 0.17218500000308268 | 0.9865839999984019 | 0.258 | 0.1829 | 0.2286 | 0.9142 | 0.206 |  |
| primitive | solid | 1.9.12 | remove row from 1k rows | completed | duration | ms | 1.8662 | +2866.93% | 25 | 1.8206800000043586 | 13.043896999995923 | 2.3443 | 1.8662 | 1.8991 | 2.5601 | 2.1884 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | remove row from 1k rows | completed | duration | ms | 1.9035 | +2926.23% | 25 | 1.8695020000013756 | 2.008966000008513 | 1.9084 | 1.9035 | 1.9181 | 1.9792 | 0.0327 |  |
| primitive | mreact | workspace | remove row from 1k rows | completed | duration | ms | 0.0629 | best | 25 | 0.04962299999897368 | 0.8132360000017798 | 0.0977 | 0.0629 | 0.0869 | 0.098 | 0.1469 |  |
| primitive | marko | 5.38.39 | clear 10k rows | completed | duration | ms | 38.1589 | +95.24% | 25 | 35.62586499999452 | 49.67306600000302 | 39.6403 | 38.1589 | 40.1926 | 47.5163 | 3.8351 |  |
| primitive | qwik | 1.19.2 | clear 10k rows | completed | duration | ms | 34.7243 | +77.67% | 25 | 30.807228999998188 | 223.8238030000066 | 42.3341 | 34.7243 | 35.7998 | 42.1083 | 37.1429 |  |
| primitive | qwik-v2 | 2.0.0-beta.35 | clear 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | clear 10k rows | completed | duration | ms | 36.6728 | +87.64% | 25 | 28.681068999998388 | 125.03538300000946 | 41.7991 | 36.6728 | 41.6184 | 50.4285 | 17.9088 |  |
| primitive | solid | 1.9.12 | clear 10k rows | completed | duration | ms | 20.135 | +3.02% | 25 | 18.369876999990083 | 150.5918929999898 | 26.8571 | 20.135 | 22.4442 | 30.2476 | 25.5078 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | clear 10k rows | completed | duration | ms | 19.9335 | +1.99% | 25 | 18.335561999992933 | 30.43521199998213 | 20.9819 | 19.9335 | 21.2873 | 29.1141 | 2.8817 |  |
| primitive | mreact | workspace | clear 10k rows | completed | duration | ms | 19.5443 | best | 25 | 17.995549000013852 | 29.735960999998497 | 20.5321 | 19.5443 | 20.2521 | 28.9172 | 3.3124 |  |
| primitive | marko | 5.38.39 | keyed reverse 1k rows | completed | duration | ms | 3.6656 | +152.9% | 25 | 3.487739000003785 | 13.707426999986637 | 4.1658 | 3.6656 | 3.864 | 4.844 | 1.974 |  |
| primitive | qwik | 1.19.2 | keyed reverse 1k rows | completed | duration | ms | 4.8242 | +232.84% | 25 | 4.487177000002703 | 14.2631270000129 | 6.3054 | 4.8242 | 5.4934 | 13.5785 | 3.2336 |  |
| primitive | qwik-v2 | 2.0.0-beta.35 | keyed reverse 1k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | keyed reverse 1k rows | completed | duration | ms | 3.2162 | +121.9% | 25 | 3.1696280000032857 | 11.343430999986595 | 3.7423 | 3.2162 | 3.2399 | 6.2393 | 1.6716 |  |
| primitive | solid | 1.9.12 | keyed reverse 1k rows | completed | duration | ms | 2.3297 | +60.74% | 25 | 2.177233000023989 | 12.815001000009943 | 3.1439 | 2.3297 | 2.3425 | 11.5613 | 2.6792 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | keyed reverse 1k rows | completed | duration | ms | 2.2747 | +56.94% | 25 | 2.187793999997666 | 3.12435299999197 | 2.3531 | 2.2747 | 2.3219 | 2.8965 | 0.2281 |  |
| primitive | mreact | workspace | keyed reverse 1k rows | completed | duration | ms | 1.4494 | best | 25 | 1.4157750000013039 | 1.974320000008447 | 1.4682 | 1.4494 | 1.4669 | 1.4844 | 0.1052 |  |
| primitive | marko | 5.38.39 | create 1k event targets | completed | duration | ms | 10.2242 | +96.48% | 25 | 8.89181900001131 | 25.342689000011887 | 14.5466 | 10.2242 | 20.317 | 22.3351 | 5.7995 |  |
| primitive | qwik | 1.19.2 | create 1k event targets | completed | duration | ms | 11.7483 | +125.77% | 25 | 6.716820000001462 | 233.18326299998444 | 22.8307 | 11.7483 | 19.8006 | 31.1305 | 43.4103 | Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events. |
| primitive | qwik-v2 | 2.0.0-beta.35 | create 1k event targets | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | create 1k event targets | completed | duration | ms | 6.3445 | +21.92% | 25 | 5.377830000012182 | 17.767407000006642 | 9.3221 | 6.3445 | 14.8844 | 16.7251 | 4.6601 |  |
| primitive | solid | 1.9.12 | create 1k event targets | completed | duration | ms | 5.2037 | best | 25 | 5.105936999985715 | 15.699010000011185 | 8.8482 | 5.2037 | 14.908 | 15.5953 | 4.6995 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | create 1k event targets | completed | duration | ms | 5.2717 | +1.31% | 25 | 5.026285999978427 | 16.313259999995353 | 8.8283 | 5.2717 | 14.5338 | 15.5371 | 4.6754 |  |
| primitive | mreact | workspace | create 1k event targets | completed | duration | ms | 6.0881 | +17% | 25 | 5.41910800000187 | 441.86664399999427 | 28.1275 | 6.0881 | 15.0768 | 67.7561 | 85.3456 |  |
| primitive | marko | 5.38.39 | text binding update 1k | completed | duration | ms | 0.9311 | +706.85% | 25 | 0.809499999973923 | 1.5641739999991842 | 0.9953 | 0.9311 | 1.0419 | 1.3663 | 0.189 |  |
| primitive | qwik | 1.19.2 | text binding update 1k | completed | duration | ms | 1.1393 | +887.26% | 25 | 0.9691400000010617 | 10.675428999995347 | 1.6683 | 1.1393 | 1.4797 | 2.4164 | 1.8792 |  |
| primitive | qwik-v2 | 2.0.0-beta.35 | text binding update 1k | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | text binding update 1k | completed | duration | ms | 0.4183 | +262.48% | 25 | 0.32013500001630746 | 41.39713800000027 | 2.2572 | 0.4183 | 0.6746 | 2.7447 | 8.0066 |  |
| primitive | solid | 1.9.12 | text binding update 1k | completed | duration | ms | 0.1249 | +8.23% | 25 | 0.11123000000952743 | 1.2109679999994114 | 0.1934 | 0.1249 | 0.1269 | 0.575 | 0.2293 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | text binding update 1k | completed | duration | ms | 0.1268 | +9.88% | 25 | 0.11423600002308376 | 1.2091550000186544 | 0.2654 | 0.1268 | 0.151 | 1.1751 | 0.3417 |  |
| primitive | mreact | workspace | text binding update 1k | completed | duration | ms | 0.1154 | best | 25 | 0.10792399998172186 | 0.6514610000012908 | 0.1505 | 0.1154 | 0.1171 | 0.4151 | 0.118 |  |
| primitive | marko | 5.38.39 | computed fan-out 1k | completed | duration | ms | 0.7899 | +572.83% | 25 | 0.7536240000044927 | 11.950126999989152 | 1.3919 | 0.7899 | 0.9902 | 2.259 | 2.184 |  |
| primitive | qwik | 1.19.2 | computed fan-out 1k | completed | duration | ms | 0.9446 | +704.6% | 25 | 0.885072000004584 | 1.377252000005683 | 1.0009 | 0.9446 | 1.028 | 1.2636 | 0.1291 |  |
| primitive | qwik-v2 | 2.0.0-beta.35 | computed fan-out 1k | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | computed fan-out 1k | completed | duration | ms | 0.3994 | +240.2% | 25 | 0.3252539999957662 | 8.787471000017831 | 0.7802 | 0.3994 | 0.4493 | 1.5547 | 1.6512 |  |
| primitive | solid | 1.9.12 | computed fan-out 1k | completed | duration | ms | 0.1186 | +1.02% | 25 | 0.10776300000725314 | 10.803871000010986 | 1.0077 | 0.1186 | 0.1211 | 10.6612 | 2.8717 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | computed fan-out 1k | completed | duration | ms | 0.13 | +10.73% | 25 | 0.11371500001405366 | 1.8334839999733958 | 0.1988 | 0.13 | 0.1363 | 0.2024 | 0.3341 |  |
| primitive | mreact | workspace | computed fan-out 1k | completed | duration | ms | 0.1174 | best | 25 | 0.11006800000905059 | 0.5089509999961592 | 0.1376 | 0.1174 | 0.1205 | 0.1806 | 0.0772 |  |
| primitive | marko | 5.38.39 | computed fan-in 1k | completed | duration | ms | 0.0135 | +23.85% | 25 | 0.011892000009538606 | 0.03732000000309199 | 0.0148 | 0.0135 | 0.0148 | 0.0199 | 0.0049 |  |
| primitive | qwik | 1.19.2 | computed fan-in 1k | completed | duration | ms | 0.0109 | best | 25 | 0.009948000020813197 | 0.2698699999891687 | 0.0214 | 0.0109 | 0.0117 | 0.013 | 0.0507 |  |
| primitive | qwik-v2 | 2.0.0-beta.35 | computed fan-in 1k | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | computed fan-in 1k | completed | duration | ms | 0.0317 | +190.83% | 25 | 0.029837000009138137 | 0.3072010000178125 | 0.0434 | 0.0317 | 0.0328 | 0.0439 | 0.0539 |  |
| primitive | solid | 1.9.12 | computed fan-in 1k | completed | duration | ms | 12.7073 | +116480.73% | 25 | 12.624500999983866 | 13.149311999994097 | 12.7665 | 12.7073 | 12.8452 | 13.1404 | 0.1518 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | computed fan-in 1k | completed | duration | ms | 0.0293 | +168.81% | 25 | 0.027801999996881932 | 0.5039620000170544 | 0.0751 | 0.0293 | 0.035 | 0.3611 | 0.1221 |  |
| primitive | mreact | workspace | computed fan-in 1k | completed | duration | ms | 0.0299 | +174.31% | 25 | 0.027501999982632697 | 0.31142899999395013 | 0.0641 | 0.0299 | 0.0348 | 0.3109 | 0.0902 |  |
| primitive | marko | 5.38.39 | repeated create update clear memory | completed | memory | bytes | 46426336 | best | 25 | 0 | 56757592 | 41549485.12 | 46426336 | 49450472 | 55481176 | 15853225.4516 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | qwik | 1.19.2 | repeated create update clear memory | completed | memory | bytes | 100260120 | +115.96% | 25 | 0 | 104358704 | 79649392.96 | 100260120 | 102447152 | 103963000 | 40043560.6359 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | qwik-v2 | 2.0.0-beta.35 | repeated create update clear memory | unsupported | memory | bytes | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | repeated create update clear memory | completed | memory | bytes | 57792328 | +24.48% | 25 | 0 | 65055608 | 54077680.32 | 57792328 | 58358352 | 63719472 | 16099915.8934 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | solid | 1.9.12 | repeated create update clear memory | completed | memory | bytes | 50255024 | +8.25% | 25 | 0 | 65671544 | 47104420.48 | 50255024 | 56982824 | 60185104 | 17997534.6191 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | solid-v2 | 2.0.0-beta.13 | repeated create update clear memory | completed | memory | bytes | 50737520 | +9.29% | 25 | 0 | 60393064 | 47054330.56 | 50737520 | 56433408 | 59934624 | 17783308.453 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | mreact | workspace | repeated create update clear memory | completed | memory | bytes | 46563896 | +0.3% | 25 | 0 | 52417136 | 41054014.4 | 46563896 | 49939488 | 52371984 | 15626455.9397 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
