# js-framework-benchmark Results

Official krausest/js-framework-benchmark keyed DOM cases run for the primitive benchmark peers that have matching upstream fixtures.
The mreact fixtures use local package builds staged from this checkout, so unreleased runtime changes are included.

## Framework Mapping

| primitive adapter | official fixture |
| --- | --- |
| marko | keyed/marko |
| vue | keyed/vue |
| svelte | keyed/svelte |
| angular | keyed/angular-cf |
| react | keyed/react-hooks |
| mreact react-compat | keyed/mreact-react-compat |
| mreact react-compat (vdom) | keyed/mreact-react-compat-vdom |
| solid | keyed/solid |
| mreact | keyed/mreact |

## Unsupported Primitive Adapters

- qwik: krausest/js-framework-benchmark keyed/qwik currently fails the official isKeyed check and is categorized as non-keyed.
- qwik-v2: krausest/js-framework-benchmark does not currently provide a matching Qwik v2 keyed fixture.
- solid-v2: krausest/js-framework-benchmark does not currently provide a matching Solid v2 keyed fixture.

Raw JSON files are stored in `benchmarks/results/2026-06-20/001/js-framework-benchmark-results`.
Chrome trace files are stored in `benchmarks/results/2026-06-20/001/js-framework-benchmark-traces`.

## Rankings

Lower values are better for all js-framework-benchmark metrics reported here.

### create rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | create rows | 72.9 | 7.8 | 63.8 | best | ms |
| 2 | **mreact-v0.0.177-local-keyed** | create rows | 74.1 | 6.5 | 66.5 | +1.65% | ms |
| 3 | svelte-v5.56.3-keyed | create rows | 76.8 | 11.2 | 64.7 | +5.35% | ms |
| 4 | marko-v6.1.12-keyed | create rows | 77.1 | 7.9 | 68 | +5.76% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | create rows | 87.4 | 21.3 | 64.9 | +19.89% | ms |
| 6 | **mreact-react-compat-v0.0.177-local-keyed** | create rows | 90.1 | 24.4 | 64.3 | +23.59% | ms |
| 7 | react-hooks-v19.2.7-keyed | create rows | 94.1 | 23.9 | 69.1 | +29.08% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.177-local-keyed** | create rows | 101.6 | 34.4 | 65.7 | +39.37% | ms |
| 9 | angular-cf-v22.0.0-keyed | create rows | 105.7 | 19.9 | 67.4 | +44.99% | ms |

### replace all rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.177-local-keyed** | replace all rows | 81.8 | 14.4 | 65.8 | best | ms |
| 2 | solid-v1.9.13-keyed | replace all rows | 85.8 | 16.5 | 67.3 | +4.89% | ms |
| 3 | svelte-v5.56.3-keyed | replace all rows | 87.1 | 19.6 | 65.2 | +6.48% | ms |
| 4 | marko-v6.1.12-keyed | replace all rows | 87.7 | 15.8 | 71.4 | +7.21% | ms |
| 5 | **mreact-react-compat-v0.0.177-local-keyed** | replace all rows | 93.5 | 27.5 | 63.3 | +14.3% | ms |
| 6 | vue-v3.6.0-beta.16-keyed | replace all rows | 98.2 | 27.9 | 69.6 | +20.05% | ms |
| 7 | react-hooks-v19.2.7-keyed | replace all rows | 106.8 | 37.4 | 68.2 | +30.56% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.177-local-keyed** | replace all rows | 112.1 | 44.6 | 66.2 | +37.04% | ms |
| 9 | angular-cf-v22.0.0-keyed | replace all rows | 118.3 | 33.2 | 69.1 | +44.62% | ms |

