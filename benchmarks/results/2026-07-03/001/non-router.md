| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 773.995 | ms |
| virtual measured tail refresh | 8.654 | ms |
| virtual subscribed measured tail refresh | 34.499 | ms |
| virtual 60 frame scroll refresh 100k rows | 11.897 | ms |
| virtual stale measured refresh | 32.311 | ms |
| virtual repeated scrollToKey large list head middle tail | 46.053 | ms |
| query deep-key observer updates | 93.730 | ms |
| query notification fanout 1k observers | 80.555 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 88.238 | ms |
| forms many schema issues on one field | 2.934 | ms |
| forms 100 field sequential key input | 8.942 | ms |
| auth current session with large payload | 32.141 | ms |
