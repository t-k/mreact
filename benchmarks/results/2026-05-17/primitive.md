# Primitive Benchmark

## Environment

- Date: 2026-05-17
- Git commit: 7ed9542376ae9b526381f5b3bacdd6fb177b3476
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
| 1 | mreact | create 1k rows | 3.7543 | best | ms |
| 2 | solid | create 1k rows | 4.0125 | +6.88% | ms |
| 3 | solid-v2 | create 1k rows | 4.1056 | +9.36% | ms |
| 4 | react | create 1k rows | 4.143 | +10.35% | ms |
| 5 | qwik | create 1k rows | 6.3599 | +69.4% | ms |
| 6 | marko | create 1k rows | 6.8227 | +81.73% | ms |

### replace all 1k rows

Replaces an existing 1,000-row keyed list with a fresh 1,000-row dataset.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid-v2 | replace all 1k rows | 4.9648 | best | ms |
| 2 | mreact | replace all 1k rows | 5.2284 | +5.31% | ms |
| 3 | solid | replace all 1k rows | 5.2464 | +5.67% | ms |
| 4 | react | replace all 1k rows | 7.1325 | +43.66% | ms |
| 5 | qwik | replace all 1k rows | 8.1611 | +64.38% | ms |
| 6 | marko | replace all 1k rows | 8.304 | +67.26% | ms |

### update every 10th in 10k rows

Updates the text of every tenth row in a 10,000-row keyed list while preserving the existing row nodes.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact | update every 10th in 10k rows | 2.6643 | best | ms |
| 2 | react | update every 10th in 10k rows | 3.8586 | +44.83% | ms |
| 3 | marko | update every 10th in 10k rows | 26.9359 | +910.99% | ms |
| 4 | qwik | update every 10th in 10k rows | 71.7738 | +2593.91% | ms |
| 5 | solid-v2 | update every 10th in 10k rows | 78.0849 | +2830.78% | ms |
| 6 | solid | update every 10th in 10k rows | 84.9872 | +3089.85% | ms |

### select row in 10k rows

Selects one row in a 10,000-row list by toggling selection attributes without changing row text.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact | select row in 10k rows | 0.0816 | best | ms |
| 2 | react | select row in 10k rows | 2.9978 | +3573.77% | ms |
| 3 | marko | select row in 10k rows | 22.0177 | +26882.48% | ms |
| 4 | solid | select row in 10k rows | 26.9977 | +32985.42% | ms |
| 5 | solid-v2 | select row in 10k rows | 29.4974 | +36048.77% | ms |
| 6 | qwik | select row in 10k rows | 64.4432 | +78874.51% | ms |

### append 1k rows to 10k rows

Appends 1,000 keyed rows to an existing 10,000-row list and validates the 11,000-row DOM.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact | append 1k rows to 10k rows | 7.9352 | best | ms |
| 2 | react | append 1k rows to 10k rows | 15.7539 | +98.53% | ms |
| 3 | marko | append 1k rows to 10k rows | 32.692 | +311.99% | ms |
| 4 | qwik | append 1k rows to 10k rows | 69.987 | +781.98% | ms |
| 5 | solid | append 1k rows to 10k rows | 79.1036 | +896.87% | ms |
| 6 | solid-v2 | append 1k rows to 10k rows | 85.8098 | +981.38% | ms |

### remove row from 1k rows

Removes one keyed row from the middle of an existing 1,000-row list.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact | remove row from 1k rows | 0.0558 | best | ms |
| 2 | react | remove row from 1k rows | 0.1686 | +202.15% | ms |
| 3 | marko | remove row from 1k rows | 0.5926 | +962.01% | ms |
| 4 | solid-v2 | remove row from 1k rows | 1.9146 | +3331.18% | ms |
| 5 | solid | remove row from 1k rows | 2.1883 | +3821.68% | ms |
| 6 | qwik | remove row from 1k rows | 2.3736 | +4153.76% | ms |

### clear 10k rows

Clears an existing 10,000-row list and validates that no row elements remain.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid | clear 10k rows | 17.6696 | best | ms |
| 2 | solid-v2 | clear 10k rows | 17.8723 | +1.15% | ms |
| 3 | mreact | clear 10k rows | 18.3493 | +3.85% | ms |
| 4 | qwik | clear 10k rows | 30.8926 | +74.83% | ms |
| 5 | marko | clear 10k rows | 37.0639 | +109.76% | ms |
| 6 | react | clear 10k rows | 37.7491 | +113.64% | ms |