### partial update

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | partial update | 41.4 | 3.4 | 36.7 | best | ms |
| 2 | marko-v6.1.12-keyed | partial update | 47.7 | 5.6 | 38.9 | +15.22% | ms |
| 3 | svelte-v5.56.3-keyed | partial update | 47.7 | 4 | 40.7 | +15.22% | ms |
| 4 | solid-v1.9.13-keyed | partial update | 47.9 | 3 | 40.6 | +15.7% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | partial update | 55.2 | 6.7 | 44.9 | +33.33% | ms |
| 6 | **mreact-v0.0.177-local-keyed** | partial update | 56 | 2.4 | 49.7 | +35.27% | ms |
| 7 | **mreact-react-compat-v0.0.177-local-keyed** | partial update | 59.1 | 9.1 | 45.9 | +42.75% | ms |
| 8 | react-hooks-v19.2.7-keyed | partial update | 59.8 | 11.1 | 44.5 | +44.44% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.177-local-keyed** | partial update | 72.1 | 23.1 | 45.2 | +74.15% | ms |

### select row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.177-local-keyed** | select row | 8.6 | 0.9 | 6.3 | best | ms |
| 2 | solid-v1.9.13-keyed | select row | 9.5 | 1.9 | 6.2 | +10.47% | ms |
| 3 | vue-v3.6.0-beta.16-keyed | select row | 9.8 | 2.3 | 6.3 | +13.95% | ms |
| 4 | angular-cf-v22.0.0-keyed | select row | 12.6 | 3.9 | 7.6 | +46.51% | ms |
| 5 | react-hooks-v19.2.7-keyed | select row | 13.7 | 5.9 | 6.2 | +59.3% | ms |
| 6 | svelte-v5.56.3-keyed | select row | 13.7 | 6.1 | 6.4 | +59.3% | ms |
| 7 | marko-v6.1.12-keyed | select row | 13.9 | 5.5 | 7.1 | +61.63% | ms |
| 8 | **mreact-react-compat-v0.0.177-local-keyed** | select row | 14 | 6.6 | 6.3 | +62.79% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.177-local-keyed** | select row | 14.8 | 7.2 | 6.3 | +72.09% | ms |

### swap rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.177-local-keyed** | swap rows | 48 | 1.9 | 43 | best | ms |
| 2 | angular-cf-v22.0.0-keyed | swap rows | 48.2 | 2.6 | 43.7 | +0.42% | ms |
| 3 | solid-v1.9.13-keyed | swap rows | 50 | 2.1 | 44 | +4.17% | ms |
| 4 | vue-v3.6.0-beta.16-keyed | swap rows | 50.9 | 2.8 | 44.3 | +6.04% | ms |
| 5 | svelte-v5.56.3-keyed | swap rows | 51.3 | 4.1 | 43.7 | +6.87% | ms |
| 6 | marko-v6.1.12-keyed | swap rows | 52.7 | 4.2 | 44.1 | +9.79% | ms |
| 7 | **mreact-react-compat-v0.0.177-local-keyed** | swap rows | 58.6 | 10.3 | 44.3 | +22.08% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.177-local-keyed** | swap rows | 67.1 | 18.2 | 45.1 | +39.79% | ms |
| 9 | react-hooks-v19.2.7-keyed | swap rows | 332.5 | 51.7 | 275.5 | +592.71% | ms |

### remove row

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | angular-cf-v22.0.0-keyed | remove row | 32.4 | 1.6 | 30.3 | best | ms |
| 2 | **mreact-v0.0.177-local-keyed** | remove row | 35 | 1 | 32.3 | +8.02% | ms |
| 3 | solid-v1.9.13-keyed | remove row | 35.6 | 0.8 | 32.6 | +9.88% | ms |
| 4 | svelte-v5.56.3-keyed | remove row | 35.6 | 1.6 | 32.1 | +9.88% | ms |
| 5 | marko-v6.1.12-keyed | remove row | 37.4 | 3.4 | 32.1 | +15.43% | ms |
| 6 | **mreact-react-compat-v0.0.177-local-keyed** | remove row | 37.7 | 2.7 | 32.6 | +16.36% | ms |
| 7 | react-hooks-v19.2.7-keyed | remove row | 38.1 | 2.6 | 33.1 | +17.59% | ms |
| 8 | vue-v3.6.0-beta.16-keyed | remove row | 40.1 | 5.3 | 32.8 | +23.77% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.177-local-keyed** | remove row | 40.5 | 5.1 | 33.3 | +25% | ms |

