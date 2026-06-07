| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 39.793 | ms |
| virtual measured tail refresh | 23.230 | ms |
| virtual subscribed measured tail refresh | 36.531 | ms |
| virtual 60 frame scroll refresh 100k rows | 12.897 | ms |
| virtual stale measured refresh | 37.312 | ms |
| virtual repeated scrollToKey large list head middle tail | 29.159 | ms |
| query deep-key observer updates | 131.590 | ms |
| query notification fanout 1k observers | 76.934 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 72.720 | ms |
| forms many schema issues on one field | 54.209 | ms |
| forms 100 field sequential key input | 9.349 | ms |
| auth current session with large payload | 38.685 | ms |