### keyed reverse 1k rows

Reverses 1,000 keyed rows and verifies that DOM node identity is preserved.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | mreact | keyed reverse 1k rows | 1.4675 | best | ms |
| 2 | solid | keyed reverse 1k rows | 2.4305 | +65.62% | ms |
| 3 | solid-v2 | keyed reverse 1k rows | 2.4504 | +66.98% | ms |
| 4 | react | keyed reverse 1k rows | 3.2251 | +119.77% | ms |
| 5 | marko | keyed reverse 1k rows | 3.5462 | +141.65% | ms |
| 6 | qwik | keyed reverse 1k rows | 4.7186 | +221.54% | ms |

### create 1k event targets

Creates 1,000 button event targets and measures initial interactive wiring cost without dispatching events.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid-v2 | create 1k event targets | 5.1289 | best | ms |
| 2 | solid | create 1k event targets | 5.4226 | +5.73% | ms |
| 3 | mreact | create 1k event targets | 5.5626 | +8.46% | ms |
| 4 | react | create 1k event targets | 5.6794 | +10.73% | ms |
| 5 | marko | create 1k event targets | 10.9361 | +113.23% | ms |
| 6 | qwik | create 1k event targets | 12.887 | +151.26% | ms |

### text binding update 1k

Updates one reactive text value that is bound to 1,000 text nodes.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid | text binding update 1k | 0.1134 | best | ms |
| 2 | solid-v2 | text binding update 1k | 0.1163 | +2.56% | ms |
| 3 | mreact | text binding update 1k | 0.1174 | +3.53% | ms |
| 4 | react | text binding update 1k | 0.4031 | +255.47% | ms |
| 5 | marko | text binding update 1k | 0.8577 | +656.35% | ms |
| 6 | qwik | text binding update 1k | 1.1014 | +871.25% | ms |

### computed fan-out 1k

Updates one source value that fans out through a derived value into 1,000 displayed text nodes.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | solid | computed fan-out 1k | 0.1121 | best | ms |
| 2 | mreact | computed fan-out 1k | 0.1201 | +7.14% | ms |
| 3 | solid-v2 | computed fan-out 1k | 0.1315 | +17.31% | ms |
| 4 | react | computed fan-out 1k | 0.3214 | +186.71% | ms |
| 5 | marko | computed fan-out 1k | 0.8697 | +675.83% | ms |
| 6 | qwik | computed fan-out 1k | 0.9324 | +731.76% | ms |

### computed fan-in 1k

Updates 1,000 source values and validates one derived aggregate text output.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | qwik | computed fan-in 1k | 0.0108 | best | ms |
| 2 | marko | computed fan-in 1k | 0.0129 | +19.44% | ms |
| 3 | solid-v2 | computed fan-in 1k | 0.0292 | +170.37% | ms |
| 4 | mreact | computed fan-in 1k | 0.0293 | +171.3% | ms |
| 5 | react | computed fan-in 1k | 0.0314 | +190.74% | ms |
| 6 | solid | computed fan-in 1k | 12.7244 | +117718.52% | ms |

### repeated create update clear memory

Reports heap growth after repeatedly creating, updating, and clearing 1,000-row lists.

| rank | framework | case | value | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | marko | repeated create update clear memory | 0 |  | bytes |
| 2 | solid | repeated create update clear memory | 0 |  | bytes |
| 3 | solid-v2 | repeated create update clear memory | 0 |  | bytes |
| 4 | mreact | repeated create update clear memory | 1628176 |  | bytes |
| 5 | react | repeated create update clear memory | 13406368 |  | bytes |
| 6 | qwik | repeated create update clear memory | 93899128 |  | bytes |

## Results