### create many rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.177-local-keyed** | create many rows | 784.1 | 70.7 | 704.5 | best | ms |
| 2 | marko-v6.1.12-keyed | create many rows | 796.3 | 82.7 | 704.3 | +1.56% | ms |
| 3 | solid-v1.9.13-keyed | create many rows | 798.4 | 74.7 | 715 | +1.82% | ms |
| 4 | svelte-v5.56.3-keyed | create many rows | 824.1 | 98.3 | 717.1 | +5.1% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | create many rows | 926.2 | 173.7 | 744.3 | +18.12% | ms |
| 6 | **mreact-react-compat-v0.0.177-local-keyed** | create many rows | 962.3 | 248.1 | 705.1 | +22.73% | ms |
| 7 | angular-cf-v22.0.0-keyed | create many rows | 1033.9 | 201.7 | 748 | +31.86% | ms |
| 8 | **mreact-react-compat-vdom-v0.0.177-local-keyed** | create many rows | 1063.8 | 309.1 | 755.5 | +35.67% | ms |
| 9 | react-hooks-v19.2.7-keyed | create many rows | 1261.2 | 479.9 | 768.7 | +60.85% | ms |

### append rows to large table

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.177-local-keyed** | append rows to large table | 84.1 | 8.1 | 74.2 | best | ms |
| 2 | marko-v6.1.12-keyed | append rows to large table | 84.6 | 12.1 | 71.3 | +0.59% | ms |
| 3 | solid-v1.9.13-keyed | append rows to large table | 86.3 | 9.6 | 75.2 | +2.62% | ms |
| 4 | svelte-v5.56.3-keyed | append rows to large table | 89.2 | 12.6 | 75.4 | +6.06% | ms |
| 5 | vue-v3.6.0-beta.16-keyed | append rows to large table | 95.3 | 18.1 | 75.7 | +13.32% | ms |
| 6 | **mreact-react-compat-v0.0.177-local-keyed** | append rows to large table | 103 | 26.1 | 76 | +22.47% | ms |
| 7 | angular-cf-v22.0.0-keyed | append rows to large table | 104 | 16.8 | 72.4 | +23.66% | ms |
| 8 | react-hooks-v19.2.7-keyed | append rows to large table | 104.1 | 24.2 | 77.1 | +23.78% | ms |
| 9 | **mreact-react-compat-vdom-v0.0.177-local-keyed** | append rows to large table | 114.5 | 37.9 | 74.8 | +36.15% | ms |

### clear rows

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.1.12-keyed | clear rows | 30.3 | 25.5 | 3.2 | best | ms |
| 2 | **mreact-v0.0.177-local-keyed** | clear rows | 30.3 | 25.7 | 3.3 | 0% | ms |
| 3 | svelte-v5.56.3-keyed | clear rows | 35.7 | 31.2 | 3.5 | +17.82% | ms |
| 4 | solid-v1.9.13-keyed | clear rows | 37.1 | 32.4 | 3.7 | +22.44% | ms |
| 5 | **mreact-react-compat-vdom-v0.0.177-local-keyed** | clear rows | 42.2 | 37.5 | 3.2 | +39.27% | ms |
| 6 | vue-v3.6.0-beta.16-keyed | clear rows | 47.9 | 43.1 | 3.5 | +58.09% | ms |
| 7 | **mreact-react-compat-v0.0.177-local-keyed** | clear rows | 52.7 | 47.8 | 3.1 | +73.93% | ms |
| 8 | react-hooks-v19.2.7-keyed | clear rows | 58.1 | 53.5 | 3.3 | +91.75% | ms |
| 9 | angular-cf-v22.0.0-keyed | clear rows | 64.1 | 58.4 | 3.9 | +111.55% | ms |

