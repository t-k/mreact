| Benchmark | Value | Unit |
| --- | ---: | --- |
| store.select selector calls after disposed scopes | 10000.000 | calls |
| store.select cleanup-scope churn then update | 38.267 | ms |
| virtual measured tail refresh | 23.319 | ms |
| virtual subscribed measured tail refresh | 37.575 | ms |
| virtual 60 frame scroll refresh 100k rows | 22.664 | ms |
| virtual stale measured refresh | 20.220 | ms |
| virtual repeated scrollToKey large list head middle tail | 43.292 | ms |
| query deep-key observer updates | 90.796 | ms |
| query notification fanout 1k observers | 78.215 | ms |
| query infinite retained cache entries after 500 pages | 1.000 | count |
| query infinite fetch 500 pages | 55.653 | ms |
| forms many schema issues on one field | 2.464 | ms |
| forms 100 field sequential key input | 6.843 | ms |
| auth current session with large payload | 32.528 | ms |