| suite | framework | version | case | status | metric | unit | value | diff vs 1st | sample count | min | max | mean | median | p75 | p95 | standard deviation | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| primitive | marko | 5.38.39 | create 1k rows | completed | duration | ms | 6.8227 | +81.73% | 25 | 5.921965 | 21.576404000000025 | 9.7096 | 6.8227 | 10.5926 | 21.1785 | 5.0916 |  |
| primitive | qwik | 1.19.2 | create 1k rows | completed | duration | ms | 6.3599 | +69.4% | 25 | 4.659828000000061 | 16.698565000000144 | 8.5 | 6.3599 | 14.1288 | 15.9459 | 4.1353 |  |
| primitive | qwik-v2 | 2.0.0-beta.35 | create 1k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | create 1k rows | completed | duration | ms | 4.143 | +10.35% | 25 | 3.626350999999886 | 13.649212000000034 | 6.3741 | 4.143 | 10.5445 | 12.847 | 3.6252 |  |
| primitive | solid | 1.9.12 | create 1k rows | completed | duration | ms | 4.0125 | +6.88% | 25 | 3.851564999999937 | 17.80582100000015 | 6.3682 | 4.0125 | 4.3848 | 13.5514 | 4.2752 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | create 1k rows | completed | duration | ms | 4.1056 | +9.36% | 25 | 3.852067000000261 | 19.759411 | 7.0121 | 4.1056 | 9.9903 | 14.5822 | 4.6575 |  |
| primitive | mreact | workspace | create 1k rows | completed | duration | ms | 3.7543 | best | 25 | 3.4717099999998027 | 16.554525000000012 | 5.3179 | 3.7543 | 5.1247 | 12.5486 | 3.3995 |  |
| primitive | marko | 5.38.39 | replace all 1k rows | completed | duration | ms | 8.304 | +67.26% | 25 | 7.049841000000015 | 31.81480099999999 | 12.9684 | 8.304 | 18.6373 | 27.7447 | 7.1746 |  |
| primitive | qwik | 1.19.2 | replace all 1k rows | completed | duration | ms | 8.1611 | +64.38% | 25 | 7.279231999999865 | 20.523741999999856 | 11.6843 | 8.1611 | 17.9633 | 19.4888 | 5.1733 |  |
| primitive | qwik-v2 | 2.0.0-beta.35 | replace all 1k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | replace all 1k rows | completed | duration | ms | 7.1325 | +43.66% | 25 | 6.36304599999994 | 19.857146000000284 | 10.5664 | 7.1325 | 16.4201 | 18.7114 | 5.0449 |  |
| primitive | solid | 1.9.12 | replace all 1k rows | completed | duration | ms | 5.2464 | +5.67% | 25 | 4.4798289999998815 | 16.858728000000156 | 6.5461 | 5.2464 | 6.1145 | 16.1522 | 3.2206 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | replace all 1k rows | completed | duration | ms | 4.9648 | best | 25 | 4.430045999999493 | 10.2263039999998 | 6.2686 | 4.9648 | 7.981 | 10.098 | 1.989 |  |
| primitive | mreact | workspace | replace all 1k rows | completed | duration | ms | 5.2284 | +5.31% | 25 | 4.219949999999699 | 9.932560999999623 | 6.5606 | 5.2284 | 8.6426 | 9.1781 | 2.1478 |  |
| primitive | marko | 5.38.39 | update every 10th in 10k rows | completed | duration | ms | 26.9359 | +910.99% | 25 | 21.134250999999495 | 36.4380000000001 | 27.3587 | 26.9359 | 30.1283 | 36.1332 | 4.5431 |  |
| primitive | qwik | 1.19.2 | update every 10th in 10k rows | completed | duration | ms | 71.7738 | +2593.91% | 25 | 56.659381000001304 | 97.22773999999845 | 73.51 | 71.7738 | 77.755 | 94.7955 | 10.4839 |  |
| primitive | qwik-v2 | 2.0.0-beta.35 | update every 10th in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | update every 10th in 10k rows | completed | duration | ms | 3.8586 | +44.83% | 25 | 3.2732560000004014 | 23.411872000000585 | 7.1528 | 3.8586 | 6.1442 | 17.4474 | 5.9561 |  |
| primitive | solid | 1.9.12 | update every 10th in 10k rows | completed | duration | ms | 84.9872 | +3089.85% | 25 | 74.10634600000049 | 177.0141360000016 | 93.7569 | 84.9872 | 89.9974 | 176.1698 | 30.8539 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | update every 10th in 10k rows | completed | duration | ms | 78.0849 | +2830.78% | 25 | 72.47418100000505 | 182.3585529999982 | 86.7679 | 78.0849 | 83.5631 | 171.8991 | 27.0624 |  |
| primitive | mreact | workspace | update every 10th in 10k rows | completed | duration | ms | 2.6643 | best | 25 | 2.2238890000007814 | 3.325313000001188 | 2.664 | 2.6643 | 2.8801 | 3.2387 | 0.3155 |  |
| primitive | marko | 5.38.39 | select row in 10k rows | completed | duration | ms | 22.0177 | +26882.48% | 25 | 20.304959000000963 | 32.27750200000446 | 22.513 | 22.0177 | 23.1182 | 24.4867 | 2.2558 |  |
| primitive | qwik | 1.19.2 | select row in 10k rows | completed | duration | ms | 64.4432 | +78874.51% | 25 | 52.86196600000403 | 82.07755100000213 | 64.2432 | 64.4432 | 66.5852 | 81.8082 | 7.9628 |  |
| primitive | qwik-v2 | 2.0.0-beta.35 | select row in 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | select row in 10k rows | completed | duration | ms | 2.9978 | +3573.77% | 25 | 2.027238999995461 | 14.366382000000158 | 4.46 | 2.9978 | 3.9125 | 14.2442 | 3.4816 |  |
| primitive | solid | 1.9.12 | select row in 10k rows | completed | duration | ms | 26.9977 | +32985.42% | 25 | 19.218902000000526 | 42.426329000001715 | 27.8512 | 26.9977 | 28.724 | 32.7355 | 3.7734 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | select row in 10k rows | completed | duration | ms | 29.4974 | +36048.77% | 25 | 21.994320999991032 | 41.86674500000663 | 29.4025 | 29.4974 | 30.7572 | 33.1489 | 3.7813 |  |
| primitive | mreact | workspace | select row in 10k rows | completed | duration | ms | 0.0816 | best | 25 | 0.06878000000142492 | 0.5490140000038082 | 0.1038 | 0.0816 | 0.0873 | 0.1312 | 0.0922 |  |
| primitive | marko | 5.38.39 | append 1k rows to 10k rows | completed | duration | ms | 32.692 | +311.99% | 25 | 29.675970000011148 | 43.499439999999595 | 34.4356 | 32.692 | 35.348 | 42.6006 | 4.2004 |  |
| primitive | qwik | 1.19.2 | append 1k rows to 10k rows | completed | duration | ms | 69.987 | +781.98% | 25 | 62.56424200000765 | 83.4573090000049 | 70.9746 | 69.987 | 72.3195 | 79.7291 | 4.3273 |  |
| primitive | qwik-v2 | 2.0.0-beta.35 | append 1k rows to 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | append 1k rows to 10k rows | completed | duration | ms | 15.7539 | +98.53% | 25 | 7.125843000001623 | 27.50673399999505 | 13.6522 | 15.7539 | 17.9305 | 20.1202 | 5.5866 |  |
| primitive | solid | 1.9.12 | append 1k rows to 10k rows | completed | duration | ms | 79.1036 | +896.87% | 25 | 75.70944299999974 | 192.7454940000025 | 89.6667 | 79.1036 | 87.4723 | 188.1743 | 30.0712 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | append 1k rows to 10k rows | completed | duration | ms | 85.8098 | +981.38% | 25 | 75.33246299999882 | 211.7347230000014 | 93.0011 | 85.8098 | 87.2035 | 204.3569 | 34.257 |  |
| primitive | mreact | workspace | append 1k rows to 10k rows | completed | duration | ms | 7.9352 | best | 25 | 7.76564800000051 | 17.69671499999822 | 8.8201 | 7.9352 | 8.4066 | 16.1748 | 2.4668 |  |
| primitive | marko | 5.38.39 | remove row from 1k rows | completed | duration | ms | 0.5926 | +962.01% | 25 | 0.5680299999949057 | 1.3152780000091298 | 0.6659 | 0.5926 | 0.6818 | 1.0387 | 0.1715 |  |
| primitive | qwik | 1.19.2 | remove row from 1k rows | completed | duration | ms | 2.3736 | +4153.76% | 25 | 2.246601999999257 | 3.1304269999964163 | 2.441 | 2.3736 | 2.4506 | 2.9651 | 0.2073 |  |
| primitive | qwik-v2 | 2.0.0-beta.35 | remove row from 1k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | remove row from 1k rows | completed | duration | ms | 0.1686 | +202.15% | 25 | 0.16011200001230463 | 0.8336200000048848 | 0.2148 | 0.1686 | 0.1902 | 0.5443 | 0.1462 |  |
| primitive | solid | 1.9.12 | remove row from 1k rows | completed | duration | ms | 2.1883 | +3821.68% | 25 | 1.8577189999923576 | 23.96088499999314 | 4.8025 | 2.1883 | 6.7198 | 13.1234 | 4.9479 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | remove row from 1k rows | completed | duration | ms | 1.9146 | +3331.18% | 25 | 1.8787889999948675 | 2.2680729999992764 | 1.9403 | 1.9146 | 1.9478 | 2.0948 | 0.0822 |  |
| primitive | mreact | workspace | remove row from 1k rows | completed | duration | ms | 0.0558 | best | 25 | 0.041147999989334494 | 0.7443119999952614 | 0.0915 | 0.0558 | 0.0638 | 0.2284 | 0.1381 |  |
| primitive | marko | 5.38.39 | clear 10k rows | completed | duration | ms | 37.0639 | +109.76% | 25 | 34.46433000000252 | 50.323904000004404 | 38.3059 | 37.0639 | 38.5698 | 47.2783 | 4.3411 |  |
| primitive | qwik | 1.19.2 | clear 10k rows | completed | duration | ms | 30.8926 | +74.83% | 25 | 29.59637999998813 | 164.40775199999916 | 38.4083 | 30.8926 | 36.1077 | 44.2801 | 26.0813 |  |
| primitive | qwik-v2 | 2.0.0-beta.35 | clear 10k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | clear 10k rows | completed | duration | ms | 37.7491 | +113.64% | 25 | 35.434207000012975 | 156.34472399999504 | 43.1008 | 37.7491 | 39.1932 | 45.194 | 23.2295 |  |
| primitive | solid | 1.9.12 | clear 10k rows | completed | duration | ms | 17.6696 | best | 25 | 17.134275999997044 | 72.97668500000145 | 21.2029 | 17.6696 | 18.7224 | 28.4181 | 11.0229 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | clear 10k rows | completed | duration | ms | 17.8723 | +1.15% | 25 | 16.907688999999664 | 150.5370230000117 | 25.1252 | 17.8723 | 18.1365 | 64.2552 | 27.1725 |  |
| primitive | mreact | workspace | clear 10k rows | completed | duration | ms | 18.3493 | +3.85% | 25 | 17.4136920000019 | 25.576868000003742 | 19.0342 | 18.3493 | 19.1722 | 24.9459 | 1.954 |  |
| primitive | marko | 5.38.39 | keyed reverse 1k rows | completed | duration | ms | 3.5462 | +141.65% | 25 | 3.4212640000041574 | 9.031202000012854 | 4.269 | 3.5462 | 4.4759 | 7.8645 | 1.3627 |  |
| primitive | qwik | 1.19.2 | keyed reverse 1k rows | completed | duration | ms | 4.7186 | +221.54% | 25 | 4.453359000006458 | 13.25381599998218 | 5.1475 | 4.7186 | 4.9412 | 5.7487 | 1.6804 |  |
| primitive | qwik-v2 | 2.0.0-beta.35 | keyed reverse 1k rows | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | keyed reverse 1k rows | completed | duration | ms | 3.2251 | +119.77% | 25 | 3.174228999996558 | 3.9596290000190493 | 3.2799 | 3.2251 | 3.2449 | 3.6081 | 0.1745 |  |
| primitive | solid | 1.9.12 | keyed reverse 1k rows | completed | duration | ms | 2.4305 | +65.62% | 25 | 2.357320000010077 | 11.898062000022037 | 2.9148 | 2.4305 | 2.5013 | 3.3337 | 1.8543 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | keyed reverse 1k rows | completed | duration | ms | 2.4504 | +66.98% | 25 | 2.340928999998141 | 12.095683999999892 | 2.8823 | 2.4504 | 2.5158 | 3.4771 | 1.8938 |  |
| primitive | mreact | workspace | keyed reverse 1k rows | completed | duration | ms | 1.4675 | best | 25 | 1.4435389999998733 | 4.593473000015365 | 1.7298 | 1.4675 | 1.5012 | 4.5888 | 0.8446 |  |
| primitive | marko | 5.38.39 | create 1k event targets | completed | duration | ms | 10.9361 | +113.23% | 25 | 8.399881999997888 | 22.242036999989068 | 14.2065 | 10.9361 | 19.4441 | 21.2519 | 5.449 |  |
| primitive | qwik | 1.19.2 | create 1k event targets | completed | duration | ms | 12.887 | +151.26% | 25 | 6.380368999991333 | 231.42152299999725 | 21.6135 | 12.887 | 17.0805 | 26.4711 | 43.1929 | Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events.; Qwik event targets use lazy QRL wiring; this case does not dispatch events. |
| primitive | qwik-v2 | 2.0.0-beta.35 | create 1k event targets | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | create 1k event targets | completed | duration | ms | 5.6794 | +10.73% | 25 | 4.940896999993129 | 18.60888299997896 | 8.2536 | 5.6794 | 13.7691 | 15.2871 | 4.5115 |  |
| primitive | solid | 1.9.12 | create 1k event targets | completed | duration | ms | 5.4226 | +5.73% | 25 | 4.931660000002012 | 16.840792000002693 | 9.542 | 5.4226 | 14.7312 | 16.0494 | 5.0459 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | create 1k event targets | completed | duration | ms | 5.1289 | best | 25 | 4.901872999995248 | 16.54881199999363 | 9.1522 | 5.1289 | 14.7795 | 16.3326 | 4.9979 |  |
| primitive | mreact | workspace | create 1k event targets | completed | duration | ms | 5.5626 | +8.46% | 25 | 4.935566999978619 | 428.2536409999884 | 28.4296 | 5.5626 | 16.8519 | 60.1359 | 82.4364 |  |
| primitive | marko | 5.38.39 | text binding update 1k | completed | duration | ms | 0.8577 | +656.35% | 25 | 0.7477979999966919 | 13.197489999991376 | 1.8761 | 0.8577 | 0.9695 | 12.9181 | 3.3011 |  |
| primitive | qwik | 1.19.2 | text binding update 1k | completed | duration | ms | 1.1014 | +871.25% | 25 | 0.9426760000060312 | 11.190359000000171 | 1.6666 | 1.1014 | 1.4069 | 2.3975 | 1.9854 |  |
| primitive | qwik-v2 | 2.0.0-beta.35 | text binding update 1k | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | text binding update 1k | completed | duration | ms | 0.4031 | +255.47% | 25 | 0.3192620000045281 | 1.8990670000202954 | 0.681 | 0.4031 | 0.8155 | 1.8096 | 0.5058 |  |
| primitive | solid | 1.9.12 | text binding update 1k | completed | duration | ms | 0.1134 | best | 25 | 0.10948700000881217 | 1.2612360000202898 | 0.2217 | 0.1134 | 0.1188 | 1.2154 | 0.3046 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | text binding update 1k | completed | duration | ms | 0.1163 | +2.56% | 25 | 0.1116100000217557 | 1.3773349999974016 | 0.2691 | 0.1163 | 0.1251 | 1.2454 | 0.3752 |  |
| primitive | mreact | workspace | text binding update 1k | completed | duration | ms | 0.1174 | +3.53% | 25 | 0.11282299997401424 | 1.2795400000177324 | 0.1751 | 0.1174 | 0.1215 | 0.3482 | 0.23 |  |
| primitive | marko | 5.38.39 | computed fan-out 1k | completed | duration | ms | 0.8697 | +675.83% | 25 | 0.7498020000057295 | 2.7052960000000894 | 1.1491 | 0.8697 | 1.0318 | 2.6563 | 0.6178 |  |
| primitive | qwik | 1.19.2 | computed fan-out 1k | completed | duration | ms | 0.9324 | +731.76% | 25 | 0.8897259999939706 | 2.1836630000034347 | 1.057 | 0.9324 | 1.075 | 1.7769 | 0.2924 |  |
| primitive | qwik-v2 | 2.0.0-beta.35 | computed fan-out 1k | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | computed fan-out 1k | completed | duration | ms | 0.3214 | +186.71% | 25 | 0.30840100001660176 | 1.5946230000117794 | 0.383 | 0.3214 | 0.344 | 0.4293 | 0.2487 |  |
| primitive | solid | 1.9.12 | computed fan-out 1k | completed | duration | ms | 0.1121 | best | 25 | 0.10915599999134429 | 15.362628000002587 | 0.758 | 0.1121 | 0.1154 | 0.7188 | 2.9839 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | computed fan-out 1k | completed | duration | ms | 0.1315 | +17.31% | 25 | 0.11121999999159016 | 1.4175600000016857 | 0.1805 | 0.1315 | 0.1353 | 0.185 | 0.2532 |  |
| primitive | mreact | workspace | computed fan-out 1k | completed | duration | ms | 0.1201 | +7.14% | 25 | 0.11207100001047365 | 0.46113900002092123 | 0.1344 | 0.1201 | 0.1238 | 0.1507 | 0.0673 |  |
| primitive | marko | 5.38.39 | computed fan-in 1k | completed | duration | ms | 0.0129 | +19.44% | 25 | 0.011721999995643273 | 0.018284000019775704 | 0.0133 | 0.0129 | 0.014 | 0.0152 | 0.0014 |  |
| primitive | qwik | 1.19.2 | computed fan-in 1k | completed | duration | ms | 0.0108 | best | 25 | 0.0097890000033658 | 0.02489699999568984 | 0.0118 | 0.0108 | 0.0118 | 0.0155 | 0.003 |  |
| primitive | qwik-v2 | 2.0.0-beta.35 | computed fan-in 1k | unsupported | duration | ms | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | computed fan-in 1k | completed | duration | ms | 0.0314 | +190.74% | 25 | 0.029715999990003183 | 0.2951259999827016 | 0.0432 | 0.0314 | 0.0322 | 0.0501 | 0.0516 |  |
| primitive | solid | 1.9.12 | computed fan-in 1k | completed | duration | ms | 12.7244 | +117718.52% | 25 | 12.652111999981571 | 13.37803999998141 | 12.7922 | 12.7244 | 12.7764 | 13.3004 | 0.1856 |  |
| primitive | solid-v2 | 2.0.0-beta.13 | computed fan-in 1k | completed | duration | ms | 0.0292 | +170.37% | 25 | 0.02763200001209043 | 0.8771830000041518 | 0.1137 | 0.0292 | 0.0429 | 0.508 | 0.202 |  |
| primitive | mreact | workspace | computed fan-in 1k | completed | duration | ms | 0.0293 | +171.3% | 25 | 0.026650000014342368 | 0.3123889999988023 | 0.064 | 0.0293 | 0.0359 | 0.3041 | 0.0885 |  |
| primitive | marko | 5.38.39 | repeated create update clear memory | completed | memory | bytes | 0 |  | 25 | 0 | 55590712 | 6667400 | 0 | 0 | 55585992 | 18055409.2982 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | qwik | 1.19.2 | repeated create update clear memory | completed | memory | bytes | 93899128 |  | 25 | 0 | 105664936 | 82037043.2 | 93899128 | 102069944 | 105094424 | 36144579.5952 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | qwik-v2 | 2.0.0-beta.35 | repeated create update clear memory | unsupported | memory | bytes | 0 |  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | adapter does not implement this case |
| primitive | react | 19.2.6 | repeated create update clear memory | completed | memory | bytes | 13406368 |  | 25 | 0 | 13656808 | 9495928 | 13406368 | 13578912 | 13646608 | 5368601.6145 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | solid | 1.9.12 | repeated create update clear memory | completed | memory | bytes | 0 |  | 25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | solid-v2 | 2.0.0-beta.13 | repeated create update clear memory | completed | memory | bytes | 0 |  | 25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
| primitive | mreact | workspace | repeated create update clear memory | completed | memory | bytes | 1628176 |  | 25 | 0 | 57560896 | 5731401.28 | 1628176 | 1661504 | 57559536 | 15295468.5922 | heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC; heapUsed delta without forced GC |