### ready memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | marko-v6.1.12-keyed | ready memory | 1.1 |  |  | best | MB |
| 2 | solid-v1.9.13-keyed | ready memory | 1.1 |  |  | +1.91% | MB |
| 3 | **mreact-v0.0.177-local-keyed** | ready memory | 1.1 |  |  | +5.27% | MB |
| 4 | svelte-v5.56.3-keyed | ready memory | 1.2 |  |  | +13.98% | MB |
| 5 | vue-v3.6.0-beta.16-keyed | ready memory | 1.4 |  |  | +28.95% | MB |
| 6 | **mreact-react-compat-vdom-v0.0.177-local-keyed** | ready memory | 1.4 |  |  | +30.15% | MB |
| 7 | **mreact-react-compat-v0.0.177-local-keyed** | ready memory | 1.4 |  |  | +32.99% | MB |
| 8 | react-hooks-v19.2.7-keyed | ready memory | 1.6 |  |  | +55.63% | MB |
| 9 | angular-cf-v22.0.0-keyed | ready memory | 2 |  |  | +93.92% | MB |

### run memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **mreact-v0.0.177-local-keyed** | run memory | 2.9 |  |  | best | MB |
| 2 | marko-v6.1.12-keyed | run memory | 2.9 |  |  | +1.13% | MB |
| 3 | solid-v1.9.13-keyed | run memory | 3.1 |  |  | +7.33% | MB |
| 4 | svelte-v5.56.3-keyed | run memory | 3.5 |  |  | +22.69% | MB |
| 5 | vue-v3.6.0-beta.16-keyed | run memory | 4.4 |  |  | +53.22% | MB |
| 6 | react-hooks-v19.2.7-keyed | run memory | 4.9 |  |  | +71.25% | MB |
| 7 | **mreact-react-compat-vdom-v0.0.177-local-keyed** | run memory | 4.9 |  |  | +72.3% | MB |
| 8 | angular-cf-v22.0.0-keyed | run memory | 5 |  |  | +74.9% | MB |
| 9 | **mreact-react-compat-v0.0.177-local-keyed** | run memory | 5.3 |  |  | +87.07% | MB |

### repeated clear memory

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | repeated clear memory | 1.2 |  |  | best | MB |
| 2 | **mreact-v0.0.177-local-keyed** | repeated clear memory | 1.3 |  |  | +3.96% | MB |
| 3 | marko-v6.1.12-keyed | repeated clear memory | 1.4 |  |  | +9.75% | MB |
| 4 | svelte-v5.56.3-keyed | repeated clear memory | 1.5 |  |  | +23.04% | MB |
| 5 | vue-v3.6.0-beta.16-keyed | repeated clear memory | 1.6 |  |  | +31.81% | MB |
| 6 | **mreact-react-compat-v0.0.177-local-keyed** | repeated clear memory | 2 |  |  | +57.43% | MB |
| 7 | react-hooks-v19.2.7-keyed | repeated clear memory | 2.5 |  |  | +98.23% | MB |
| 8 | **mreact-react-compat-vdom-v0.0.177-local-keyed** | repeated clear memory | 2.5 |  |  | +102.69% | MB |
| 9 | angular-cf-v22.0.0-keyed | repeated clear memory | 2.6 |  |  | +108.49% | MB |

### total byte weight

| rank | framework | case | value | script | paint | diff vs 1st | unit |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | solid-v1.9.13-keyed | total byte weight | 4.5 |  |  | best | kB |
| 2 | marko-v6.1.12-keyed | total byte weight | 4.8 |  |  | +6.67% | kB |
| 3 | **mreact-v0.0.177-local-keyed** | total byte weight | 9.8 |  |  | +117.78% | kB |
| 4 | svelte-v5.56.3-keyed | total byte weight | 14.3 |  |  | +217.78% | kB |
| 5 | vue-v3.6.0-beta.16-keyed | total byte weight | 23.9 |  |  | +431.11% | kB |
| 6 | **mreact-react-compat-vdom-v0.0.177-local-keyed** | total byte weight | 32.8 |  |  | +628.89% | kB |
| 7 | **mreact-react-compat-v0.0.177-local-keyed** | total byte weight | 34.8 |  |  | +673.33% | kB |
| 8 | angular-cf-v22.0.0-keyed | total byte weight | 44.5 |  |  | +888.89% | kB |
| 9 | react-hooks-v19.2.7-keyed | total byte weight | 51.4 |  |  | +1042.22% | kB |

## Results

| suite | framework | case | status | metric | unit | value | script | paint | diff vs 1st |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create rows | completed | duration | ms | 105.7 | 19.9 | 67.4 | +44.99% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | replace all rows | completed | duration | ms | 118.3 | 33.2 | 69.1 | +44.62% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | partial update | completed | duration | ms | 41.4 | 3.4 | 36.7 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | select row | completed | duration | ms | 12.6 | 3.9 | 7.6 | +46.51% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | swap rows | completed | duration | ms | 48.2 | 2.6 | 43.7 | +0.42% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | remove row | completed | duration | ms | 32.4 | 1.6 | 30.3 | best |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | create many rows | completed | duration | ms | 1033.9 | 201.7 | 748 | +31.86% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | append rows to large table | completed | duration | ms | 104 | 16.8 | 72.4 | +23.66% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | clear rows | completed | duration | ms | 64.1 | 58.4 | 3.9 | +111.55% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | ready memory | completed | memory | MB | 2 |  |  | +93.92% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | run memory | completed | memory | MB | 5 |  |  | +74.9% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | repeated clear memory | completed | memory | MB | 2.6 |  |  | +108.49% |
| js-framework-benchmark | angular-cf-v22.0.0-keyed | total byte weight | completed | size | kB | 44.5 |  |  | +888.89% |
| js-framework-benchmark | marko-v6.1.12-keyed | create rows | completed | duration | ms | 77.1 | 7.9 | 68 | +5.76% |
| js-framework-benchmark | marko-v6.1.12-keyed | replace all rows | completed | duration | ms | 87.7 | 15.8 | 71.4 | +7.21% |
| js-framework-benchmark | marko-v6.1.12-keyed | partial update | completed | duration | ms | 47.7 | 5.6 | 38.9 | +15.22% |
| js-framework-benchmark | marko-v6.1.12-keyed | select row | completed | duration | ms | 13.9 | 5.5 | 7.1 | +61.63% |
| js-framework-benchmark | marko-v6.1.12-keyed | swap rows | completed | duration | ms | 52.7 | 4.2 | 44.1 | +9.79% |
| js-framework-benchmark | marko-v6.1.12-keyed | remove row | completed | duration | ms | 37.4 | 3.4 | 32.1 | +15.43% |
| js-framework-benchmark | marko-v6.1.12-keyed | create many rows | completed | duration | ms | 796.3 | 82.7 | 704.3 | +1.56% |
| js-framework-benchmark | marko-v6.1.12-keyed | append rows to large table | completed | duration | ms | 84.6 | 12.1 | 71.3 | +0.59% |
| js-framework-benchmark | marko-v6.1.12-keyed | clear rows | completed | duration | ms | 30.3 | 25.5 | 3.2 | best |
| js-framework-benchmark | marko-v6.1.12-keyed | ready memory | completed | memory | MB | 1.1 |  |  | best |
| js-framework-benchmark | marko-v6.1.12-keyed | run memory | completed | memory | MB | 2.9 |  |  | +1.13% |
| js-framework-benchmark | marko-v6.1.12-keyed | repeated clear memory | completed | memory | MB | 1.4 |  |  | +9.75% |
| js-framework-benchmark | marko-v6.1.12-keyed | total byte weight | completed | size | kB | 4.8 |  |  | +6.67% |
| js-framework-benchmark | **mreact-react-compat-v0.0.177-local-keyed** | create rows | completed | duration | ms | 90.1 | 24.4 | 64.3 | +23.59% |
| js-framework-benchmark | **mreact-react-compat-v0.0.177-local-keyed** | replace all rows | completed | duration | ms | 93.5 | 27.5 | 63.3 | +14.3% |
| js-framework-benchmark | **mreact-react-compat-v0.0.177-local-keyed** | partial update | completed | duration | ms | 59.1 | 9.1 | 45.9 | +42.75% |
| js-framework-benchmark | **mreact-react-compat-v0.0.177-local-keyed** | select row | completed | duration | ms | 14 | 6.6 | 6.3 | +62.79% |
| js-framework-benchmark | **mreact-react-compat-v0.0.177-local-keyed** | swap rows | completed | duration | ms | 58.6 | 10.3 | 44.3 | +22.08% |
| js-framework-benchmark | **mreact-react-compat-v0.0.177-local-keyed** | remove row | completed | duration | ms | 37.7 | 2.7 | 32.6 | +16.36% |
| js-framework-benchmark | **mreact-react-compat-v0.0.177-local-keyed** | create many rows | completed | duration | ms | 962.3 | 248.1 | 705.1 | +22.73% |
| js-framework-benchmark | **mreact-react-compat-v0.0.177-local-keyed** | append rows to large table | completed | duration | ms | 103 | 26.1 | 76 | +22.47% |
| js-framework-benchmark | **mreact-react-compat-v0.0.177-local-keyed** | clear rows | completed | duration | ms | 52.7 | 47.8 | 3.1 | +73.93% |
| js-framework-benchmark | **mreact-react-compat-v0.0.177-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +32.99% |
| js-framework-benchmark | **mreact-react-compat-v0.0.177-local-keyed** | run memory | completed | memory | MB | 5.3 |  |  | +87.07% |
| js-framework-benchmark | **mreact-react-compat-v0.0.177-local-keyed** | repeated clear memory | completed | memory | MB | 2 |  |  | +57.43% |
| js-framework-benchmark | **mreact-react-compat-v0.0.177-local-keyed** | total byte weight | completed | size | kB | 34.8 |  |  | +673.33% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.177-local-keyed** | create rows | completed | duration | ms | 101.6 | 34.4 | 65.7 | +39.37% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.177-local-keyed** | replace all rows | completed | duration | ms | 112.1 | 44.6 | 66.2 | +37.04% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.177-local-keyed** | partial update | completed | duration | ms | 72.1 | 23.1 | 45.2 | +74.15% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.177-local-keyed** | select row | completed | duration | ms | 14.8 | 7.2 | 6.3 | +72.09% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.177-local-keyed** | swap rows | completed | duration | ms | 67.1 | 18.2 | 45.1 | +39.79% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.177-local-keyed** | remove row | completed | duration | ms | 40.5 | 5.1 | 33.3 | +25% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.177-local-keyed** | create many rows | completed | duration | ms | 1063.8 | 309.1 | 755.5 | +35.67% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.177-local-keyed** | append rows to large table | completed | duration | ms | 114.5 | 37.9 | 74.8 | +36.15% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.177-local-keyed** | clear rows | completed | duration | ms | 42.2 | 37.5 | 3.2 | +39.27% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.177-local-keyed** | ready memory | completed | memory | MB | 1.4 |  |  | +30.15% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.177-local-keyed** | run memory | completed | memory | MB | 4.9 |  |  | +72.3% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.177-local-keyed** | repeated clear memory | completed | memory | MB | 2.5 |  |  | +102.69% |
| js-framework-benchmark | **mreact-react-compat-vdom-v0.0.177-local-keyed** | total byte weight | completed | size | kB | 32.8 |  |  | +628.89% |
| js-framework-benchmark | **mreact-v0.0.177-local-keyed** | create rows | completed | duration | ms | 74.1 | 6.5 | 66.5 | +1.65% |
| js-framework-benchmark | **mreact-v0.0.177-local-keyed** | replace all rows | completed | duration | ms | 81.8 | 14.4 | 65.8 | best |
| js-framework-benchmark | **mreact-v0.0.177-local-keyed** | partial update | completed | duration | ms | 56 | 2.4 | 49.7 | +35.27% |
| js-framework-benchmark | **mreact-v0.0.177-local-keyed** | select row | completed | duration | ms | 8.6 | 0.9 | 6.3 | best |
| js-framework-benchmark | **mreact-v0.0.177-local-keyed** | swap rows | completed | duration | ms | 48 | 1.9 | 43 | best |
| js-framework-benchmark | **mreact-v0.0.177-local-keyed** | remove row | completed | duration | ms | 35 | 1 | 32.3 | +8.02% |
| js-framework-benchmark | **mreact-v0.0.177-local-keyed** | create many rows | completed | duration | ms | 784.1 | 70.7 | 704.5 | best |
| js-framework-benchmark | **mreact-v0.0.177-local-keyed** | append rows to large table | completed | duration | ms | 84.1 | 8.1 | 74.2 | best |
| js-framework-benchmark | **mreact-v0.0.177-local-keyed** | clear rows | completed | duration | ms | 30.3 | 25.7 | 3.3 | 0% |
| js-framework-benchmark | **mreact-v0.0.177-local-keyed** | ready memory | completed | memory | MB | 1.1 |  |  | +5.27% |
| js-framework-benchmark | **mreact-v0.0.177-local-keyed** | run memory | completed | memory | MB | 2.9 |  |  | best |
| js-framework-benchmark | **mreact-v0.0.177-local-keyed** | repeated clear memory | completed | memory | MB | 1.3 |  |  | +3.96% |
| js-framework-benchmark | **mreact-v0.0.177-local-keyed** | total byte weight | completed | size | kB | 9.8 |  |  | +117.78% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create rows | completed | duration | ms | 94.1 | 23.9 | 69.1 | +29.08% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | replace all rows | completed | duration | ms | 106.8 | 37.4 | 68.2 | +30.56% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | partial update | completed | duration | ms | 59.8 | 11.1 | 44.5 | +44.44% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | select row | completed | duration | ms | 13.7 | 5.9 | 6.2 | +59.3% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | swap rows | completed | duration | ms | 332.5 | 51.7 | 275.5 | +592.71% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | remove row | completed | duration | ms | 38.1 | 2.6 | 33.1 | +17.59% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | create many rows | completed | duration | ms | 1261.2 | 479.9 | 768.7 | +60.85% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | append rows to large table | completed | duration | ms | 104.1 | 24.2 | 77.1 | +23.78% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | clear rows | completed | duration | ms | 58.1 | 53.5 | 3.3 | +91.75% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | ready memory | completed | memory | MB | 1.6 |  |  | +55.63% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | run memory | completed | memory | MB | 4.9 |  |  | +71.25% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | repeated clear memory | completed | memory | MB | 2.5 |  |  | +98.23% |
| js-framework-benchmark | react-hooks-v19.2.7-keyed | total byte weight | completed | size | kB | 51.4 |  |  | +1042.22% |
| js-framework-benchmark | solid-v1.9.13-keyed | create rows | completed | duration | ms | 72.9 | 7.8 | 63.8 | best |
| js-framework-benchmark | solid-v1.9.13-keyed | replace all rows | completed | duration | ms | 85.8 | 16.5 | 67.3 | +4.89% |
| js-framework-benchmark | solid-v1.9.13-keyed | partial update | completed | duration | ms | 47.9 | 3 | 40.6 | +15.7% |
| js-framework-benchmark | solid-v1.9.13-keyed | select row | completed | duration | ms | 9.5 | 1.9 | 6.2 | +10.47% |
| js-framework-benchmark | solid-v1.9.13-keyed | swap rows | completed | duration | ms | 50 | 2.1 | 44 | +4.17% |
| js-framework-benchmark | solid-v1.9.13-keyed | remove row | completed | duration | ms | 35.6 | 0.8 | 32.6 | +9.88% |
| js-framework-benchmark | solid-v1.9.13-keyed | create many rows | completed | duration | ms | 798.4 | 74.7 | 715 | +1.82% |
| js-framework-benchmark | solid-v1.9.13-keyed | append rows to large table | completed | duration | ms | 86.3 | 9.6 | 75.2 | +2.62% |
| js-framework-benchmark | solid-v1.9.13-keyed | clear rows | completed | duration | ms | 37.1 | 32.4 | 3.7 | +22.44% |
| js-framework-benchmark | solid-v1.9.13-keyed | ready memory | completed | memory | MB | 1.1 |  |  | +1.91% |
| js-framework-benchmark | solid-v1.9.13-keyed | run memory | completed | memory | MB | 3.1 |  |  | +7.33% |
| js-framework-benchmark | solid-v1.9.13-keyed | repeated clear memory | completed | memory | MB | 1.2 |  |  | best |
| js-framework-benchmark | solid-v1.9.13-keyed | total byte weight | completed | size | kB | 4.5 |  |  | best |
| js-framework-benchmark | svelte-v5.56.3-keyed | create rows | completed | duration | ms | 76.8 | 11.2 | 64.7 | +5.35% |
| js-framework-benchmark | svelte-v5.56.3-keyed | replace all rows | completed | duration | ms | 87.1 | 19.6 | 65.2 | +6.48% |
| js-framework-benchmark | svelte-v5.56.3-keyed | partial update | completed | duration | ms | 47.7 | 4 | 40.7 | +15.22% |
| js-framework-benchmark | svelte-v5.56.3-keyed | select row | completed | duration | ms | 13.7 | 6.1 | 6.4 | +59.3% |
| js-framework-benchmark | svelte-v5.56.3-keyed | swap rows | completed | duration | ms | 51.3 | 4.1 | 43.7 | +6.87% |
| js-framework-benchmark | svelte-v5.56.3-keyed | remove row | completed | duration | ms | 35.6 | 1.6 | 32.1 | +9.88% |
| js-framework-benchmark | svelte-v5.56.3-keyed | create many rows | completed | duration | ms | 824.1 | 98.3 | 717.1 | +5.1% |
| js-framework-benchmark | svelte-v5.56.3-keyed | append rows to large table | completed | duration | ms | 89.2 | 12.6 | 75.4 | +6.06% |
| js-framework-benchmark | svelte-v5.56.3-keyed | clear rows | completed | duration | ms | 35.7 | 31.2 | 3.5 | +17.82% |
| js-framework-benchmark | svelte-v5.56.3-keyed | ready memory | completed | memory | MB | 1.2 |  |  | +13.98% |
| js-framework-benchmark | svelte-v5.56.3-keyed | run memory | completed | memory | MB | 3.5 |  |  | +22.69% |
| js-framework-benchmark | svelte-v5.56.3-keyed | repeated clear memory | completed | memory | MB | 1.5 |  |  | +23.04% |
| js-framework-benchmark | svelte-v5.56.3-keyed | total byte weight | completed | size | kB | 14.3 |  |  | +217.78% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | create rows | completed | duration | ms | 87.4 | 21.3 | 64.9 | +19.89% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | replace all rows | completed | duration | ms | 98.2 | 27.9 | 69.6 | +20.05% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | partial update | completed | duration | ms | 55.2 | 6.7 | 44.9 | +33.33% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | select row | completed | duration | ms | 9.8 | 2.3 | 6.3 | +13.95% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | swap rows | completed | duration | ms | 50.9 | 2.8 | 44.3 | +6.04% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | remove row | completed | duration | ms | 40.1 | 5.3 | 32.8 | +23.77% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | create many rows | completed | duration | ms | 926.2 | 173.7 | 744.3 | +18.12% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | append rows to large table | completed | duration | ms | 95.3 | 18.1 | 75.7 | +13.32% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | clear rows | completed | duration | ms | 47.9 | 43.1 | 3.5 | +58.09% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | ready memory | completed | memory | MB | 1.4 |  |  | +28.95% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | run memory | completed | memory | MB | 4.4 |  |  | +53.22% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | repeated clear memory | completed | memory | MB | 1.6 |  |  | +31.81% |
| js-framework-benchmark | vue-v3.6.0-beta.16-keyed | total byte weight | completed | size | kB | 23.9 |  |  | +431.11% |
